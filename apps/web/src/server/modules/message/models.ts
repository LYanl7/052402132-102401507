import type { Post } from '@mayoimon/shared';

export interface PostRow {
  id: string;
  user_id: string;
  type: Post['type'];
  title: string;
  category: Post['category'];
  location: string;
  occurred_at: string;
  description: string;
  contact: string;
  images: string;
  lat: number | null;
  lng: number | null;
  status: Post['status'];
  views: number;
  created_at: string;
  updated_at: string;
  author_name: string;
  favorite: number;
}
