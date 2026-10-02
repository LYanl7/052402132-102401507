import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="app-shell">
      <div className="empty">
        <h1>找不到这个页面</h1>
        <Link className="primary" href="/">
          返回首页
        </Link>
      </div>
    </main>
  );
}
