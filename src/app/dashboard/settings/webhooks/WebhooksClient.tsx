'use client'
import { useState } from 'react'
import { Plus, Trash2, Power, Copy, Check, X, ExternalLink, History } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { formatDateTime } from '@/lib/utils/format'

interface Endpoint {
  id: string; name: string; url: string; event_types: string[]; is_active: boolean; created_at: string
}
interface Delivery {
  id: string; event_type: string; status: string; response_code: number | null
  error_message: string | null; attempted_at: string | null
}

const EVENT_OPTIONS = [
  { value: 'dispatch.delivered', label: 'Dispatch Delivered', desc: 'Fires when a POD is confirmed and a challan is marked delivered' },
  { value: 'invoice.payment_recorded', label: 'Payment Recorded', desc: 'Fires when a payment is recorded against an invoice' },
]

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

export default function WebhooksClient({ initialEndpoints }: { initialEndpoints: Endpoint[] }) {
  const [endpoints, setEndpoints] = useState(initialEndpoints)
  const [addModal, setAddModal] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', event_types: [] as string[] })
  const [loading, setLoading] = useState(false)
  const [newSecret, setNewSecret] = useState<{ name: string; secret: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Endpoint | null>(null)
  const [logModal, setLogModal] = useState<Endpoint | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [logLoading, setLogLoading] = useState(false)

  const toggleEvent = (v: string) => setForm(p => ({
    ...p, event_types: p.event_types.includes(v) ? p.event_types.filter(e => e !== v) : [...p.event_types, v],
  }))

  const create = async () => {
    if (!form.name.trim() || !form.url.trim()) { toast.error('Name and URL are required'); return }
    if (form.event_types.length === 0) { toast.error('Select at least one event'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/webhooks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setEndpoints(prev => [{ id: data.id, name: data.name, url: data.url, event_types: data.event_types, is_active: data.is_active, created_at: data.created_at }, ...prev])
      setAddModal(false)
      setForm({ name: '', url: '', event_types: [] })
      setNewSecret({ name: data.name, secret: data.secret })
      toast.success('Webhook endpoint created')
    } catch (e: any) { toast.error(e.message || 'Failed to create') }
    finally { setLoading(false) }
  }

  const toggleActive = async (ep: Endpoint) => {
    try {
      const res = await fetch('/api/v1/webhooks', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ep.id, is_active: !ep.is_active }),
      })
      if (!res.ok) throw new Error()
      setEndpoints(prev => prev.map(e => e.id === ep.id ? { ...e, is_active: !e.is_active } : e))
    } catch { toast.error('Failed to update') }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const res = await fetch('/api/v1/webhooks', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }),
      })
      if (!res.ok) throw new Error()
      setEndpoints(prev => prev.filter(e => e.id !== deleteTarget.id))
      toast.success('Webhook endpoint removed')
    } catch { toast.error('Failed to delete') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  const openLog = async (ep: Endpoint) => {
    setLogModal(ep); setLogLoading(true); setDeliveries([])
    try {
      const res = await fetch(`/api/v1/webhooks/${ep.id}/deliveries`)
      const json = await res.json()
      setDeliveries(json.data ?? [])
    } catch { toast.error('Failed to load delivery log') }
    finally { setLogLoading(false) }
  }

  const testPing = async (ep: Endpoint) => {
    try {
      const res = await fetch(`/api/v1/webhooks/${ep.id}/test`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(json.ok ? 'Test ping delivered successfully' : `Test ping failed: ${json.error || 'no response'}`)
    } catch (e: any) { toast.error(e.message || 'Test ping failed') }
  }

  const copySecret = () => {
    if (!newSecret) return
    navigator.clipboard.writeText(newSecret.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setAddModal(true)}
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          <Plus size={14} /> Add Webhook
        </button>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        {endpoints.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">No webhook endpoints configured yet.</div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {endpoints.map(ep => (
              <div key={ep.id} className="px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">{ep.name}</span>
                    <span className={cn('text-xs px-1.5 py-0.5 rounded', ep.is_active ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]')}>
                      {ep.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] truncate flex items-center gap-1 mt-0.5">
                    <ExternalLink size={10} /> {ep.url}
                  </p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {ep.event_types.map(et => (
                      <span key={et} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">{et}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => testPing(ep)}
                    className="px-2.5 h-7 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                    Test
                  </button>
                  <button onClick={() => openLog(ep)} title="Delivery log"
                    className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors">
                    <History size={13} />
                  </button>
                  <button onClick={() => toggleActive(ep)} title={ep.is_active ? 'Pause' : 'Activate'}
                    className={cn('w-7 h-7 flex items-center justify-center rounded transition-colors', ep.is_active ? 'text-[var(--color-success)] hover:bg-[var(--color-success)]/10' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]')}>
                    <Power size={13} />
                  </button>
                  <button onClick={() => setDeleteTarget(ep)} title="Delete"
                    className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Webhook Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Webhook" size="md"
        footer={<>
          <button onClick={() => setAddModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={create} disabled={loading}
            className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {loading ? 'Creating…' : 'Create'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Name</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Our Accounting System" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">URL</label>
            <input className={inputCls} value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://your-system.com/webhook" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Events</label>
            <div className="space-y-2">
              {EVENT_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-start gap-2.5 p-2.5 rounded-md border border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-bg-elevated)] transition-colors">
                  <input type="checkbox" checked={form.event_types.includes(opt.value)} onChange={() => toggleEvent(opt.value)} className="mt-0.5" />
                  <div>
                    <p className="text-sm text-[var(--color-text-primary)]">{opt.label}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Secret reveal — shown ONCE right after creation */}
      <Modal open={!!newSecret} onClose={() => setNewSecret(null)} title="Webhook Created" size="md">
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Copy the signing secret for <strong className="text-[var(--color-text-primary)]">{newSecret?.name}</strong> now — it won&apos;t be shown again. Use it to verify the <code className="text-xs">X-Webhook-Signature</code> header (HMAC-SHA256) on incoming requests.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md px-3 py-2 break-all">{newSecret?.secret}</code>
            <button onClick={copySecret} className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
              {copied ? <Check size={14} className="text-[var(--color-success)]" /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delivery log */}
      <Modal open={!!logModal} onClose={() => setLogModal(null)} title={logModal ? `Delivery Log — ${logModal.name}` : ''} size="lg">
        {logLoading ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">Loading…</p>
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No deliveries yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-[var(--color-border-subtle)]">
            {deliveries.map(d => (
              <div key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--color-text-primary)]">{d.event_type}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{d.attempted_at ? formatDateTime(d.attempted_at) : '—'}{d.error_message ? ` · ${d.error_message}` : ''}</p>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0',
                  d.status === 'success' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]')}>
                  {d.status}{d.response_code ? ` (${d.response_code})` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete}
        title="Remove Webhook" message={`Stop sending events to "${deleteTarget?.name}"? This cannot be undone.`} loading={loading}
      />
    </div>
  )
}
