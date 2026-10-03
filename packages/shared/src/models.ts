export interface PostInput {
  type: 'lost' | 'found';
  title: string;
  category: 'keys' | 'electronics' | 'umbrella' | 'wallet' | 'card' | 'other';
  location: string;
  occurredAt: string;
  description: string;
  contact: string;
  images: string[];
  lat: number | null;
  lng: number | null;
  status: 'active' | 'draft';
}

export interface User {
  id: string;
  email: string;
  name: string;
  bio: string;
}
export interface Post extends Omit<PostInput, 'status'> {
  id: string;
  userId: string;
  status: 'active' | 'draft' | 'completed';
  views: number;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string };
  favorite: boolean;
  distance?: number;
}
export interface PostList {
  items: Post[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  deviceId: string;
  seqId: number;
  createdAt: string;
  expiresAt: number;
}
export interface ChatSendInput {
  deviceId: string;
  seqId: number;
  content: string;
  queuedAt: string;
}
export interface Conversation {
  id: string;
  postId: string;
  postTitle: string;
  peer: { id: string; name: string };
  lastMessage: string;
  updatedAt: string;
  unread: number;
}
export interface ProfileStats {
  history: number;
  favorites: number;
  active: number;
  completed: number;
  drafts: number;
}
export type SocketEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'ready'; ttlMs: number }
  | { type: 'session-expired' };

export interface ChatHistory {
  items: ChatMessage[];
  nextCursor: number | null;
}
