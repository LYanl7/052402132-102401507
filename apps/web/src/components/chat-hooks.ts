import { useCallback, useEffect, useState } from 'react';
import { loadConversations, loadMessages, subscribeChat } from '@/modules/private-chat/store';
import { errorMessage } from '@/lib/api';
function useLocalData<T>(user: string | undefined, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let disposed = false,
      version = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setData(null);
    setError('');
    setLoading(true);
    const reload = () => {
      const current = ++version;
      void load()
        .then((value) => {
          if (!disposed && current === version) {
            setData(value);
            setError('');
          }
        })
        .catch((error) => {
          if (!disposed && current === version) setError(errorMessage(error));
        })
        .finally(() => {
          if (!disposed && current === version) setLoading(false);
        });
    };
    if (!user) {
      setLoading(false);
      return;
    }
    reload();
    const unsubscribe = subscribeChat(user, () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 20);
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [user, load, tick]);
  return { data, error, loading, reload: () => setTick((n) => n + 1) };
}
export function useLocalConversations(user?: string) {
  return useLocalData(
    user,
    useCallback(() => loadConversations(user!), [user]),
  );
}
export function useLocalMessages(user: string | undefined, conversation: string, limit: number) {
  return useLocalData(
    user,
    useCallback(() => loadMessages(user!, conversation, limit), [user, conversation, limit]),
  );
}
