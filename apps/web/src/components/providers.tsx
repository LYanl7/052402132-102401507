'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { User, ChatMessage } from '@mayoimon/shared';
import type { SessionContext } from '@/models/session';
import { api, errorMessage } from '@/lib/api';
import { startChatSync } from '@/lib/chat-sync';

const Context = createContext<SessionContext>(null!);
export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(''),
    [lastMessage, setLastMessage] = useState<ChatMessage | null>(null),
    [connected, setConnected] = useState(false),
    [revision, setRevision] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((message: string) => {
    setNotice(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(''), 3500);
  }, []);
  const updateUser = useCallback((value: User | null) => {
    setUser(value);
    setRevision((n) => n + 1);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const result = await api<{ user: User | null }>('/users/me');
      updateUser(result.user);
    } finally {
      setLoading(false);
    }
  }, [updateUser]);
  useEffect(() => {
    void refresh().catch((error) => toast(errorMessage(error)));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, toast]);
  useEffect(() => {
    if (!user) {
      setConnected(false);
      setLastMessage(null);
      return;
    }
    setLastMessage(null);
    return startChatSync(user.id, {
      message: setLastMessage,
      connected: (value) => {
        setConnected(value);
        if (value) setRevision((n) => n + 1);
      },
      error: toast,
      unauthorized: () => {
        void refresh().catch((error) => toast(errorMessage(error)));
      },
    });
  }, [user?.id, refresh, toast]);
  return (
    <Context.Provider
      value={{ user, loading, updateUser, toast, lastMessage, connected, revision }}
    >
      {children}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </Context.Provider>
  );
}
export function useSession() {
  return useContext(Context);
}
export function useResource<T>(path: string | null, revision: unknown = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    api<T>(path)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(errorMessage(e));
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, revision, tick]);
  return { data, setData, error, loading, reload: () => setTick((n) => n + 1) };
}
