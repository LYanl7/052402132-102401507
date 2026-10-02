'use client';
import { use, useEffect, useState, useRef, type FormEvent } from 'react';
import Link from 'next/link';
import type { ChatMessage, Conversation } from '@mayoimon/shared';
import { Frame, Header, AuthGate, Loading, ErrorState } from '@/components/ui';
import { useSession, useResource } from '@/components/providers';
import { api, dateLabel, errorMessage } from '@/lib/api';
interface History {
  items: ChatMessage[];
  nextCursor: number | null;
}
function Chat({ id }: { id: string }) {
  const { user, lastMessage, connected, revision } = useSession();
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [older, setOlder] = useState<ChatMessage[]>([]),
    [cursor, setCursor] = useState<number | null>(null),
    [loadingOlder, setLoadingOlder] = useState(false),
    [tick, setTick] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  const pending = useRef<{ content: string; clientId: string } | null>(null);
  const chats = useResource<{ items: Conversation[] }>('/chats', revision);
  const history = useResource<History>(
    '/chats/' + id + '/messages',
    `${lastMessage?.conversationId === id ? lastMessage.id : ''}:${revision}:${tick}`,
  );
  const conversation = chats.data?.items.find((c) => c.id === id);
  useEffect(() => {
    setOlder([]);
    setCursor(null);
    pending.current = null;
  }, [id]);
  useEffect(() => {
    if (history.data && !older.length) setCursor(history.data.nextCursor);
  }, [history.data, older.length]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!connected && document.visibilityState === 'visible') setTick((n) => n + 1);
    }, 5000);
    const focus = () => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', focus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [connected]);
  const newest = history.data?.items.at(-1)?.id;
  useEffect(() => {
    if (history.data && document.visibilityState === 'visible')
      void api('/chats/' + id + '/read', { method: 'POST' }).catch(() => {});
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [id, newest, tick]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    if (pending.current?.content !== text.trim())
      pending.current = { content: text.trim(), clientId: crypto.randomUUID() };
    try {
      await api('/chats/' + id + '/messages', {
        method: 'POST',
        body: JSON.stringify(pending.current),
      });
      setText('');
      pending.current = null;
      history.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function loadOlder() {
    if (cursor === null) return;
    setLoadingOlder(true);
    try {
      const data = await api<History>('/chats/' + id + '/messages?before=' + cursor);
      setOlder((items) => [...data.items, ...items]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingOlder(false);
    }
  }
  const merged = new Map<string, ChatMessage>();
  for (const message of [...older, ...(history.data?.items ?? [])]) merged.set(message.id, message);
  const messages = Array.from(merged.values());
  return (
    <>
      <Header
        title={conversation?.peer.name ?? '会话详情'}
        back
        action={<span className="small muted">{connected ? '实时连接' : '同步中'}</span>}
      />
      {conversation && (
        <Link className="chat-post" href={'/posts/' + conversation.postId}>
          正在核对：{conversation.postTitle} <span>查看物品 →</span>
        </Link>
      )}
      <div className="chat-messages">
        {cursor !== null && (
          <button
            className="text-button load-older"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
          >
            {loadingOlder ? '加载中…' : '加载更早的消息'}
          </button>
        )}
        {history.loading && !history.data ? (
          <Loading />
        ) : history.error ? (
          <ErrorState message={history.error} retry={history.reload} />
        ) : (
          messages.map((m, i) => (
            <div key={m.id}>
              {(i === 0 ||
                new Date(m.createdAt).getTime() - new Date(messages[i - 1].createdAt).getTime() >
                  5 * 60000) && <time className="chat-time">{dateLabel(m.createdAt)}</time>}
              <div className={`chat-message ${m.senderId === user?.id ? 'outgoing' : 'incoming'}`}>
                {m.senderId !== user?.id && (
                  <div className="avatar small-avatar">
                    {conversation?.peer.name.slice(0, 1) ?? '同'}
                  </div>
                )}
                <p>{m.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={end} />
      </div>
      <form className="chat-composer" onSubmit={send}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <input
            aria-label="发送消息"
            placeholder="发送消息…"
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
          />
          <button className="primary" disabled={busy || !text.trim()}>
            {busy ? '发送中' : '发送'}
          </button>
        </div>
      </form>
    </>
  );
}
export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Frame nav={false}>
      <AuthGate>
        <Chat id={id} />
      </AuthGate>
    </Frame>
  );
}
