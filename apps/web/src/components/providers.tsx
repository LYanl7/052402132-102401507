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
import type { User, ChatMessage, SocketEvent } from '@mayoimon/shared';
import { api, errorMessage } from '@/lib/api';

interface SessionContext {
  user: User | null;
  loading: boolean;
  updateUser: (user: User | null) => void;
  toast: (message: string) => void;
  lastMessage: ChatMessage | null;
  connected: boolean;
  revision: number;
}
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
    let disposed = false,
      socket: WebSocket | null = null,
      retry: ReturnType<typeof setTimeout> | undefined,
      attempt = 0;
    const connect = () => {
      const url =
        process.env.NEXT_PUBLIC_WS_URL ??
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
      socket = new WebSocket(url);
      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
        setRevision((n) => n + 1);
      };
      socket.onmessage = (event) => {
        try {
          const value = JSON.parse(event.data) as SocketEvent;
          if (value.type === 'message') setLastMessage(value.message);
        } catch {
          /* Ignore invalid push packets; HTTP history remains authoritative. */
        }
      };
      socket.onclose = (event) => {
        setConnected(false);
        if (disposed) return;
        if (event.code === 1008) {
          void refresh().catch((error) => toast(errorMessage(error)));
          return;
        }
        retry = setTimeout(connect, Math.min(15000, 1000 * 2 ** attempt++));
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
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
