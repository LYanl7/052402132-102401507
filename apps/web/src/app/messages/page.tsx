'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Conversation } from '@mayoimon/shared';
import { Frame, Header, AuthGate, Loading, ErrorState, Empty } from '@/components/ui';
import { useSession, useResource } from '@/components/providers';
import { api, dateLabel, errorMessage } from '@/lib/api';
function Messages() {
  const { lastMessage, connected, revision, toast } = useSession();
  const [tick, setTick] = useState(0),
    [unreadOnly, setUnreadOnly] = useState(false),
    [busy, setBusy] = useState(false);
  const result = useResource<{ items: Conversation[] }>(
    '/chats',
    `${lastMessage?.id ?? ''}:${revision}:${tick}`,
  );
  useEffect(() => {
    if (connected) return;
    const timer = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [connected]);
  const items = result.data?.items ?? [];
  async function readAll() {
    setBusy(true);
    try {
      await api('/chats/read-all', { method: 'POST' });
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
