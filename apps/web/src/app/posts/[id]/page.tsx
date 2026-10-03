'use client';
import { use, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, Eye } from 'lucide-react';
import type { Post } from '../../../modules/message/models.ts';
import type { Conversation } from '../../../modules/private-chat/models.ts';
import { Frame, Header, Loading, ErrorState, Illustration, Badge, Modal } from '@/components/ui';
import { useSession, useResource } from '@/components/providers';
import { api, dateLabel, errorMessage } from '@/lib/api';
import { queueMessage, saveConversations } from '@/modules/private-chat/store';
import { chatApi } from '@/modules/private-chat/sync';
export default function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, revision, toast } = useSession();
  const result = useResource<{ post: Post }>('/posts/' + id, revision);
  const post = result.data?.post;
  const [contact, setContact] = useState(false),
    [text, setText] = useState('你好，我想进一步核对这件物品，方便联系吗？'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [photo, setPhoto] = useState<string | null>(null);
  const router = useRouter();
  const viewed = useRef('');
  useEffect(() => {
    if (post && viewed.current !== id) {
      viewed.current = id;
      void api('/interactions/posts/' + id + '/view', { method: 'POST' })
        .then(() =>
          result.setData((previous) =>
            previous ? { post: { ...previous.post, views: previous.post.views + 1 } } : previous,
          ),
        )
        .catch(() => {});
    }
  }, [post?.id, id]);
  function login() {
    router.push('/login?next=' + encodeURIComponent('/posts/' + id));
  }
  async function favorite() {
    if (!user) {
      login();
      return;
    }
    if (!post) return;
    setBusy(true);
    try {
      const value = await api<{ favorite: boolean }>('/interactions/favorites/' + id, {
        method: post.favorite ? 'DELETE' : 'PUT',
      });
      result.setData({ post: { ...post, favorite: value.favorite } });
      toast(value.favorite ? '已收藏' : '已取消收藏');
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setBusy(true);
    setError('');
    try {
      const { conversation } = await chatApi<{ conversation: Conversation }>(user!.id, '/chats', {
        method: 'POST',
        body: JSON.stringify({ postId: id }),
      });
      await saveConversations(user!.id, [conversation]);
      await queueMessage(user!.id, conversation.id, text);
      router.push('/messages/' + conversation.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame nav={false}>
      <Header title="信息详情" back />
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState message={result.error} retry={result.reload} />
      ) : (
        post && (
          <>
            <div className="detail-hero" onClick={() => post.images[0] && setPhoto(post.images[0])}>
              <Illustration post={post} large />
            </div>
            {post.images.length > 1 && (
              <div className="photo-strip">
                {post.images.map((path) => (
                  <button key={path} onClick={() => setPhoto(path)}>
                    <img src={path} alt="物品照片" />
                  </button>
                ))}
              </div>
            )}
            <section className="detail-summary">
              <div className="detail-title">
                <Badge type={post.type} />
                <h2>{post.title || '未命名草稿'}</h2>
              </div>
              <p className="muted small">
                <Eye size={14} />
                {post.views} 次浏览{' '}
                <span className="state-label">
                  {post.status === 'completed'
                    ? '已完成'
                    : post.status === 'draft'
                      ? '草稿'
                      : post.type === 'lost'
                        ? '寻找中'
                        : '待认领'}
                </span>
              </p>
              <p className="description">{post.description}</p>
            </section>
            <section className="detail-section">
              <h2>物品信息</h2>
              <dl>
                <dt>{post.type === 'lost' ? '丢失' : '拾取'}时间</dt>
                <dd>{dateLabel(post.occurredAt)}</dd>
                <dt>{post.type === 'lost' ? '丢失' : '拾取'}地点</dt>
                <dd>{post.location || '待补充'}</dd>
                <dt>物品特征</dt>
                <dd>{post.description || '待补充'}</dd>
                <dt>联系方式</dt>
                <dd>{post.contact || '站内联系'}</dd>
              </dl>
            </section>
            <section className="detail-section">
              <h2>发布者</h2>
              <div className="person-row">
                <div className="avatar">{post.author.name.slice(0, 1)}</div>
                <div>
                  <strong>{post.author.name}</strong>
                  <p className="muted small">发布于 {dateLabel(post.createdAt)}</p>
                </div>
              </div>
            </section>
            <p className="detail-tip muted small">交接前请核验物品细节，确认归属后再完成交接。</p>
            <div className="detail-actions">
              <button
                className={post.favorite ? 'favorite-on' : ''}
                onClick={() => void favorite()}
                disabled={busy}
              >
                <Heart size={22} fill={post.favorite ? 'currentColor' : 'none'} />
                {post.favorite ? '已收藏' : '收藏'}
              </button>
              {post.userId === user?.id ? (
                <Link className="primary" href="/my-posts">
                  管理我的发布
                </Link>
              ) : (
                <button
                  className="primary"
                  disabled={post.status !== 'active' || busy}
                  onClick={() => {
                    if (!user) {
                      login();
                      return;
                    }
                    setContact(true);
                  }}
                >
                  {post.status === 'completed'
                    ? '信息已完成'
                    : post.type === 'lost'
                      ? '联系发布者'
                      : '联系拾取人'}
                </button>
              )}
            </div>
          </>
        )
      )}
      {contact && (
        <Modal title="发起站内联系" onClose={() => setContact(false)}>
          <p className="muted">可先发送一条消息，核对物品细节。</p>
          <textarea
            autoFocus
            aria-label="联系内容"
            rows={4}
            maxLength={2000}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="secondary" onClick={() => setContact(false)}>
              取消
            </button>
            <button className="primary" disabled={busy || !text.trim()} onClick={() => void send()}>
              {busy ? '发送中…' : '发送消息'}
            </button>
          </div>
        </Modal>
      )}
      {photo && (
        <Modal title="物品照片" onClose={() => setPhoto(null)}>
          <img className="full-photo" src={photo} alt="物品完整照片" />
        </Modal>
      )}
    </Frame>
  );
}
