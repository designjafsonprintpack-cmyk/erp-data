'use client'
import { useState } from 'react'
import { Hash, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'

interface Seq { id: string; document_type: string; year: number; prefix: string; current_value: number; padding: number }

const DOC_LABELS: Record<string, string> = {
  JOB: 'Job Numbers', SO: 'Sales Orders', QT: 'Quotations', PO: 'Purchase Orders', DISP: 'Dispatches',
}

export default function SequencesClient({ sequences, companyId }: { sequences: Seq[]; companyId: string }) {
  const [seqs, setSeqs] = useState(sequences)
  const [editingType, setEditingType] = useState<string | null>(null)
  const [form, setForm] = useState({ prefix: '', padding: '5' })
  const [loading, setLoading] = useState(false)

  const previewNumber = (prefix: string, padding: number, current: number) =>
    `${prefix}-${new Date().getFullYear()}-${'0'.repeat(Math.max(0, padding - String(current + 1).length))}${current + 1}`

  const save = async (seq: Seq) => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/sequences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_type: seq.document_type, prefix: form.prefix, padding: parseInt(form.padding) }),
      })
      if (!res.ok) throw new Error()
      setSeqs(prev => prev.map(s => s.document_type === seq.document_type ? { ...s, prefix: form.prefix, padding: parseInt(form.padding) } : s))
      setEditingType(null)
      toast.success('Sequence updated')
    } catch { toast.error('Failed to update') }
    finally { setLoading(false) }
  }

  const inputCls = 'h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <Hash size={16} className="text-[var(--color-accent)]" />
        <span className="text-base font-semibold text-[var(--color-text-primary)]">Document Sequences — {new Date().getFullYear()}</span>
      </div>

      <div className="divide-y divide-[var(--color-border-subtle)]">
        {seqs.map((seq, idx) => {
          const isEditing = editingType === seq.document_type
          const preview = previewNumber(isEditing ? form.prefix : seq.prefix, isEditing ? parseInt(form.padding) : seq.padding, seq.current_value)

          return (
            <div key={seq.document_type} className={cn('px-5 py-4', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/20')}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">{DOC_LABELS[seq.document_type] || seq.document_type}</span>
                    <span className="text-xs font-mono bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20 px-2 py-0.5 rounded">{seq.document_type}</span>
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-[var(--color-text-muted)]">Prefix</label>
                        <input className={cn(inputCls, 'w-28')} value={form.prefix} onChange={e => setForm(p => ({ ...p, prefix: e.target.value.toUpperCase() }))} placeholder="PREFIX" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-[var(--color-text-muted)]">Padding (digits)</label>
                        <input className={cn(inputCls, 'w-24')} type="number" min="3" max="8" value={form.padding} onChange={e => setForm(p => ({ ...p, padding: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-[var(--color-text-muted)]">Preview</label>
                        <div className="h-9 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] flex items-center">
                          <span className="text-sm font-mono text-[var(--color-success)]">{preview}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-6">
                      <div>
                        <p className="text-xs text-[var(--color-text-muted)]">Prefix</p>
                        <p className="text-sm font-mono text-[var(--color-text-primary)]">{seq.prefix}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--color-text-muted)]">Padding</p>
                        <p className="text-sm text-[var(--color-text-primary)]">{seq.padding} digits</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--color-text-muted)]">Numbers issued</p>
                        <p className="text-sm text-[var(--color-text-primary)]">{seq.current_value.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--color-text-muted)]">Next number</p>
                        <p className="text-sm font-mono font-semibold text-[var(--color-accent)]">{preview}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 mt-1">
                  {isEditing ? (
                    <>
                      <button onClick={() => save(seq)} disabled={loading} className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-success)] text-white text-sm hover:opacity-90 disabled:opacity-50 transition-colors"><Check size={13} /> Save</button>
                      <button onClick={() => setEditingType(null)} className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors"><X size={13} /></button>
                    </>
                  ) : (
                    <button onClick={() => { setForm({ prefix: seq.prefix, padding: String(seq.padding) }); setEditingType(seq.document_type) }}
                      className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors">
                      <Pencil size={13} /> Edit
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/50">
        <p className="text-xs text-[var(--color-text-muted)]">
          Sequence numbers are generated atomically — concurrent users will never get duplicate numbers. Changes only affect future numbers.
        </p>
      </div>
    </div>
  )
}
