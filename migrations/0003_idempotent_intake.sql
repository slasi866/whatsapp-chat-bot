-- Makes storing an inbound message idempotent.
--
-- Meta retries webhooks, and a queue message that fails is retried too, so the
-- same customer message can reach the handler several times. Without this the
-- transcript grew a duplicate turn on every retry, and the model was asked to
-- answer a question it appeared to have been asked twice.
--
-- Partial, because outbound rows are written before their WhatsApp id is known
-- and several of them legitimately carry NULL.
CREATE UNIQUE INDEX idx_messages_wa_id
  ON messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;
