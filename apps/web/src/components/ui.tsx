'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import {
  Home,
  Compass,
  Camera,
  MessageSquare,
  CircleUserRound,
  ChevronLeft,
  ArrowRight,
  Search,
  MapPin,
  Inbox,
  LoaderCircle,
  X,
} from 'lucide-react';
import type { Post } from '@mayoimon/shared';
import { dateLabel } from '@/lib/api';
import { useSession } from './providers';

export function Frame({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return (
    <main className={`app-shell ${nav ? 'with-nav' : ''}`}>
      {children}
      {nav && <BottomNav />}
    </main>
  );
}
export function Header({
  title,
  back = false,
  action,
}: {
  title: string;
  back?: boolean;
  action?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="header">
      {back ? (
        <button
          className="icon-button"
          aria-label="返回"
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
        >
          <ChevronLeft size={24} />
        </button>
      ) : null}
      <h1 className={back ? 'center-title' : ''}>{title}</h1>
      <div className="header-action">{action}</div>
    </header>
  );
}
export function BottomNav() {
  const path = usePathname();
  const entries = [
    { href: '/', label: '首页', icon: Home },
    { href: '/nearby', label: '附近', icon: Compass },
    { href: '/publish', label: '发布', icon: Camera },
    { href: '/messages', label: '消息', icon: MessageSquare },
    { href: '/me', label: '我的', icon: CircleUserRound },
  ];
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {entries.map(({ href, label, icon: Icon }) => {
        const active =
          href === '/'
            ? path === '/'
            : path.startsWith(href) || (href === '/me' && path === '/my-posts');
        return (
          <Link
            key={href}
            href={href}
            className={`${href === '/publish' ? 'publish-link' : ''} ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={25} strokeWidth={2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" size={25} />
      <p>正在加载…</p>
    </div>
  );
}
export function Empty({
  text = '暂时没有相关信息',
  children,
}: {
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={36} />
      <p>{text}</p>
      {children}
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="empty" role="alert">
      <p>{message}</p>
      <button className="secondary" onClick={retry}>
        重新加载
      </button>
    </div>
  );
}
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const path = usePathname();
  if (loading) return <Loading />;
  if (!user)
    return (
      <Empty text="登录后继续传递线索">
        <Link className="primary" href={'/login?next=' + encodeURIComponent(path)}>
          登录 / 注册
        </Link>
      </Empty>
    );
  return <>{children}</>;
}
export function Badge({ type }: { type: Post['type'] }) {
  return <span className={`badge ${type}`}>{type === 'lost' ? '寻物' : '招领'}</span>;
}
export function Illustration({
  post,
  large = false,
}: {
  post: Pick<Post, 'category' | 'images' | 'title'>;
  large?: boolean;
}) {
  if (post.images.length)
    return (
      <div className={`illustration ${large ? 'large' : ''}`}>
        <img src={post.images[0]} alt={post.title} />
      </div>
    );
  return (
    <div className={`illustration art-${post.category} ${large ? 'large' : ''}`}>
      <svg viewBox="0 0 174 130" aria-hidden="true">
        {post.category === 'keys' ? (
          <g fill="#efc462">
            <circle cx="53" cy="58" r="14" />
            <circle cx="53" cy="58" r="6" fill="#efe9df" />
            <rect x="62" y="54" width="66" height="8" rx="3" />
            <rect x="109" y="59" width="5" height="12" />
            <rect x="120" y="59" width="5" height="10" />
          </g>
        ) : post.category === 'electronics' ? (
          <g>
            <rect x="41" y="43" width="92" height="49" rx="19" fill="#f4f4f0" />
            <path d="M43 67h88" stroke="#c5cec9" strokeWidth="2" />
            <circle cx="87" cy="74" r="2.5" fill="#c5cec9" />
          </g>
        ) : post.category === 'umbrella' ? (
          <g fill="#5376a5">
            <path d="M42 65a47 47 0 0 1 90 0Z" />
            <path d="M87 63v30a9 9 0 0 1-9 9" fill="none" stroke="#5376a5" strokeWidth="3" />
            <path d="M44 91a45 45 0 0 0 86 0H91a5 5 0 0 1-10 0Z" />
          </g>
        ) : post.category === 'wallet' ? (
          <g>
            <rect x="43" y="32" width="90" height="66" rx="12" fill="#b87855" />
            <path d="M43 55h90" stroke="#ce9571" strokeWidth="5" />
            <circle cx="109" cy="65" r="4" fill="#f2d5a2" />
          </g>
        ) : post.category === 'card' ? (
          <g>
            <rect x="42" y="36" width="90" height="60" rx="8" fill="#d9bd72" />
            <circle cx="64" cy="60" r="10" fill="#fff7da" />
            <path d="M85 55h30m-30 12h24" stroke="#fff7da" strokeWidth="4" />
          </g>
        ) : (
          <g fill="#c7cbd1">
            <rect x="49" y="35" width="76" height="64" rx="10" />
            <path d="M70 35v64m34-64v64" stroke="#eef0f3" strokeWidth="3" />
          </g>
        )}
      </svg>
    </div>
  );
}
export function PostCard({ post }: { post: Post }) {
  return (
    <Link className="post-card" href={'/posts/' + post.id}>
      <Illustration post={post} />
      <div className="card-content">
        <div className="card-title">
          <Badge type={post.type} />
          <h2>{post.title}</h2>
        </div>
        <p>{post.location}</p>
        <p className="small">{dateLabel(post.occurredAt)}</p>
        <span className={`card-link ${post.type}`}>
          {post.status === 'completed' ? '已完成' : post.type === 'lost' ? '提供线索' : '查看详情'}{' '}
          <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  );
}
export function PostRow({ post, children }: { post: Post; children?: ReactNode }) {
  return (
    <article className="post-row">
      <Link className="row-main" href={'/posts/' + post.id}>
        <Illustration post={post} />
        <div>
          <div className="row-title">
            <Badge type={post.type} />
            <h2>{post.title || '未命名草稿'}</h2>
          </div>
          <p className="muted clamp">{post.description}</p>
          <p className="muted small">
            <MapPin size={12} />
            {post.location || '地点待补充'}
          </p>
          <p className="muted small">
            {dateLabel(post.occurredAt)}
            {post.distance !== undefined &&
              ` · ${post.distance >= 1000 ? (post.distance / 1000).toFixed(1) + ' km' : post.distance + ' m'}`}
          </p>
        </div>
      </Link>
      {children}
    </article>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close icon-button" aria-label="关闭" onClick={onClose}>
          <X size={20} />
        </button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
export function SearchLink() {
  return (
    <Link className="search-box" href="/search">
      <Search size={17} />
      <span>搜物品、地点或关键词</span>
    </Link>
  );
}
