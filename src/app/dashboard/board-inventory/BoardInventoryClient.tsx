'use client'
import { useState } from 'react'
import { Layers, Plus, TrendingUp, TrendingDown, SlidersHorizontal, AlertTriangle, Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'

interface BoardItem {
  id: string; description: string; gsm: number | null; size_l: number | null; size_w: number | null
  current_stock: number; reserved_stock: number; reorder_level: number
  unit_cost: number; location: string | null; is_active: boolean
  board_types?: { name: string } | null
}
interface BoardType { id: string; name: string }
interface Unit { id: string; name: string; symbol: string }

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

export default function BoardInventoryClient({ initialItems, boardTypes, units }: { initialItems: BoardItem[]; boardTypes: BoardType[]; units: Unit[] }) {
  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState('')
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [movementModal, setMovementModal] = useState<{ item: BoardItem; action: 'in' | 'out' | 'adjustment' } | null>(null)
  const [loading, setLoading] = useState(false)

  const [addForm, setAddForm] = useState({
    description: '', board_type_id: '', gsm: '', size_l: '', size_w: '',
    current_stock: '0', reorder_level: '0', unit_id: '', unit_cost: '0', location: '',
  })
  const [moveForm, setMoveForm] = useState({ quantity: '', notes: '' })

  const filtered = items
    .filter(i => !search || i.description.toLowerCase().includes(search.toLowerCase()))
    .filter(i => !showLowOnly || i.current_stock <= i.reorder_level)

  const totalStock = items.reduce((s, i) => s + i.current_stock, 0)
  const lowStockCount = items.filter(i => i.current_stock <= i.reorder_level).length

  const addItem = async () => {
    if (!addForm.description) { toast.error('Description required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/board-inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      const bt = boardTypes.find(b => b.id === addForm.board_type_id)
      setItems(prev => [...prev, { ...data, board_types: bt ? { name: bt.name } : null }].sort((a, b) => a.description.localeCompare(b.description)))
      setAddModal(false)
      setAddForm({ description: '', board_type_id: '', gsm: '', size_l: '', size_w: '', current_stock: '0', reorder_level: '0', unit_id: '', unit_cost: '0', location: '' })
      toast.success('Item added to inventory')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const applyMovement = async () => {
    if (!movementModal) return
    const qty = parseFloat(moveForm.quantity || '0')
    if (qty <= 0 && movementModal.action !== 'adjustment') { toast.error('Quantity must be greater than 0'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/board-inventory/${movementModal.item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: movementModal.action, quantity: qty, notes: moveForm.notes }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setItems(prev => prev.map(i => i.id === movementModal.item.id ? { ...i, current_stock: (data as any).current_stock } : i))
      setMovementModal(null)
      setMoveForm({ quantity: '', notes: '' })
      toast.success(movementModal.action === 'in' ? 'Stock added' : movementModal.action === 'out' ? 'Stock reduced' : 'Stock adjusted')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Stock Items', value: items.length, icon: Layers, color: 'var(--color-accent)' },
          { label: 'Total Units in Stock', value: totalStock.toLocaleString(), icon: TrendingUp, color: 'var(--color-success)' },
          { label: 'Low Stock Alerts', value: lowStockCount, icon: AlertTriangle, color: lowStockCount > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `color-mix(in srgb, ${stat.color} 10%, transparent)` }}>
              <stat.icon size={18} style={{ color: stat.color }} />
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">{stat.label}</p>
              <p className="text-xl font-bold text-[var(--color-text-primary)]">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search inventory…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors" />
        </div>
        <button onClick={() => setShowLowOnly(!showLowOnly)}
          className={cn('flex items-center gap-1.5 px-3 h-9 rounded-md border text-sm font-medium transition-colors',
            showLowOnly ? 'bg-[var(--color-warning)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-warning)]')}>
          <AlertTriangle size={14} /> Low Stock
        </button>
        <button onClick={() => setAddModal(true)}
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors ml-auto">
          <Plus size={15} /> Add Item
        </button>
      </div>

      {/* Inventory table */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          <div className="col-span-3">Description</div>
          <div className="col-span-2">Type / GSM</div>
          <div className="col-span-2">Size</div>
          <div className="col-span-1 text-right">Stock</div>
          <div className="col-span-1 text-right">Reorder</div>
          <div className="col-span-1">Location</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {filtered.map((item, idx) => {
            const isLow = item.current_stock <= item.reorder_level
            const isOut = item.current_stock <= 0
            return (
              <div key={item.id} className={cn('grid grid-cols-12 gap-3 px-5 py-3.5 items-center',
                idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15',
                isOut && 'border-l-2 border-l-[var(--color-danger)]',
                isLow && !isOut && 'border-l-2 border-l-[var(--color-warning)]')}>
                <div className="col-span-3 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{item.description}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-[var(--color-text-secondary)]">{item.board_types?.name || '—'}</p>
                  {item.gsm && <p className="text-xs text-[var(--color-text-muted)]">{item.gsm} GSM</p>}
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {item.size_l && item.size_w ? `${item.size_l} × ${item.size_w}` : '—'}
                  </p>
                </div>
                <div className="col-span-1 text-right">
                  <span className={cn('text-sm font-bold',
                    isOut ? 'text-[var(--color-danger)]' : isLow ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]')}>
                    {item.current_stock.toLocaleString()}
                  </span>
                  {isLow && !isOut && <AlertTriangle size={11} className="text-[var(--color-warning)] inline ml-1" />}
                  {isOut && <span className="block text-xs text-[var(--color-danger)]">OUT</span>}
                </div>
                <div className="col-span-1 text-right text-xs text-[var(--color-text-muted)]">{item.reorder_level.toLocaleString()}</div>
                <div className="col-span-1 text-xs text-[var(--color-text-muted)] truncate">{item.location || '—'}</div>
                <div className="col-span-2 flex items-center gap-1 justify-end">
                  <button onClick={() => { setMovementModal({ item, action: 'in' }); setMoveForm({ quantity: '', notes: '' }) }}
                    className="flex items-center gap-1 px-2 h-7 rounded border border-[var(--color-success)]/30 text-xs text-[var(--color-success)] hover:bg-[var(--color-success)]/10 transition-colors">
                    <TrendingUp size={11} /> In
                  </button>
                  <button onClick={() => { setMovementModal({ item, action: 'out' }); setMoveForm({ quantity: '', notes: '' }) }}
                    className="flex items-center gap-1 px-2 h-7 rounded border border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors">
                    <TrendingDown size={11} /> Out
                  </button>
                  <button onClick={() => { setMovementModal({ item, action: 'adjustment' }); setMoveForm({ quantity: String(item.current_stock), notes: '' }) }}
                    className="flex items-center gap-1 px-2 h-7 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                    <SlidersHorizontal size={11} /> Adj
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div className="p-12 text-center">
            <Layers size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">{search ? 'No items match your search' : 'No inventory items yet'}</p>
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Inventory Item" size="md"
        footer={
          <>
            <button onClick={() => setAddModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={addItem} disabled={loading || !addForm.description}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Adding…' : 'Add Item'}
            </button>
          </>
        }>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Description <span className="text-[var(--color-danger)]">*</span></label>
            <input className={inputCls} value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. 300 GSM Duplex Board 25×36" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Board Type</label>
            <select className={inputCls} value={addForm.board_type_id} onChange={e => setAddForm(p => ({ ...p, board_type_id: e.target.value }))}>
              <option value="">Select…</option>
              {boardTypes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">GSM</label>
            <input type="number" className={inputCls} value={addForm.gsm} onChange={e => setAddForm(p => ({ ...p, gsm: e.target.value }))} placeholder="300" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Length (in)</label>
            <input type="number" className={inputCls} value={addForm.size_l} onChange={e => setAddForm(p => ({ ...p, size_l: e.target.value }))} placeholder="25" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Width (in)</label>
            <input type="number" className={inputCls} value={addForm.size_w} onChange={e => setAddForm(p => ({ ...p, size_w: e.target.value }))} placeholder="36" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Opening Stock</label>
            <input type="number" className={inputCls} value={addForm.current_stock} onChange={e => setAddForm(p => ({ ...p, current_stock: e.target.value }))} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Reorder Level</label>
            <input type="number" className={inputCls} value={addForm.reorder_level} onChange={e => setAddForm(p => ({ ...p, reorder_level: e.target.value }))} placeholder="100" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Unit Cost (PKR)</label>
            <input type="number" className={inputCls} value={addForm.unit_cost} onChange={e => setAddForm(p => ({ ...p, unit_cost: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Location</label>
            <input className={inputCls} value={addForm.location} onChange={e => setAddForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Rack A-3" />
          </div>
        </div>
      </Modal>

      {/* Movement Modal */}
      {movementModal && (
        <Modal open={true} onClose={() => setMovementModal(null)}
          title={movementModal.action === 'in' ? 'Stock In' : movementModal.action === 'out' ? 'Stock Out' : 'Adjust Stock'}
          size="sm"
          footer={
            <>
              <button onClick={() => setMovementModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={applyMovement} disabled={loading}
                className={cn('px-4 h-9 rounded-md text-white text-sm font-medium disabled:opacity-50 transition-colors',
                  movementModal.action === 'in' ? 'bg-[var(--color-success)] hover:opacity-90' :
                  movementModal.action === 'out' ? 'bg-[var(--color-danger)] hover:opacity-90' :
                  'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]')}>
                {loading ? 'Applying…' : 'Apply'}
              </button>
            </>
          }>
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{movementModal.item.description}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Current stock: <strong>{movementModal.item.current_stock.toLocaleString()}</strong></p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">
                {movementModal.action === 'adjustment' ? 'New Stock Quantity' : 'Quantity'}
                <span className="text-[var(--color-danger)]"> *</span>
              </label>
              <input type="number" className={inputCls} value={moveForm.quantity} onChange={e => setMoveForm(p => ({ ...p, quantity: e.target.value }))}
                placeholder={movementModal.action === 'adjustment' ? 'Enter exact stock count' : 'Enter quantity'} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
              <input className={inputCls} value={moveForm.notes} onChange={e => setMoveForm(p => ({ ...p, notes: e.target.value }))} placeholder="Reason for movement" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
