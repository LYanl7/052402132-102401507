'use client';
import { use, useEffect, useState, useRef, type FormEvent } from 'react';
import Link from 'next/link';
import { Frame, Header, AuthGate, Loading, ErrorState } from '@/components/ui';
import { useSession } from '@/components/providers';
import { useLocalMessages, useLocalConversations } from '@/components/chat-hooks';
import { queueMessage, readLocalMessages } from '@/lib/chat-store';
import { reconcileConversation, chatApi } from '@/lib/chat-sync';
import { dateLabel, errorMessage } from '@/lib/api';
function Chat({ id }: { id: string }) {
  const { user, connected } = useSession();
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [limit, setLimit] = useState(50),
    [visibility, setVisibility] = useState(0);
  const end = useRef<HTMLDivElement>(null),
    sending = useRef(false);
  const history = useLocalMessages(user?.id, id, limit);
  const chats = useLocalConversations(user?.id);
  const conversation = chats.data?.find((c) => c.id === id);
  const messages = history.data?.items ?? [];
  useEffect(() => {
    setLimit(50);
    setText('');
    setError('');
    if (!user) return;
    const abort = new AbortController();
    void reconcileConversation(user.id, id, abort.signal).catch((error) => {
      if (!abort.signal.aborted) setError('暂未完成对账，本地记录仍可查看。' + errorMessage(error));
    });
    return () => abort.abort();
  }, [user?.id, id]);
  useEffect(() => {
    const focus = () => setVisibility((n) => n + 1);
    document.addEventListener('visibilitychange', focus);
    return () => document.removeEventListener('visibilitychange', focus);
  }, []);
  const unreadIds = JSON.stringify(
    messages.filter((m) => !m.read && m.state === 'sent').map((m) => m.id),
  );
  useEffect(() => {
    if (!user || document.visibilityState !== 'visible') return;
    const ids: string[] = JSON.parse(unreadIds);
    if (!ids.length) return;
    void (async () => {
      await readLocalMessages(user.id, ids);
      for (let offset = 0; offset < ids.length; offset += 100)
        await chatApi(user.id, '/chats/' + id + '/read', {
          method: 'POST',
          body: JSON.stringify({ ids: ids.slice(offset, offset + 100) }),
        });
    })().catch(() => {});
  }, [user?.id, id, unreadIds, visibility]);
  const newest = messages.at(-1)?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [newest]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!user || !text.trim() || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await queueMessage(user.id, id, text);
      setText('');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
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
      <p className="message-note muted small">
        记录保存在当前浏览器；服务端仅保留最近 7 天用于补发。
      </p>
      <div className="chat-messages">
        {history.data && history.data.total > limit && (
          <button className="text-button load-older" onClick={() => setLimit((n) => n + 50)}>
            加载更早的消息
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
                <div>
                  <p>{m.content}</p>
                  {m.state === 'pending' && (
                    <span className="small muted">待发送，联网后自动重试</span>
                  )}
                  {m.state === 'failed' && (
                    <span className="small form-error">发送失败：{m.failure}</span>
                  )}
                </div>
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
        <Chat key={id} id={id} />
      </AuthGate>
    </Frame>
  );
}
