import type { User } from '@mayoimon/shared';

export interface UserRow extends User {
  password_hash: string;
  created_at: string;
}
