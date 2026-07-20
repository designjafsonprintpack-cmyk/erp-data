-- ═══════════════════════════════════════════════════════════════════════════
-- EMAIL NOTIFICATIONS — seed toggle keys under category='notifications'
-- ═══════════════════════════════════════════════════════════════════════════
-- Pre-seeding these (rather than letting the first PATCH create them) means
-- the row already has category='notifications' set. The generic
-- admin/settings PATCH upsert only writes company_id/key/value on conflict,
-- so if these rows didn't exist yet, the first toggle-save would INSERT them
-- with category = NULL and they'd silently vanish from this settings page on
-- next load (which filters by category='notifications').
--
-- dispatch_sms already existed as a working key with no seed row and no UI —
-- it's included here too so it shows up in the same screen instead of being
-- the one channel that's invisible until someone sets it by hand in the DB.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO system_settings (company_id, key, value, category, description)
SELECT c.id, k.key, 'false', 'notifications', k.description
FROM companies c
CROSS JOIN (VALUES
  ('dispatch_sms',    'Send a WhatsApp message to the customer when an order is dispatched'),
  ('dispatch_email',  'Email the customer when an order is dispatched'),
  ('quotation_email', 'Email the customer their approval link when a quotation is sent'),
  ('invoice_email',   'Email the customer a copy when an invoice is sent')
) AS k(key, description)
ON CONFLICT (company_id, key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
