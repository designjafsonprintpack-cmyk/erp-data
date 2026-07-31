/**
 * The text that goes out WITH an artwork approval link.
 *
 * WHY THIS EXISTS
 *   "Get Approval Link" used to hand back a bare
 *   `https://…/artwork/approve/<64 hex characters>` and nothing else. The
 *   designer pastes that to Sales, Sales forwards it to the customer, and by
 *   then nobody can say what it is a link TO. Send four at once — two designs
 *   of one job, two jobs of one customer — and they are literally
 *   indistinguishable. Two days later the designer who made them can't tell
 *   either.
 *
 *   So the copy button copies a MESSAGE, not a URL: who it's for, which job,
 *   which design, which version, and when it stops working.
 *
 * ONE FORMATTER, BUILT SERVER-SIDE
 *   Both screens that generate a link (the Artwork page and Job Detail →
 *   Artwork) call the same route, so the route builds the text once and both
 *   just display it. Neither client re-derives it, so they cannot drift.
 */

export interface ArtworkShareContext {
  /** The public approval URL. */
  url: string
  job_number: string | null
  job_title: string | null
  customer_name: string | null
  /** Which design (migration 124). Legacy rows are 1. */
  design_no: number | null
  design_label: string | null
  /**
   * How many designs the job carries. Decides whether the design is named at
   * all — saying "Design 1" on a job that only HAS one design is noise, the
   * same reason the design chip in the UI only appears past one design.
   */
  design_count: number
  version: number
  /** ISO string, or null for a link that never expires. */
  expires_at: string | null
}

/**
 * Dates are formatted in Asia/Karachi, not the server's UTC — an expiry of
 * 1 Aug 02:00 PKT is "1 Aug" to everyone who reads this message, and a naive
 * UTC render would call it 31 July. Same rule migration 114 established for
 * the board report's month bounds.
 */
export function formatShareDate(iso: string): string {
  // en-GB, not the app's usual en-PK: en-PK renders this as "07-Aug-2026" and
  // hyphens read as a code inside a sentence. "07 Aug 2026" is what a customer
  // reads as a date.
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi',
  }).format(new Date(iso))
}

/**
 * The short "which artwork is this" line — `Design 2 (Lid) · Version 3`, or
 * just `Version 3` on a job with a single unnamed design. Also used as the
 * approval-link modal's title so the screen and the copied message agree.
 */
export function artworkShareLabel(ctx: Pick<ArtworkShareContext, 'design_no' | 'design_label' | 'design_count' | 'version'>): string {
  const named = ctx.design_count > 1 || !!ctx.design_label?.trim()
  if (!named) return `Version ${ctx.version}`
  const label = ctx.design_label?.trim()
  const design = label
    ? `Design ${ctx.design_no ?? 1} (${label})`
    : `Design ${ctx.design_no ?? 1}`
  return `${design} · Version ${ctx.version}`
}

/**
 * The whole message. Plain text with real newlines — it is pasted into
 * WhatsApp, which is how this shop actually moves a link around.
 */
export function buildArtworkShareText(ctx: ArtworkShareContext): string {
  const lines: string[] = []

  lines.push(ctx.job_number ? `Artwork approval — ${ctx.job_number}` : 'Artwork approval')
  if (ctx.customer_name) lines.push(ctx.customer_name)
  if (ctx.job_title) lines.push(ctx.job_title)
  lines.push(artworkShareLabel(ctx))

  lines.push('', ctx.url, '')

  lines.push(ctx.expires_at
    ? `Link valid till ${formatShareDate(ctx.expires_at)}`
    : 'This link does not expire.')

  return lines.join('\n')
}

/**
 * Opens WhatsApp with the message already typed; the sender picks the contact.
 * No phone number is baked in — the recipient is Sales one time and the
 * customer the next, and the ERP has no business guessing which.
 */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
