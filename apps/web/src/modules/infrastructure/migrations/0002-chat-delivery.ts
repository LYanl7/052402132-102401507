// Keep v1 rowids and legacy message identifiers intact during the transition.
export const chatDeliverySql = `
ALTER TABLE chat_messages ADD COLUMN device_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE chat_messages ADD COLUMN seq_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0;
UPDATE chat_messages SET seq_id = rowid,
  expires_at = CAST(strftime('%s', created_at) AS INTEGER) * 1000 + 604800000;
CREATE UNIQUE INDEX chat_identity ON chat_messages(conversation_id,sender_id,device_id,seq_id);
CREATE INDEX chat_expiry ON chat_messages(expires_at);
CREATE TABLE chat_sequences(
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_id TEXT NOT NULL REFERENCES users(id), device_id TEXT NOT NULL,
  last_seq INTEGER NOT NULL, PRIMARY KEY(conversation_id,sender_id,device_id));
INSERT INTO chat_sequences SELECT conversation_id,sender_id,device_id,max(seq_id)
  FROM chat_messages GROUP BY conversation_id,sender_id,device_id;
CREATE TABLE chat_receipts(
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id), device_id TEXT NOT NULL,
  PRIMARY KEY(message_id,user_id,device_id));
CREATE TABLE chat_reads(
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(message_id,user_id));
INSERT INTO chat_reads SELECT m.id,r.user_id FROM chat_messages m
  JOIN conversation_reads r ON r.conversation_id=m.conversation_id
  WHERE m.rowid<=r.last_read_rowid;
`;
