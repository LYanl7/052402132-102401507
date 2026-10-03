'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '../../modules/user/models.ts';
import { Frame, Header, AuthGate } from '@/components/ui';
import { useSession } from '@/components/providers';
import { api, errorMessage } from '@/lib/api';
function Settings() {
  const { user, updateUser, toast } = useSession();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const { user: updatedUser } = await api<{ user: User }>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: form.get('name'), bio: form.get('bio') }),
      });
      updateUser(updatedUser);
      toast('个人信息已更新');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api('/users/logout', { method: 'POST' });
      updateUser(null);
      router.replace('/');
      toast('已退出登录');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-page">
      <form onSubmit={save}>
        <label>
          邮箱
          <input value={user?.email ?? ''} readOnly />
        </label>
        <label>
          昵称
          <input name="name" required maxLength={24} defaultValue={user?.name} />
        </label>
        <label>
          个人简介
          <textarea name="bio" maxLength={120} rows={3} defaultValue={user?.bio} />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="primary">
          保存个人信息
        </button>
      </form>
      <button disabled={busy} className="secondary logout" onClick={() => void logout()}>
        退出登录
      </button>
    </section>
  );
}
export default function SettingsPage() {
  return (
    <Frame nav={false}>
      <Header title="设置" back />
      <AuthGate>
        <Settings />
      </AuthGate>
    </Frame>
  );
}
