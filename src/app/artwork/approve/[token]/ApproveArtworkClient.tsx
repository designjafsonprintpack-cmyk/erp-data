'use client'
import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, MessageSquareWarning, Image as ImageIcon, Loader2, Maximize2, Download, X, MapPin, Send, User, Mail } from 'lucide-react'

interface Comment { id: string; comment_text: string; position_x: number | null; position_y: number | null; resolved: boolean; created_at: string }
interface Artwork {
  id: string; version: number; status: string; file_name: string
  designer_notes: string | null; preview_url: string | null
  job_number: string; job_title: string; customer_name: string | null
  comments: Comment[]
  company_name?: string
}

type Action = 'approve' | 'reject' | 'request_changes'

const ACTION_LABEL: Record<Action, string> = { approve: 'Approved', reject: 'Rejected', request_changes: 'Changes Requested' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ApproveArtworkClient({ token }: { token: string }) {
  const [artwork, setArtwork] = useState<Artwork | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<Action | null>(null)
  const [result, setResult] = useState<Action | null>(null)
  const [notesFor, setNotesFor] = useState<Action | null>(null)
  const [notes, setNotes] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null)
  const [pinText, setPinText] = useState('')
  const [pinSubmitting, setPinSubmitting] = useState(false)

  // Client Approval Enhancement: name + email are required before any
  // approve/reject/request-changes decision (comments/markup pins don't
  // need them — those stay informal). Enforced here for a fast inline
  // error, and again server-side since this is a public unauthenticated
  // endpoint and the client-side check alone is not trustworthy.
  const [approverName, setApproverName] = useState('')
  const [approverEmail, setApproverEmail] = useState('')
  const [identityTouched, setIdentityTouched] = useState(false)
  const isIdentityValid = approverName.trim().length > 0 && EMAIL_RE.test(approverEmail.trim())

  useEffect(() => {
    fetch(`/api/v1/public/artwork/${token}`)
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Could not load this artwork.')
        setArtwork(json.data)
        if (['approved', 'rejected'].includes(json.data.status)) setResult(json.data.status === 'approved' ? 'approve' : 'reject')
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  const respond = async (action: Action) => {
    setIdentityTouched(true)
    if (!isIdentityValid) return
    setSubmitting(action)
    try {
      const res = await fetch(`/api/v1/public/artwork/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action, notes: notes.trim() || undefined,
          approver_name: approverName.trim(), approver_email: approverEmail.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Something went wrong.')
      setResult(action)
      setNotesFor(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(null)
    }
  }

  const startDecision = (action: Action) => {
    setIdentityTouched(true)
    if (!isIdentityValid) return
    if (action === 'approve') { respond('approve'); return }
    setNotesFor(action)
  }

  const submitPin = async () => {
    if (!pendingPin || !pinText.trim()) return
    setPinSubmitting(true)
    try {
      const res = await fetch(`/api/v1/public/artwork/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'comment', comment_text: pinText.trim(), position_x: pendingPin.x, position_y: pendingPin.y }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not add comment.')
      setArtwork(prev => prev ? { ...prev, comments: [...prev.comments, json.data] } : prev)
      setPendingPin(null)
      setPinText('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPinSubmitting(false)
    }
  }

  const isApproved = artwork?.status === 'approved' || result === 'approve'

  return (
    <div className="min-h-screen bg-[#0b0d12] text-[#e6e8ec] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 mb-6 justify-center text-[#8a8f9c]">
          <ImageIcon size={18} />
          <span className="text-sm font-medium tracking-wide uppercase">{artwork?.company_name || 'Jafson Print Pack'} — Artwork Approval</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-[#8a8f9c] py-16">
            <Loader2 size={18} className="animate-spin" /> Loading…
          </div>
        )}

        {!loading && error && !result && (
          <div className="rounded-xl border border-[#3a2020] bg-[#1a1414] p-8 text-center">
            <XCircle size={32} className="mx-auto mb-3 text-[#e5484d]" />
            <p className="text-[#e6e8ec] font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && result && (
          <div className={`rounded-xl border p-8 text-center ${result === 'approve' ? 'border-[#1f3a2a] bg-[#101a14]' : result === 'reject' ? 'border-[#3a2020] bg-[#1a1414]' : 'border-[#3a3520] bg-[#1a1810]'}`}>
            {result === 'approve'
              ? <CheckCircle2 size={36} className="mx-auto mb-3 text-[#3fb865]" />
              : result === 'reject'
                ? <XCircle size={36} className="mx-auto mb-3 text-[#e5484d]" />
                : <MessageSquareWarning size={36} className="mx-auto mb-3 text-[#d4a72c]" />}
            <p className="text-lg font-semibold text-[#e6e8ec]">Artwork {ACTION_LABEL[result]}</p>
            <p className="text-sm text-[#8a8f9c] mt-1.5">
              {result === 'approve'
                ? 'Thank you — this artwork is now approved for print.'
                : result === 'reject'
                  ? "We've recorded your response. Our team will follow up with you."
                  : "We've recorded your requested changes. Our designer will follow up with a revised version."}
            </p>
          </div>
        )}

        {!loading && !error && !result && artwork && (
          <div className="rounded-xl border border-[#22252c] bg-[#12141a] overflow-hidden">
            <div className="p-6 border-b border-[#22252c]">
              <p className="text-xs text-[#8a8f9c] uppercase tracking-wide">Job {artwork.job_number} — Version {artwork.version}</p>
              <p className="text-xl font-bold text-[#e6e8ec]">{artwork.job_title}</p>
              {artwork.customer_name && <p className="text-sm text-[#8a8f9c] mt-1">For {artwork.customer_name}</p>}
            </div>

            {artwork.preview_url && (
              <div className="relative bg-[#0e1015] flex items-center justify-center p-4">
                <div className="relative inline-block">
                  <img src={artwork.preview_url} alt={artwork.file_name} className="max-h-[420px] rounded-lg cursor-crosshair"
                    onClick={e => {
                      const rect = (e.target as HTMLImageElement).getBoundingClientRect()
                      const x = ((e.clientX - rect.left) / rect.width) * 100
                      const y = ((e.clientY - rect.top) / rect.height) * 100
                      setPendingPin({ x, y })
                      setPinText('')
                    }} />
                  {artwork.comments.map(c => c.position_x !== null && c.position_y !== null && (
                    <div key={c.id} title={c.comment_text}
                      className={`absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${c.resolved ? 'bg-[#101a14] border-[#3fb865] text-[#3fb865]' : 'bg-[#1a1414] border-[#e5484d] text-[#e5484d]'}`}
                      style={{ left: `${c.position_x}%`, top: `${c.position_y}%` }}>
                      <MapPin size={11} />
                    </div>
                  ))}
                  {pendingPin && (
                    <div className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-[#d4a72c] bg-[#1a1810] flex items-center justify-center animate-pulse"
                      style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%` }}>
                      <MapPin size={11} className="text-[#d4a72c]" />
                    </div>
                  )}
                </div>
                <div className={`absolute top-6 right-6 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${isApproved ? 'bg-[#101a14] border-[#1f3a2a] text-[#3fb865]' : 'bg-[#1a1414]/90 border-[#3a2020] text-[#e5484d]'}`}>
                  {isApproved ? 'APPROVED FOR PRINT' : 'NOT APPROVED'}
                </div>
                <button onClick={() => setFullscreen(true)}
                  className="absolute bottom-6 right-6 w-9 h-9 rounded-full bg-[#12141a]/90 border border-[#22252c] flex items-center justify-center text-[#8a8f9c] hover:text-[#e6e8ec] transition-colors">
                  <Maximize2 size={14} />
                </button>
                <a href={artwork.preview_url} download={artwork.file_name}
                  className="absolute bottom-6 left-6 w-9 h-9 rounded-full bg-[#12141a]/90 border border-[#22252c] flex items-center justify-center text-[#8a8f9c] hover:text-[#e6e8ec] transition-colors">
                  <Download size={14} />
                </a>
              </div>
            )}

            {pendingPin && (
              <div className="px-6 py-4 border-t border-[#22252c] space-y-2 bg-[#0e1015]">
                <p className="text-xs text-[#8a8f9c] flex items-center gap-1"><MapPin size={12} /> Comment on this spot</p>
                <div className="flex items-center gap-2">
                  <input value={pinText} onChange={e => setPinText(e.target.value)} autoFocus
                    onKeyDown={e => e.key === 'Enter' && submitPin()}
                    placeholder="e.g. Move logo 2mm left, barcode too small…"
                    className="flex-1 h-9 px-3 rounded-lg border border-[#22252c] bg-[#12141a] text-sm text-[#e6e8ec] placeholder:text-[#565b66] focus:outline-none focus:border-[#3a3f4a]" />
                  <button onClick={submitPin} disabled={pinSubmitting || !pinText.trim()}
                    className="h-9 px-3 rounded-lg bg-[#2e7d46] text-white text-sm hover:bg-[#357d4a] disabled:opacity-50 transition-colors flex items-center gap-1.5">
                    {pinSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                  <button onClick={() => setPendingPin(null)} className="h-9 px-3 rounded-lg border border-[#22252c] text-[#8a8f9c] text-sm hover:bg-[#181b22] transition-colors">Cancel</button>
                </div>
              </div>
            )}

            {artwork.comments.length > 0 && (
              <div className="px-6 py-4 border-t border-[#22252c] space-y-2">
                <p className="text-xs text-[#6b7080] uppercase tracking-wide">Your Comments</p>
                {artwork.comments.map(c => (
                  <div key={c.id} className="flex items-start gap-2 text-sm">
                    {c.position_x !== null && <MapPin size={12} className="mt-0.5 flex-shrink-0 text-[#8a8f9c]" />}
                    <p className={c.resolved ? 'text-[#565b66] line-through' : 'text-[#c5c9d1]'}>{c.comment_text}</p>
                  </div>
                ))}
              </div>
            )}

            {artwork.designer_notes && (
              <div className="px-6 py-4 border-t border-[#22252c] text-sm text-[#8a8f9c]"><span className="text-[#6b7080]">Designer notes: </span>{artwork.designer_notes}</div>
            )}

            {/* Approver identity — required before approve/reject/request-changes */}
            <div className="px-6 py-4 border-t border-[#22252c] space-y-3 bg-[#0e1015]">
              <p className="text-xs text-[#6b7080] uppercase tracking-wide">Your Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#565b66]" />
                  <input value={approverName} onChange={e => setApproverName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#22252c] bg-[#12141a] text-sm text-[#e6e8ec] placeholder:text-[#565b66] focus:outline-none focus:border-[#3a3f4a]" />
                </div>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#565b66]" />
                  <input value={approverEmail} onChange={e => setApproverEmail(e.target.value)} type="email"
                    placeholder="you@company.com"
                    className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#22252c] bg-[#12141a] text-sm text-[#e6e8ec] placeholder:text-[#565b66] focus:outline-none focus:border-[#3a3f4a]" />
                </div>
              </div>
              {identityTouched && !isIdentityValid && (
                <p className="text-xs text-[#e5484d]">Please enter your name and a valid email before continuing.</p>
              )}
            </div>

            {notesFor ? (
              <div className="p-6 border-t border-[#22252c] space-y-3">
                <label className="text-sm text-[#8a8f9c]">{notesFor === 'reject' ? 'Why are you rejecting this artwork?' : 'What changes would you like?'}</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} autoFocus
                  placeholder={notesFor === 'reject' ? 'Optional — let us know why' : 'e.g. Move logo 2mm left, barcode too small…'}
                  className="w-full px-3 py-2 rounded-lg border border-[#22252c] bg-[#0e1015] text-sm text-[#e6e8ec] placeholder:text-[#565b66] focus:outline-none focus:border-[#3a3f4a]" />
                <div className="flex gap-3">
                  <button onClick={() => setNotesFor(null)} className="flex-1 h-10 rounded-lg border border-[#22252c] text-[#8a8f9c] text-sm hover:bg-[#181b22] transition-colors">Cancel</button>
                  <button onClick={() => respond(notesFor)} disabled={!!submitting}
                    className="flex-1 h-10 rounded-lg bg-[#2e7d46] text-white text-sm font-medium hover:bg-[#357d4a] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Submit'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 border-t border-[#22252c] flex gap-3">
                <button onClick={() => startDecision('reject')} disabled={!!submitting}
                  className="flex-1 h-11 rounded-lg border border-[#3a2020] text-[#e5484d] font-medium text-sm hover:bg-[#1a1414] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <XCircle size={16} /> Reject
                </button>
                <button onClick={() => startDecision('request_changes')} disabled={!!submitting}
                  className="flex-1 h-11 rounded-lg border border-[#3a3520] text-[#d4a72c] font-medium text-sm hover:bg-[#1a1810] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  <MessageSquareWarning size={16} /> Request Changes
                </button>
                <button onClick={() => startDecision('approve')} disabled={!!submitting}
                  className="flex-1 h-11 rounded-lg bg-[#2e7d46] text-white font-medium text-sm hover:bg-[#357d4a] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {submitting === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Approve
                </button>
              </div>
            )}
          </div>
        )}

        {fullscreen && artwork?.preview_url && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-6" onClick={() => setFullscreen(false)}>
            <button onClick={() => setFullscreen(false)} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-[#12141a] border border-[#22252c] flex items-center justify-center text-[#e6e8ec]">
              <X size={18} />
            </button>
            <img src={artwork.preview_url} alt={artwork.file_name} className="max-w-full max-h-full rounded-lg" />
          </div>
        )}
      </div>
    </div>
  )
}
