'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Frame, Header, AuthGate, Loading, ErrorState, Empty } from '@/components/ui';
import { useSession } from '@/components/providers';
import { dateLabel, errorMessage } from '@/lib/api';
import { useLocalConversations } from '@/components/chat-hooks';
import { readAllLocal } from '@/lib/chat-store';
import { chatApi } from '@/lib/chat-sync';
function Messages() {
  const { user, connected, toast } = useSession();
  const [unreadOnly, setUnreadOnly] = useState(false),
    [busy, setBusy] = useState(false);
  const result = useLocalConversations(user?.id);
  const items = result.data ?? [];
  async function readAll() {
    setBusy(true);
    try {
      await readAllLocal(user!.id);
      void chatApi(user!.id, '/chats/read-all', { method: 'POST' }).catch(() => {});
      result.reload();
      toast('已全部标记为已读');
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="message-tools">
        <span className="connection">
          <i className={connected ? 'online' : ''} />
          {connected ? '实时消息已连接' : '正在重连，自动同步消息'}
        </span>
        <button className="text-button muted" disabled={busy} onClick={() => void readAll()}>
          全部已读
        </button>
      </div>
      <div className="message-tabs">
        <button className={!unreadOnly ? 'selected' : ''} onClick={() => setUnreadOnly(false)}>
          全部 {items.length}
        </button>
        <button className={unreadOnly ? 'selected' : ''} onClick={() => setUnreadOnly(true)}>
          未读 {items.filter((c) => c.unread > 0).length}
        </button>
      </div>
      {result.loading && !result.data ? (
        <Loading />
      ) : result.error ? (
        <ErrorState message={result.error} retry={result.reload} />
      ) : (
        <div className="conversation-list">
          {items
            .filter((c) => !unreadOnly || c.unread > 0)
            .map((c) => (
              <Link className="conversation-row" key={c.id} href={'/messages/' + c.id}>
                <div className="avatar">
                  {c.peer.name.slice(0, 1)}
                  {c.unread > 0 && <span className="unread-dot" />}
                </div>
                <div className="conversation-body">
                  <div>
                    <strong>{c.peer.name}</strong>
                    <time>{dateLabel(c.updatedAt)}</time>
                  </div>
                  <p className="clamp">{c.lastMessage || '开始核对物品细节'}</p>
                  <span className="small muted">关于：{c.postTitle}</span>
                </div>
              </Link>
            ))}
          {!items.filter((c) => !unreadOnly || c.unread > 0).length && (
            <Empty
              text={unreadOnly ? '暂时没有未读消息' : '从物品详情发起联系，会话会显示在这里'}
            />
          )}
        </div>
      )}
      <p className="message-note muted small">联系与认领记录会显示在这里</p>
    </>
  );
}
export default function MessagesPage() {
  return (
    <Frame>
      <Header title="消息" />
      <AuthGate>
        <Messages />
      </AuthGate>
    </Frame>
  );
}
