'use client';
import { use, useState } from 'react';
import type { Post } from '@mayoimon/shared';
import {
  Frame,
  Header,
  AuthGate,
  PostRow,
  Loading,
  ErrorState,
  Empty,
  Modal,
} from '@/components/ui';
import { useResource, useSession } from '@/components/providers';
import { api, errorMessage } from '@/lib/api';
const sections = {
  history: {
    title: '浏览记录',
    subtitle: '最近看过的失物与招领信息',
    path: '/interactions/history',
  },
  favorites: {
    title: '我的收藏',
    subtitle: '已收藏的信息，方便再次查看',
    path: '/interactions/favorites',
  },
  recovered: {
    title: '我找回的',
    subtitle: '每一份找回都值得记录',
    path: '/posts/mine?status=completed',
  },
};
function Records({ section }: { section: keyof typeof sections }) {
  const result = useResource<{ items: Post[] }>(sections[section].path);
  const { toast } = useSession();
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  async function clear() {
    setBusy(true);
    try {
      await api('/interactions/history', { method: 'DELETE' });
      setConfirm(false);
      result.reload();
      toast('浏览记录已清空');
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="records-intro">
        <p className="muted">{sections[section].subtitle}</p>
        {section === 'history' && !!result.data?.items.length && (
          <button className="text-button" onClick={() => setConfirm(true)}>
            清空记录
          </button>
        )}
      </div>
      <div className="list">
        {result.loading ? (
          <Loading />
        ) : result.error ? (
          <ErrorState message={result.error} retry={result.reload} />
        ) : result.data?.items.length ? (
          result.data.items.map((post) => (
            <PostRow key={post.id} post={post}>
              <div className="record-state">
                {post.status === 'completed'
                  ? '已完成'
                  : post.type === 'lost'
                    ? '寻找中'
                    : '待认领'}
              </div>
            </PostRow>
          ))
        ) : (
          <Empty
            text={
              section === 'recovered' ? '完成交接后，在我的发布中标记找回或领回' : '这里还没有记录'
            }
          />
        )}
      </div>
      {section === 'recovered' && (
        <div className="recovered-note">
          <h2>失而复得，感谢每一份帮助</h2>
          <p className="muted">继续分享线索，让更多物品回到主人身边。</p>
        </div>
      )}
      {confirm && (
        <Modal title="清空浏览记录？" onClose={() => setConfirm(false)}>
          <p className="muted">清空后，再次查看信息会生成新的记录。</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setConfirm(false)}>
              取消
            </button>
            <button className="primary" disabled={busy} onClick={() => void clear()}>
              确认清空
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export default function RecordsPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  if (!(section in sections))
    return (
      <Frame>
        <Header title="页面不存在" back />
        <Empty text="找不到这个页面" />
      </Frame>
    );
  const value = section as keyof typeof sections;
  return (
    <Frame>
      <Header title={sections[value].title} back />
      <AuthGate>
        <Records section={value} />
      </AuthGate>
    </Frame>
  );
}
