'use client';
import { useState } from 'react';
import type { PostList } from '../modules/message/models.ts';
import { Frame, PostCard, SearchLink, Loading, Empty, ErrorState } from '@/components/ui';
import { useResource } from '@/components/providers';
export default function HomePage() {
  const [type, setType] = useState(''),
    [page, setPage] = useState(1);
  const result = useResource<PostList>(
    `/posts?status=active&page=${page}&pageSize=20${type ? '&type=' + type : ''}`,
  );
  return (
    <Frame>
      <header className="home-header">
        <div className="home-tabs" role="tablist" aria-label="信息分类">
          {[
            ['', '首页'],
            ['lost', '寻物'],
            ['found', '招领'],
          ].map(([value, label]) => (
            <button
              role="tab"
              aria-selected={type === value}
              className={type === value ? 'selected' : ''}
              key={label}
              onClick={() => {
                setType(value);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchLink />
      </header>
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorState message={result.error} retry={result.reload} />
      ) : result.data?.items.length ? (
        <>
          <div className="masonry">
            {[0, 1].map((column) => (
              <div className="card-column" key={column}>
                {result
                  .data!.items.filter((_, i) => i % 2 === column)
                  .map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
              </div>
            ))}
          </div>
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
              上一页
            </button>
            <span>
              {page} / {Math.max(1, Math.ceil(result.data.total / 20))}
            </span>
            <button disabled={page * 20 >= result.data.total} onClick={() => setPage((n) => n + 1)}>
              下一页
            </button>
          </div>
        </>
      ) : (
        <Empty />
      )}
    </Frame>
  );
}
