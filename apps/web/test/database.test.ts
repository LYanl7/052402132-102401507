import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { count } from 'drizzle-orm';
import { Database } from '../src/modules/infrastructure/database.ts';
import {
  migrationTableSql,
  initialSchemaSql,
} from '../src/modules/infrastructure/migrations/0001-initial.ts';
import { schemaMigrations } from '../src/modules/infrastructure/schema.ts';
import { findPost, insertPost, searchPosts } from '../src/modules/message/repository.ts';
import { querySchema } from '../src/modules/message/schemas.ts';
import { findSessionUser, findUserByEmail, insertUser } from '../src/modules/user/repository.ts';
import { recordPostView } from '../src/modules/interaction/repository.ts';
import {
  findChatHistory,
  findConversations,
  saveReadCursors,
} from '../src/modules/private-chat/repository.ts';
import { sendMessage } from '../src/modules/private-chat/service.ts';

test('ORM opens a node:sqlite v1 database without changing rows, cursors or constraints', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mayoimon-legacy-'));
  const path = join(dir, 'legacy.sqlite');
  const now = new Date().toISOString();
  let db: Database | undefined;
  try {
    // Build the legacy file with the previous driver and immutable v1 DDL.
    const legacy = new DatabaseSync(path);
    try {
      legacy.exec(migrationTableSql + initialSchemaSql);
      legacy.prepare('INSERT INTO schema_migrations VALUES(1,?)').run(now);
      for (const id of ['alice', 'bob']) {
        legacy
          .prepare('INSERT INTO users(id,email,password_hash,name,created_at) VALUES(?,?,?,?,?)')
          .run(id, id.toUpperCase() + '@example.com', 'legacy-hash', id, now);
      }
      legacy
        .prepare('INSERT INTO sessions VALUES(?,?,?)')
        .run('legacy-session', 'alice', Date.now() + 60000);
      legacy
        .prepare(
          'INSERT INTO posts(id,user_id,type,title,category,location,occurred_at,description,contact,images,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          'post',
          'alice',
          'lost',
          '钥匙',
          'keys',
          '图书馆',
          now,
          '蓝色挂件',
          '站内联系',
          '["/uploads/legacy.png"]',
          'active',
          now,
          now,
        );
      legacy.prepare('INSERT INTO favorites VALUES(?,?,?)').run('bob', 'post', now);
      legacy
        .prepare('INSERT INTO conversations VALUES(?,?,?,?,?)')
        .run('chat', 'post', 'alice', 'bob', now);
      for (const rowid of [7, 19]) {
        legacy
          .prepare(
            'INSERT INTO chat_messages(rowid,id,conversation_id,sender_id,content,client_id,created_at) VALUES(?,?,?,?,?,?,?)',
          )
          .run(rowid, 'message-' + rowid, 'chat', 'bob', '消息-' + rowid, 'client-' + rowid, now);
      }
      legacy.prepare('INSERT INTO conversation_reads VALUES(?,?,?)').run('chat', 'alice', 7);
    } finally {
      legacy.close();
    }

    db = new Database(path);
    assert.equal(findUserByEmail(db, 'alice@example.com')?.passwordHash, 'legacy-hash');
    assert.equal(findSessionUser(db, 'legacy-session', Date.now())?.id, 'alice');
    assert.deepEqual(findPost(db, 'post', 'bob')?.images, ['/uploads/legacy.png']);
    assert.equal(findPost(db, 'post', 'bob')?.favorite, true);
    assert.equal('deletedAt' in findPost(db, 'post')!, false);
    assert.deepEqual(
      findChatHistory(db, 'chat', Number.MAX_SAFE_INTEGER, 1).map((m) => m.cursor),
      [19],
    );
    assert.deepEqual(
      findChatHistory(db, 'chat', 19, 1).map((m) => m.cursor),
      [7],
    );
    assert.equal(findConversations(db, 'alice')[0].unread, 1);
    assert.equal(findConversations(db, 'alice')[0].lastMessage, '消息-19');
    saveReadCursors(db, ['chat'], 'alice');
    assert.equal(findConversations(db, 'alice')[0].unread, 0);
    sendMessage(db, 'chat', 'bob', {
      content: '新消息',
      deviceId: 'new-device',
      seqId: 1,
      queuedAt: new Date().toISOString(),
    });
    assert.equal(findChatHistory(db, 'chat', Number.MAX_SAFE_INTEGER, 1)[0].cursor, 20);
    assert.equal(findConversations(db, 'alice')[0].unread, 1);

    assert.throws(() =>
      insertUser(db!, {
        id: 'duplicate',
        email: 'alice@example.com',
        passwordHash: 'x',
        name: 'duplicate',
        createdAt: now,
      }),
    );
    // A failure after incrementing views must roll back the whole repository operation.
    assert.throws(() => recordPostView(db!, 'post', 'nonexistent-user', now));
    assert.equal(findPost(db, 'post')?.views, 0);
    recordPostView(db, 'post', 'bob', now);
    assert.equal(findPost(db, 'post')?.views, 1);

    db.close();
    db = new Database(path);
    assert.equal(findPost(db, 'post')?.views, 1);
    assert.equal(findConversations(db, 'alice')[0].unread, 1);
    assert.equal(db.orm.select({ count: count() }).from(schemaMigrations).get()?.count, 2);
  } finally {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ORM search keeps literal keywords, visibility and rowid pagination for equal timestamps', () => {
  const db = new Database(':memory:');
  try {
    const now = '2026-01-01T00:00:00.000Z';
    insertUser(db, {
      id: 'owner',
      email: 'owner@example.com',
      passwordHash: 'x',
      name: 'owner',
      createdAt: now,
    });
    for (const id of ['first', 'second', 'draft', 'completed', 'deleted']) {
      insertPost(db, {
        id,
        userId: 'owner',
        type: 'lost',
        title: id === 'first' ? "100%_' OR 1=1" : id,
        category: 'keys',
        location: '图书馆',
        occurredAt: now,
        description: '物品',
        contact: '站内联系',
        images: [],
        status: id === 'draft' ? 'draft' : id === 'completed' ? 'completed' : 'active',
        deletedAt: id === 'deleted' ? now : null,
        createdAt: now,
        updatedAt: now,
      });
    }
    const literal = searchPosts(db, querySchema.parse({ q: "%_' OR 1=1" }));
    assert.deepEqual(
      literal.items.map((p) => p.id),
      ['first'],
    );
    const newest = searchPosts(db, querySchema.parse({ pageSize: 1 }));
    assert.equal(newest.total, 3);
    assert.deepEqual(
      newest.items.map((p) => p.id),
      ['completed'],
    );
    assert.deepEqual(
      searchPosts(db, querySchema.parse({ page: 2, pageSize: 1 })).items.map((p) => p.id),
      ['second'],
    );
    assert.deepEqual(
      searchPosts(db, querySchema.parse({ sort: 'oldest' })).items.map((p) => p.id),
      ['first', 'second', 'completed'],
    );
  } finally {
    db.close();
  }
});
