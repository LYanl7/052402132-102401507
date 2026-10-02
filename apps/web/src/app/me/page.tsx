'use client';
import Link from 'next/link';
import { List, Check, ChevronRight } from 'lucide-react';
import type { Post, ProfileStats } from '@mayoimon/shared';
import { Frame, Header, AuthGate, Loading, ErrorState } from '@/components/ui';
import { useSession, useResource } from '@/components/providers';
function Profile() {
  const { user, revision } = useSession();
  const stats = useResource<ProfileStats>('/interactions/stats', revision);
  const posts = useResource<{ items: Post[] }>('/posts/mine?status=active', revision);
  return (
    <>
      <section className="profile-summary">
        <div className="avatar big">{user?.name.slice(0, 1)}</div>
        <div>
          <h2>{user?.name}</h2>
          <p className="muted">{user?.bio}</p>
          <span className="volunteer-tag">校园互助</span>
        </div>
      </section>
      <div className="profile-content">
        <section className="yellow-banner">
          <h2>一起找回每一份失物</h2>
          <p>查看记录与进度，继续传递线索</p>
          <div className="banner-dots" />
        </section>
        {stats.loading ? (
          <Loading />
        ) : stats.error ? (
          <ErrorState message={stats.error} retry={stats.reload} />
        ) : (
          <section className="stats-card">
            <Link href="/me/history">
              <strong>{stats.data?.history}</strong>
              <span>浏览记录</span>
            </Link>
            <Link href="/me/favorites">
              <strong>{stats.data?.favorites}</strong>
              <span>我的收藏</span>
            </Link>
          </section>
        )}
        <section className="activity-card">
          <h2>我的活动</h2>
          <div className="activity-grid">
            <Link href="/my-posts">
              <div className="activity-icon yellow">
                <List size={30} />
              </div>
              <strong>我的发布</strong>
              <span>
                {stats.loading
                  ? '统计加载中…'
                  : stats.error
                    ? '统计暂不可用'
                    : stats.data && `${stats.data.active} 条进行中`}
              </span>
            </Link>
            <Link href="/me/recovered">
              <div className="activity-icon green">
                <Check size={30} />
              </div>
              <strong>我找回的</strong>
              <span>
                {stats.loading
                  ? '统计加载中…'
                  : stats.error
                    ? '统计暂不可用'
                    : stats.data && `${stats.data.completed} 件已完成`}
              </span>
            </Link>
          </div>
        </section>
        <Link
          className="progress-card"
          href={posts.data?.items[0] ? '/posts/' + posts.data.items[0].id : '/my-posts'}
        >
          <div>
            <h2>找回进展</h2>
            <p className="muted">
              {posts.data?.items[0]
                ? `${posts.data.items[0].title} · ${posts.data.items[0].type === 'lost' ? '寻找中' : '待认领'}`
                : '查看我的发布与处理状态'}
            </p>
          </div>
          <ChevronRight size={20} />
        </Link>
      </div>
    </>
  );
}
export default function ProfilePage() {
  return (
    <Frame>
      <Header
        title="我的"
        action={
          <Link className="muted small" href="/settings">
            设置
          </Link>
        }
      />
      <AuthGate>
        <Profile />
      </AuthGate>
    </Frame>
  );
}
