'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import type { User } from '@mayoimon/shared';
import { Frame, Header } from '@/components/ui';
import { useSession } from '@/components/providers';
import { api, errorMessage } from '@/lib/api';
export default function LoginPage() {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [next, setNext] = useState('/me');
  const { updateUser } = useSession();
  const router = useRouter();
  useEffect(() => {
    const value = new URLSearchParams(location.search).get('next');
    if (value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) setNext(value);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(e.currentTarget);
    try {
      const { user } = await api<{ user: User }>('/users/' + (register ? 'register' : 'login'), {
        method: 'POST',
        body: JSON.stringify({
          email: data.get('email'),
          password: data.get('password'),
          name: data.get('name'),
        }),
      });
      updateUser(user);
      router.replace(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame nav={false}>
      <Header title={register ? '注册账号' : '登录'} back />
      <section className="auth-page">
        <div className="auth-logo">
          <KeyRound size={35} />
        </div>
        <h2>愿每件失物都能回家</h2>
        <p className="muted">登录 Mayoimon，传递线索与温暖</p>
        <form onSubmit={submit}>
          {register && (
            <label>
              昵称
              <input
                name="name"
                autoComplete="nickname"
                required
                maxLength={24}
                placeholder="大家怎么称呼你？"
              />
            </label>
          )}
          <label>
            邮箱
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="name@example.com"
            />
          </label>
          <label>
            密码
            <input
              type="password"
              name="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              minLength={8}
              maxLength={128}
              placeholder="至少 8 位"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? '请稍候…' : register ? '注册并登录' : '登录'}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setRegister((v) => !v);
            setError('');
          }}
        >
          {register ? '已有账号？去登录' : '还没有账号？注册'}
        </button>
      </section>
    </Frame>
  );
}
