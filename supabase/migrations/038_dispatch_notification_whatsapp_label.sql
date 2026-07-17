-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 038: DISPATCH NOTIFICATION → WHATSAPP
-- The dispatch_sms setting's label is updated to reflect that dispatch
-- notifications now go out via Meta WhatsApp Cloud API, not generic SMS.
-- The internal key name is left as 'dispatch_sms' (it's not user-facing —
-- only the description is shown in Settings) to avoid touching every place
-- that already references this key.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE system_settings
SET description = 'Send WhatsApp message on dispatch (via Meta WhatsApp Cloud API)'
WHERE key = 'dispatch_sms';

NOTIFY pgrst, 'reload schema';
