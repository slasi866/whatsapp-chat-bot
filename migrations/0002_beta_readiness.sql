-- Columns needed for the beta readiness pass.

-- Lets the inbox mark which threads an agent has not looked at yet. Null means
-- never opened, which is what makes a brand new conversation read as unread.
ALTER TABLE conversations ADD COLUMN agent_read_at INTEGER;

-- Embedding calls are billed separately from replies and were invisible in the
-- usage report, so a large document ingest cost nothing on paper.
ALTER TABLE usage_daily ADD COLUMN embedding_tokens INTEGER NOT NULL DEFAULT 0;

-- Retention sweeps delete by age, and both tables are written on every inbound
-- message, so they need an index on the timestamp being compared.
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_processed_created ON processed_messages(created_at);
