export interface ConversationRow {
  id: string;
  post_id: string;
  user_a: string;
  user_b: string;
  updated_at: string;
}
export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  client_id: string;
  created_at: string;
}

export interface ConversationListRow extends ConversationRow {
  peer_id: string;
  peer_name: string;
  post_title: string;
  last_message: string;
  unread: number;
}

export interface ChatMessageCursorRow extends ChatMessageRow {
  cursor: number;
}
