'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { categories } from '../../modules/message/constants.ts';
import type { PostList } from '../../modules/message/models.ts';
import { Frame, Header, PostRow, Loading, Empty, ErrorState } from '@/components/ui';
import { useResource } from '@/components/providers';
export default function SearchPage() {
  const [input, setInput] = useState(''),
    [q, setQ] = useState(''),
    [type, setType] = useState(''),
    [category, setCategory] = useState(''),
    [days, setDays] = useState(''),
    [sort, setSort] = useState('newest'),
    [page, setPage] = useState(1);
  const query = new URLSearchParams({ q, sort, page: String(page) });
  if (type) query.set('type', type);
  if (category) query.set('category', category);
  if (days) query.set('days', days);
  const result = useResource<PostList>('/posts?' + query.toString());
  return (
    <Frame nav={false}>
      <Header title="搜索" back />
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(input);
          setPage(1);
        }}
      >
        <div className="search-box">
          <Search size={18} />
          <input
            aria-label="搜索关键词"
            placeholder="物品、地点或关键词"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <button>搜索</button>
      </form>
      <div className="filters">
        <div className="segmented">
          {[
            ['', '全部'],
            ['lost', '寻物'],
            ['found', '招领'],
          ].map(([v, l]) => (
            <button
              key={l}
              className={type === v ? 'selected' : ''}
              onClick={() => {
                setType(v);
                setPage(1);
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <select
          aria-label="时间筛选"
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部时间</option>
          <option value="1">最近一天</option>
          <option value="7">最近一周</option>
          <option value="30">最近一月</option>
        </select>
        <select
          aria-label="类别筛选"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部类别</option>
          {Object.entries(categories).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="results-heading">
        <span>找到 {result.data?.total ?? 0} 条相关信息</span>
        <select
          aria-label="排序"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          <option value="newest">最新发布</option>
          <option value="oldest">最早发布</option>
        </select>
      </div>
      <div className="list">
        {result.loading ? (
          <Loading />
        ) : result.error ? (
          <ErrorState message={result.error} retry={result.reload} />
        ) : result.data?.items.length ? (
          result.data.items.map((post) => <PostRow key={post.id} post={post} />)
        ) : (
          <Empty text="没有找到匹配的信息，试试其他关键词" />
        )}
      </div>
      {!!result.data?.total && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
            上一页
          </button>
          <span>第 {page} 页</span>
          <button disabled={page * 20 >= result.data.total} onClick={() => setPage((n) => n + 1)}>
            下一页
          </button>
        </div>
      )}
    </Frame>
  );
}
