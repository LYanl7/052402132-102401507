import type { User, ChatMessage } from '@mayoimon/shared';

export interface SessionContext {
  user: User | null;
  loading: boolean;
  updateUser: (user: User | null) => void;
  toast: (message: string) => void;
  lastMessage: ChatMessage | null;
  connected: boolean;
  revision: number;
}
