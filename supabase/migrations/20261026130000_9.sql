-- IT Support, phase 9: keep every ticket notification in one Gmail conversation.
-- Only support_ objects are changed; safe to re-run.
alter table support_tickets add column if not exists email_thread_id text;
alter table support_tickets add column if not exists email_message_id text;
