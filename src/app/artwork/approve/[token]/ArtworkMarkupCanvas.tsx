'use client'
import { useRef, useState } from 'react'
import { Pencil, ArrowUpRight, Square, Type, Stamp, Undo2, Trash2, Check, X, Loader2, Maximize2 } from 'lucide-react'
import { MarkupOverlay, pathFor, type MarkupMark } from '@/components/artwork/MarkupOverlay'
import type { MarkupShape } from '@/lib/schemas/publicToken'

// WhatsApp-style markup editor for the customer approval link.
//
// Everything the customer draws stays local until they press Save, which is
// what makes Undo feel the way it does in WhatsApp — it takes back the last
// stroke, not a database row. Saving posts the whole session in one request
// (action: 'save_marks') so a normal amount of marking up can't trip the
// route's rate limit.

export type Tool = 'pen' | 'arrow' | 'rect' | 'text' | 'emboss'

export interface DraftMark {
  key: string
  comment_text: string
  comment_type: 'comment' | 'emboss'
  shape: MarkupShape
  position_x: number | null
  position_y: number | null
}

const COLORS = ['#e5484d', '#d4a72c', '#3fb865', '#5b8def', '#ffffff']
const EMBOSS_COLOR = '#d4a72c'

// A freehand stroke fires pointermove far faster than the drawing needs. Points
// closer together than this (in percent of the image) are dropped, which keeps
// a saved row small without any visible loss of accuracy.
const MIN_POINT_GAP = 0.6
const MAX_POINTS = 500

const TOOLS: { id: Tool; label: string; Icon: typeof Pencil }[] = [
  { id: 'pen',    label: 'Draw',   Icon: Pencil },
  { id: 'arrow',  label: 'Arrow',  Icon: ArrowUpRight },
  { id: 'rect',   label: 'Box',    Icon: Square },
  { id: 'text',   label: 'Text',   Icon: Type },
  { id: 'emboss', label: 'Emboss', Icon: Stamp },
]

/** The shape tool actually stored — 'emboss' is a box with a fixed meaning. */
const shapeToolFor = (t: Tool): MarkupShape['tool'] => (t === 'emboss' ? 'rect' : t)

export default function ArtworkMarkupCanvas({
  imageUrl, fileName, savedMarks, drafts, setDrafts, onSave, onDelete, saving, disabled,
}: {
  imageUrl: string
  fileName: string
  savedMarks: MarkupMark[]
  drafts: DraftMark[]
  setDrafts: (fn: (prev: DraftMark[]) => DraftMark[]) => void
  onSave: () => Promise<void>
  onDelete: (id: string) => Promise<void>
  saving: boolean
  disabled?: boolean
}) {
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [drawing, setDrawing] = useState<MarkupShape | null>(null)
  const [pending, setPending] = useState<MarkupShape | null>(null)
  // Captured when the stroke is finished, not read from `tool` at save time —
  // otherwise switching tools while the label box is open would silently turn
  // an emboss mark into an ordinary comment.
  const [pendingIsEmboss, setPendingIsEmboss] = useState(false)
  const [label, setLabel] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  const activeColor = tool === 'emboss' ? EMBOSS_COLOR : color

  // Pointer position as a percentage of the image, clamped so a finger that
  // slides off the edge still produces a valid coordinate.
  const pointAt = (e: React.PointerEvent): [number, number] => {
    const rect = surfaceRef.current!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    return [
      Math.round(Math.min(100, Math.max(0, x)) * 10) / 10,
      Math.round(Math.min(100, Math.max(0, y)) * 10) / 10,
    ]
  }

  const start = (e: React.PointerEvent) => {
    if (disabled || pending) return
    const p = pointAt(e)
    // Text drops a single anchor and goes straight to asking what it says.
    if (tool === 'text') {
      setPending({ tool: 'text', color: activeColor, points: [p] })
      setPendingIsEmboss(false)
      setLabel('')
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrawing({ tool: shapeToolFor(tool), color: activeColor, points: [p] })
  }

  const move = (e: React.PointerEvent) => {
    if (!drawing) return
    const p = pointAt(e)
    setDrawing(prev => {
      if (!prev) return prev
      // Arrow and box are always exactly two points: origin and current.
      if (prev.tool === 'arrow' || prev.tool === 'rect') {
        return { ...prev, points: [prev.points[0], p] }
      }
      if (prev.points.length >= MAX_POINTS) return prev
      const [lx, ly] = prev.points[prev.points.length - 1]
      if (Math.hypot(p[0] - lx, p[1] - ly) < MIN_POINT_GAP) return prev
      return { ...prev, points: [...prev.points, p] }
    })
  }

  const end = () => {
    if (!drawing) return
    const shape = drawing
    setDrawing(null)
    // A tap rather than a drag — nothing meaningful was drawn.
    if (shape.points.length < 2) return
    setPending(shape)
    setPendingIsEmboss(tool === 'emboss')
    setLabel('')
  }

  const confirmPending = () => {
    if (!pending) return
    const isEmboss = pendingIsEmboss
    const text = label.trim() || (isEmboss ? 'Emboss this area' : 'Marked on artwork')
    const [ax, ay] = pending.points[0]
    setDrafts(prev => [...prev, {
      key: `${Date.now()}-${prev.length}`,
      comment_text: text,
      comment_type: isEmboss ? 'emboss' : 'comment',
      shape: pending,
      position_x: ax,
      position_y: ay,
    }])
    setPending(null)
    setLabel('')
  }

  const undo = () => {
    if (drawing) { setDrawing(null); return }
    if (pending) { setPending(null); setLabel(''); return }
    setDrafts(prev => prev.slice(0, -1))
  }

  const clearAll = () => {
    setDrawing(null)
    setPending(null)
    setDrafts(() => [])
  }

  const removeSaved = async (id: string) => {
    setDeleting(id)
    try { await onDelete(id) } finally { setDeleting(null) }
  }

  // Drafts and the stroke under the finger, drawn with the same geometry the
  // staff side will use for the saved version.
  const DraftLayer = () => (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
      {drafts.map(d => {
        const dd = pathFor(d.shape)
        return dd ? <path key={d.key} d={dd} fill="none" stroke={d.shape.color} strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null
      })}
      {drawing && pathFor(drawing) && (
        <path d={pathFor(drawing)} fill="none" stroke={drawing.color} strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      )}
      {pending && pending.tool === 'text' && (
        <circle cx={pending.points[0][0]} cy={pending.points[0][1]} r={1.2} fill={pending.color} />
      )}
      {drafts.filter(d => d.shape.tool === 'text').map(d => (
        <circle key={`t-${d.key}`} cx={d.shape.points[0][0]} cy={d.shape.points[0][1]} r={1.2} fill={d.shape.color} />
      ))}
    </svg>
  )

  const totalMarks = savedMarks.length + drafts.length

  return (
    <div className="bg-[#0e1015]">
      {/* Drawing surface. touch-action:none is load-bearing — without it a
          finger drag scrolls the page instead of drawing. */}
      <div className="relative flex items-center justify-center p-4">
        <div ref={surfaceRef}
          className="relative inline-block touch-none select-none"
          style={{ touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={fileName} draggable={false} className="max-h-[420px] rounded-lg pointer-events-none" />
          <MarkupOverlay marks={savedMarks} />
          <DraftLayer />
        </div>

        <button onClick={() => setFullscreen(true)} type="button"
          className="absolute bottom-6 right-6 w-9 h-9 rounded-full bg-[#12141a]/90 border border-[#22252c] flex items-center justify-center text-[#8a8f9c] hover:text-[#e6e8ec] transition-colors">
          <Maximize2 size={14} />
        </button>
      </div>

      {!disabled && (
        <>
          {/* Toolbar */}
          <div className="px-4 pb-3 space-y-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {TOOLS.map(({ id, label: tl, Icon }) => (
                <button key={id} type="button" onClick={() => setTool(id)}
                  className={`flex-shrink-0 h-11 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    tool === id
                      ? id === 'emboss'
                        ? 'border-[#d4a72c] bg-[#1a1810] text-[#d4a72c]'
                        : 'border-[#5b8def] bg-[#101520] text-[#5b8def]'
                      : 'border-[#22252c] text-[#8a8f9c] hover:bg-[#181b22]'}`}>
                  <Icon size={14} /> {tl}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {tool === 'emboss' ? (
                  <span className="text-xs text-[#d4a72c] flex items-center gap-1.5">
                    <Stamp size={12} /> Emboss marks are always amber
                  </span>
                ) : COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? 'border-white scale-110' : 'border-[#22252c]'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button type="button" onClick={undo} disabled={!drawing && !pending && drafts.length === 0}
                  className="h-11 px-3 rounded-lg border border-[#22252c] text-[#8a8f9c] text-xs font-medium flex items-center gap-1.5 hover:bg-[#181b22] disabled:opacity-40 transition-colors">
                  <Undo2 size={14} /> Undo
                </button>
                <button type="button" onClick={clearAll} disabled={drafts.length === 0 && !drawing && !pending}
                  className="h-11 px-3 rounded-lg border border-[#22252c] text-[#8a8f9c] text-xs font-medium flex items-center gap-1.5 hover:bg-[#181b22] disabled:opacity-40 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <p className="text-xs text-[#565b66]">
              {tool === 'emboss'
                ? 'Jo emboss karana hai us par box banayein, phir uska naam likhein.'
                : tool === 'text'
                  ? 'Jahan likhna hai wahan tap karein.'
                  : 'Artwork par ungli/mouse se banayein — ghalti ho to Undo dabayein.'}
            </p>
          </div>

          {/* Label for the stroke just drawn */}
          {pending && (
            <div className="px-4 pb-3 space-y-2">
              <p className="text-xs text-[#8a8f9c]">
                {pendingIsEmboss ? 'Yeh kya emboss hona hai?' : 'Yeh kya hai? (optional)'}
              </p>
              <div className="flex items-center gap-2">
                <input value={label} onChange={e => setLabel(e.target.value)} autoFocus
                  onKeyDown={e => e.key === 'Enter' && confirmPending()}
                  placeholder={pendingIsEmboss ? 'e.g. Logo' : 'e.g. Move this 2mm left'}
                  className="flex-1 h-10 px-3 rounded-lg border border-[#22252c] bg-[#12141a] text-sm text-[#e6e8ec] placeholder:text-[#565b66] focus:outline-none focus:border-[#3a3f4a]" />
                <button type="button" onClick={confirmPending}
                  className="h-10 px-3 rounded-lg bg-[#2e7d46] text-white text-sm hover:bg-[#357d4a] transition-colors flex items-center gap-1.5">
                  <Check size={15} />
                </button>
                <button type="button" onClick={() => { setPending(null); setLabel('') }}
                  className="h-10 px-3 rounded-lg border border-[#22252c] text-[#8a8f9c] text-sm hover:bg-[#181b22] transition-colors">
                  <X size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Save */}
          {drafts.length > 0 && !pending && (
            <div className="px-4 pb-4">
              <button type="button" onClick={onSave} disabled={saving}
                className="w-full h-11 rounded-lg bg-[#2e7d46] text-white text-sm font-medium hover:bg-[#357d4a] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Save {drafts.length} mark{drafts.length > 1 ? 's' : ''}
              </button>
            </div>
          )}
        </>
      )}

      {/* Everything marked so far, saved rows removable */}
      {totalMarks > 0 && (
        <div className="px-4 pb-4 space-y-1.5">
          <p className="text-xs text-[#6b7080] uppercase tracking-wide">Marks on this artwork</p>
          {savedMarks.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg border border-[#22252c] bg-[#12141a] px-3 py-2">
              <span className="w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ backgroundColor: m.comment_type === 'emboss' ? EMBOSS_COLOR : (m.shape?.color || '#e5484d') }}>
                {i + 1}
              </span>
              {m.comment_type === 'emboss' && <Stamp size={12} className="flex-shrink-0 text-[#d4a72c]" />}
              <p className="flex-1 text-sm text-[#c5c9d1]">{m.comment_text}</p>
              {!disabled && (
                <button type="button" onClick={() => removeSaved(m.id)} disabled={deleting === m.id}
                  aria-label="Remove this mark"
                  className="w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center text-[#565b66] hover:text-[#e5484d] transition-colors disabled:opacity-40">
                  {deleting === m.id ? <Loader2 size={12} className="animate-spin" /> : <X size={13} />}
                </button>
              )}
            </div>
          ))}
          {drafts.map(d => (
            <div key={d.key} className="flex items-center gap-2 rounded-lg border border-dashed border-[#3a3f4a] bg-[#12141a] px-3 py-2">
              <span className="w-4 h-4 flex-shrink-0 rounded-full" style={{ backgroundColor: d.shape.color }} />
              {d.comment_type === 'emboss' && <Stamp size={12} className="flex-shrink-0 text-[#d4a72c]" />}
              <p className="flex-1 text-sm text-[#c5c9d1]">{d.comment_text}</p>
              <span className="text-[10px] text-[#565b66] uppercase tracking-wide">Not saved</span>
            </div>
          ))}
        </div>
      )}

      {fullscreen && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-6" onClick={() => setFullscreen(false)}>
          <button type="button" onClick={() => setFullscreen(false)}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-[#12141a] border border-[#22252c] flex items-center justify-center text-[#e6e8ec]">
            <X size={18} />
          </button>
          <div className="relative inline-block" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={fileName} className="max-w-full max-h-[90vh] rounded-lg" />
            <MarkupOverlay marks={savedMarks} size="lg" />
          </div>
        </div>
      )}
    </div>
  )
}

export { ArtworkMarkupCanvas }
