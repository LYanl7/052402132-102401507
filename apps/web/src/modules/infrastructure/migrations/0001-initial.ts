export const migrationTableSql = `
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    `;

export const initialSchemaSql = `
        CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,name TEXT NOT NULL,bio TEXT NOT NULL DEFAULT '愿每件失物都能回家',created_at TEXT NOT NULL);
        CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
        CREATE TABLE posts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),type TEXT NOT NULL CHECK(type IN ('lost','found')),title TEXT NOT NULL,category TEXT NOT NULL,location TEXT NOT NULL,occurred_at TEXT NOT NULL,description TEXT NOT NULL,contact TEXT NOT NULL,images TEXT NOT NULL DEFAULT '[]',lat REAL,lng REAL,status TEXT NOT NULL CHECK(status IN ('active','draft','completed')),views INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
        CREATE TABLE uploads(path TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
        CREATE TABLE favorites(user_id TEXT NOT NULL REFERENCES users(id),post_id TEXT NOT NULL REFERENCES posts(id),created_at TEXT NOT NULL,PRIMARY KEY(user_id,post_id));
        CREATE TABLE history(user_id TEXT NOT NULL REFERENCES users(id),post_id TEXT NOT NULL REFERENCES posts(id),viewed_at TEXT NOT NULL,PRIMARY KEY(user_id,post_id));
        CREATE TABLE conversations(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES posts(id),user_a TEXT NOT NULL REFERENCES users(id),user_b TEXT NOT NULL REFERENCES users(id),updated_at TEXT NOT NULL,CHECK(user_a<>user_b),UNIQUE(post_id,user_a,user_b));
        CREATE TABLE chat_messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),sender_id TEXT NOT NULL REFERENCES users(id),content TEXT NOT NULL,client_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(sender_id,client_id));
        CREATE TABLE conversation_reads(conversation_id TEXT NOT NULL REFERENCES conversations(id),user_id TEXT NOT NULL REFERENCES users(id),last_read_rowid INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(conversation_id,user_id));
        CREATE INDEX posts_public ON posts(status,deleted_at,created_at);
        CREATE INDEX posts_owner ON posts(user_id,status);
        CREATE INDEX chat_timeline ON chat_messages(conversation_id,created_at);
        CREATE INDEX session_expiry ON sessions(expires_at);
      `;
