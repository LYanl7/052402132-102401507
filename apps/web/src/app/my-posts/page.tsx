'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Post } from '../../modules/message/models.ts';
import type { ProfileStats } from '../../modules/interaction/models.ts';
import {
  Frame,
  Header,
  AuthGate,
  PostRow,
  Loading,
  Empty,
  ErrorState,
  Modal,
} from '@/components/ui';
import { useSession, useResource } from '@/components/providers';
import { api, errorMessage } from '@/lib/api';
function MyPosts() {
  const { user, toast } = useSession();
  const [status, setStatus] = useState('active'),
    [selected, setSelected] = useState<Post | null>(null),
    [action, setAction] = useState<'complete' | 'delete'>('complete'),
    [busy, setBusy] = useState(false);
  const result = useResource<{ items: Post[] }>('/posts/mine?status=' + status);
  const stats = useResource<ProfileStats>('/interactions/stats');
  async function confirm() {
    if (!selected) return;
    setBusy(true);
    try {
      await api('/posts/' + selected.id + (action === 'complete' ? '/complete' : ''), {
        method: action === 'complete' ? 'POST' : 'DELETE',
      });
      setSelected(null);
      result.reload();
      stats.reload();
      toast(action === 'complete' ? '已标记完成' : '信息已删除');
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const value = new URLSearchParams(location.search).get('status');
    if (value && ['active', 'completed', 'draft'].includes(value)) setStatus(value);
  }, []);
  return (
    <>
      <div className="profile-summary">
        <div className="avatar">{user?.name.slice(0, 1)}</div>
        <div>
          <h2>{user?.name}</h2>
          <p className="muted">{user?.bio}</p>
          <p className="small">
            {stats.loading
              ? '统计加载中…'
              : stats.error
                ? '统计暂不可用'
                : stats.data && `${stats.data.active} 进行中 · ${stats.data.completed} 已完成`}
          </p>
        </div>
      </div>
      {stats.error && <ErrorState message={stats.error} retry={stats.reload} />}
      <div className="management-tabs">
        {(
          [
            ['active', '进行中', stats.data?.active],
            ['completed', '已完成', stats.data?.completed],
            ['draft', '草稿', stats.data?.drafts],
          ] as const
        ).map(([v, l, c]) => (
          <button className={status === v ? 'selected' : ''} key={v} onClick={() => setStatus(v)}>
            {l} {stats.loading ? '…' : stats.error ? '—' : c}
          </button>
        ))}
      </div>
      <div className="list">
        {result.loading ? (
          <Loading />
        ) : result.error ? (
          <ErrorState message={result.error} retry={result.reload} />
        ) : result.data?.items.length ? (
          result.data.items.map((post) => (
            <PostRow key={post.id} post={post}>
              <div className="management-info">
                <span>
                  {post.status === 'completed'
                    ? '已完成'
                    : post.status === 'draft'
                      ? '待发布'
                      : post.type === 'lost'
                        ? '寻找中'
                        : '待认领'}
                </span>
                <span className="muted">{post.views} 次浏览</span>
              </div>
              <div className="row-actions">
                {post.status !== 'completed' && (
                  <Link className="secondary" href={'/publish?edit=' + post.id}>
                    编辑
                  </Link>
                )}
                {post.status === 'active' && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setAction('complete');
                      setSelected(post);
                    }}
                  >
                    {post.type === 'lost' ? '标记找回' : '标记领回'}
                  </button>
                )}
                <button
                  className="text-button muted"
                  onClick={() => {
                    setAction('delete');
                    setSelected(post);
                  }}
                >
                  删除
                </button>
              </div>
            </PostRow>
          ))
        ) : (
          <Empty text="这里还没有信息">
            <Link className="primary" href="/publish">
              发布信息
            </Link>
          </Empty>
        )}
      </div>
      {selected && (
        <Modal
          title={action === 'complete' ? '确认完成这条信息？' : '删除这条信息？'}
          onClose={() => setSelected(null)}
        >
          <p className="muted">
            {action === 'complete'
              ? '标记完成后，信息会归入“已完成”。请先确认物品已安全找回或领回。'
              : '删除后该信息不再公开展示，已有会话记录仍会保留。'}
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setSelected(null)}>
              取消
            </button>
            <button className="primary" disabled={busy} onClick={() => void confirm()}>
              {busy ? '处理中…' : action === 'complete' ? '确认完成' : '确认删除'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export default function MyPostsPage() {
  return (
    <Frame>
      <Header title="我的发布" back />
      <AuthGate>
        <MyPosts />
      </AuthGate>
    </Frame>
  );
}
