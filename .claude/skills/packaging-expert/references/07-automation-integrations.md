# Automation Standards — WhatsApp, Email, Notifications, Workflow Automation

## Principle: automate the coordination, not the decisions

The highest-value automation targets in a printing/packaging shop are the
manual coordination steps people do today by phone/WhatsApp/walking over to
someone's desk — status checks, approval nudges, dispatch confirmations.
Automating a *decision* (e.g., auto-approving purchases) is a much higher-
stakes change than automating a *notification* about a decision someone
already made — be more cautious recommending the former, and confirm
business rules explicitly before implementing anything that acts
autonomously on money or client-facing commitments.

## Where automation genuinely helps in this workflow (see `01`)

- **Client Approval** — auto-send the proof link via WhatsApp/email when
  artwork moves to "submitted," auto-remind after N days of no response,
  notify the internal team immediately on approve/reject.
- **Plates/Purchase** — notify the purchase team when a job reaches a stage
  that needs materials not currently in stock (cross-reference Inventory
  before creating the request, per `01`).
- **Production stage handoffs** — notify the next stage's team/operator
  when a job completes the prior stage (Printing done → notify Lamination),
  instead of relying on someone noticing.
- **Dispatch** — auto-send dispatch confirmation (with tracking info if
  available) to the customer via WhatsApp/email.
- **Purchase approvals** — notify the approver when a request is pending,
  and escalate/remind if it sits too long.
- **Overdue alerts** — jobs stuck in a stage past its planned duration,
  surfaced to the relevant role (see `06` dashboards) and optionally pushed
  as a notification.
- **Reorder points** — Inventory hitting a low-stock threshold triggers a
  suggested purchase request rather than someone noticing manually.

## Notification design

- **Log every outbound notification** (`notification_log` or similar):
  recipient, channel, template used, status (sent/delivered/failed),
  related record. This is both an audit need and a debugging need — "did
  the client actually get notified" is a question that will come up in a
  dispute.
- **Templates, not ad hoc strings.** Message content should be built from
  versioned templates with clear variable substitution, not string-
  concatenated inline at each call site — this makes it possible to update
  wording without a code change and keeps messages consistent.
- **Idempotency.** A retry on a failed send (or a duplicate trigger from a
  race condition) should not send the same notification twice to a client
  — key sends by a unique event, not just "fire on every save."
- **Respect channel norms.** WhatsApp Business API has template-message
  approval requirements and rate/session-window rules (24-hour customer
  service window for free-form replies outside of pre-approved templates)
  — if implementing WhatsApp, check whether the intended message fits an
  approved template or needs one created; don't assume free-form messaging
  is always available.
- **Failure handling** — a failed WhatsApp/email send should be visible
  and retryable/alertable, not silently swallowed. A dispatch confirmation
  that silently failed to send is a customer-trust problem discovered too
  late.

## Workflow automation (stage transitions, approvals)

- Automated stage transitions (e.g., auto-moving a job to "ready for
  dispatch" when all packing is complete) are safe to automate because
  they reflect a fact that already happened.
- Automated *approvals* (auto-approving a purchase under a threshold, for
  example) are a business-policy decision, not a technical one — implement
  only when the user has explicitly stated the policy (the threshold, who
  it applies to, exceptions), and make the automated approval as visible
  and auditable as a manual one (see `10`), not a silent bypass.
- Scheduled jobs (reminders, reorder checks, overdue alerts) should be
  implemented via Supabase's scheduled functions / a cron mechanism the
  project already uses — check what's already in place before introducing
  a second scheduling system.

## Integration reliability

- Treat WhatsApp/email provider calls as **unreliable external I/O**:
  timeouts, retries with backoff, and a clear failure state — don't let a
  slow/down notification provider block the underlying business action
  (e.g., dispatch should still be recorded even if the confirmation message
  temporarily fails to send; retry the message separately).
- Webhook handlers receiving delivery-status callbacks should verify
  authenticity (see `04`) and update the `notification_log` status rather
  than being ignored.

## Before implementing automation, confirm

- What triggers it, exactly (which status change, which threshold)?
- Who receives it and on which channel — is that configurable per
  company/role, or hardcoded?
- What happens on failure — retry, alert a human, or both?
- Is there an opt-out/quiet-hours consideration for client-facing messages?

If any of these aren't specified, ask rather than picking a default for
something that sends messages to real customers.
