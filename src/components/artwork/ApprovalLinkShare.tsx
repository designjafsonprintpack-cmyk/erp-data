'use client'
import { Copy, MessageCircle, Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from '@/components/ui/Toast'
import { formatShareDate, whatsappShareUrl, type ArtworkShareContext } from '@/lib/utils/artworkShareText'

/**
 * What you see AFTER an artwork approval link is generated.
 *
 * WHY IT IS A MESSAGE AND NOT A URL
 *   This used to be a single readonly input holding
 *   `https://…/artwork/approve/<64 hex characters>` and a copy button. The
 *   designer sends that to Sales, Sales forwards it to the customer — and
 *   nothing in it says which job, which design or which version it opens. Send
 *   four together and they are indistinguishable; ask two days later and even
 *   the person who made them can't tell.
 *
 *   So the primary action copies the whole message — customer, job number, job
 *   title, design, version, link, expiry. "Copy link only" is still there for
 *   pasting into a form, but it is deliberately the secondary action.
 *
 * SHARED BY BOTH SCREENS
 *   The Artwork page and Job Detail → Artwork both generate links, and both
 *   render this. One component, so the two can never word it differently.
 */
export function ApprovalLinkShare({
  share, shareText, link, onDone,
}: {
  share: ArtworkShareContext | null
  shareText: string
  link: string
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copyMessage = () => {
    navigator.clipboard.writeText(shareText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Message copied — job, design aur link sab')
  }

  const copyLinkOnly = () => {
    navigator.clipboard.writeText(link)
    toast.success('Link copied')
  }

  return (
    <div className="space-y-4">
      {/* What this link actually is — readable at a glance before sending. */}
      {share && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {share.job_number && (
              <span className="text-sm font-semibold font-mono text-[var(--color-accent)]">{share.job_number}</span>
            )}
            {share.job_title && (
              <span className="text-sm text-[var(--color-text-primary)]">{share.job_title}</span>
            )}
          </div>
          {share.customer_name && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{share.customer_name}</p>
          )}
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            {share.design_count > 1 || share.design_label
              ? <>{share.design_label || `Design ${share.design_no ?? 1}`} — Version {share.version}</>
              : <>Version {share.version}</>}
            {' · '}
            {share.expires_at ? `valid till ${formatShareDate(share.expires_at)}` : 'no expiry'}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="approval-share-text" className="text-sm font-medium text-[var(--color-text-primary)]">
          Send this to the customer
        </label>
        <textarea id="approval-share-text" readOnly value={shareText} rows={7}
          onClick={e => (e.target as HTMLTextAreaElement).select()}
          className="w-full px-3 py-2 rounded-md border text-sm leading-relaxed font-mono resize-none bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]" />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={copyMessage}
          className="flex-1 flex items-center justify-center gap-2 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy message'}
        </button>
        <a href={whatsappShareUrl(shareText)} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors">
          <MessageCircle size={14} /> WhatsApp
        </a>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <button onClick={copyLinkOnly}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] underline underline-offset-2 transition-colors">
          Copy link only
        </button>
        <button onClick={onDone}
          className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          Done
        </button>
      </div>
    </div>
  )
}

export default ApprovalLinkShare
