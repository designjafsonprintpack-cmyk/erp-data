import type { Metadata } from 'next'
import ApproveArtworkClient from './ApproveArtworkClient'
import { loadArtworkApprovalMeta, approvalMetaLabel } from '@/lib/utils/artworkApprovalMeta'

/**
 * Open Graph tags so a pasted approval link stops being anonymous.
 *
 * Without these, `https://…/artwork/approve/<64 hex characters>` arrives in
 * WhatsApp as a bare URL — four of them together are indistinguishable, which
 * is the whole complaint. With them, each link renders as a card carrying the
 * artwork thumbnail, the job number, the customer and the design. The picture
 * comes from opengraph-image.tsx in this folder, which Next wires up
 * automatically.
 *
 * noindex is not optional here: this page is public-by-token and shows a
 * customer's unreleased packaging design. It must never reach a search engine.
 */
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  // Without metadataBase Next cannot turn opengraph-image.ts into the ABSOLUTE
  // URL a crawler needs, and warns at build time. VERCEL_URL covers preview
  // deployments, where NEXT_PUBLIC_APP_URL still points at production.
  const origin = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const base: Metadata = {
    metadataBase: new URL(origin),
    robots: { index: false, follow: false },
  }

  const meta = await loadArtworkApprovalMeta(params.token).catch(() => null)
  if (!meta || meta.expired) {
    return { ...base, title: 'Artwork Approval — Jafson Print Pack' }
  }

  const title = meta.job_number
    ? `Artwork approval — ${meta.job_number}`
    : 'Artwork approval'
  const description = [meta.customer_name, meta.job_title, approvalMetaLabel(meta)]
    .filter(Boolean).join(' · ')

  return {
    ...base,
    title,
    description,
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default function ApproveArtworkPage({ params }: { params: { token: string } }) {
  return <ApproveArtworkClient token={params.token} />
}
