'use client'
import type { MarkupShape } from '@/lib/schemas/publicToken'

// Read-only renderer for customer-drawn markup (migration 090). Used by the
// public approval page AND both staff comment modals — the same drawing has to
// look identical everywhere, and this repo has already been bitten by keeping
// two copies of one component (StatCard).

export interface MarkupMark {
  id: string
  comment_text: string
  comment_type?: 'comment' | 'emboss' | null
  shape?: MarkupShape | null
  position_x: number | null
  position_y: number | null
  resolved?: boolean
}

/** Marks that appear ON the image: anything drawn, plus legacy pinned comments. */
export function visibleMarks<T extends MarkupMark>(list: T[]): T[] {
  return list.filter(m => m.shape || (m.position_x !== null && m.position_y !== null))
}

/**
 * The number shown next to a mark. Shapes and legacy pins share one sequence
 * so the badge on the image always matches the numbered entry in the list —
 * every caller must use this rather than its own index.
 */
export function markNumber(list: MarkupMark[], id: string): number {
  return visibleMarks(list).findIndex(m => m.id === id) + 1
}

const EMBOSS_COLOR = '#d4a72c'

/** Colour a mark is drawn in — emboss always overrides whatever was picked. */
export function markColor(m: MarkupMark): string {
  if (m.comment_type === 'emboss') return EMBOSS_COLOR
  return m.shape?.color || '#e5484d'
}

/**
 * SVG `d` for one shape, in the 0-100 percentage space of the viewBox.
 * Exported so the customer-side editor draws its in-progress strokes with
 * exactly the same geometry the staff side will later render.
 */
export function pathFor(shape: MarkupShape): string {
  const p = shape.points
  if (p.length === 0) return ''
  const [x0, y0] = p[0]

  if (shape.tool === 'rect') {
    const [x1, y1] = p[1] ?? p[0]
    const [lx, rx] = [Math.min(x0, x1), Math.max(x0, x1)]
    const [ty, by] = [Math.min(y0, y1), Math.max(y0, y1)]
    return `M ${lx} ${ty} L ${rx} ${ty} L ${rx} ${by} L ${lx} ${by} Z`
  }

  if (shape.tool === 'arrow') {
    const [x1, y1] = p[1] ?? p[0]
    // Head is built in the line's own direction, then scaled back down so it
    // stays a sensible size however long the arrow is.
    const dx = x1 - x0, dy = y1 - y0
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len, uy = dy / len
    const head = Math.min(6, len * 0.35)
    const hx = x1 - ux * head, hy = y1 - uy * head
    const wing = head * 0.5
    return [
      `M ${x0} ${y0} L ${x1} ${y1}`,
      `M ${x1} ${y1} L ${hx - uy * wing} ${hy + ux * wing}`,
      `M ${x1} ${y1} L ${hx + uy * wing} ${hy - ux * wing}`,
    ].join(' ')
  }

  // pen (and the anchor of a text mark, which draws nothing on its own)
  if (shape.tool === 'text') return ''
  return p.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
}

/** Where the number badge sits for a mark. */
function anchorOf(m: MarkupMark): { x: number; y: number } | null {
  if (m.shape && m.shape.points.length > 0) {
    if (m.shape.tool === 'rect') {
      const [[x0, y0], [x1, y1]] = [m.shape.points[0], m.shape.points[1] ?? m.shape.points[0]]
      return { x: Math.min(x0, x1), y: Math.min(y0, y1) }
    }
    const [x, y] = m.shape.points[0]
    return { x, y }
  }
  if (m.position_x !== null && m.position_y !== null) return { x: m.position_x, y: m.position_y }
  return null
}

/**
 * Absolutely positioned layer — the parent must be `relative` and sized by the
 * image itself.
 *
 * Two stacked layers on purpose: an SVG for the geometry, and plain HTML for
 * the number badges. The SVG uses preserveAspectRatio="none" so 0-100 maps
 * straight onto the image regardless of its aspect ratio, which would squash
 * anything drawn inside it — hence vector-effect="non-scaling-stroke" on the
 * strokes, and badges kept out of the SVG entirely.
 */
export function MarkupOverlay({ marks, size = 'md' }: { marks: MarkupMark[]; size?: 'sm' | 'md' | 'lg' }) {
  const shown = visibleMarks(marks)
  if (shown.length === 0) return null

  const badge = size === 'lg' ? 'w-6 h-6 text-[11px]' : size === 'sm' ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[10px]'
  const strokeWidth = size === 'lg' ? 3 : 2.5

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        {shown.map(m => {
          if (!m.shape) return null
          const d = pathFor(m.shape)
          if (!d) return null
          return (
            <path key={m.id} d={d}
              fill="none" stroke={markColor(m)} strokeWidth={strokeWidth}
              strokeLinecap="round" strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity={m.resolved ? 0.35 : 1} />
          )
        })}
      </svg>

      {shown.map(m => {
        const a = anchorOf(m)
        if (!a) return null
        return (
          <div key={m.id}
            title={m.comment_type === 'emboss' ? `Emboss: ${m.comment_text}` : m.comment_text}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 flex items-center justify-center font-bold text-white ${badge}`}
            style={{ left: `${a.x}%`, top: `${a.y}%`, backgroundColor: markColor(m), opacity: m.resolved ? 0.5 : 1 }}>
            {markNumber(marks, m.id)}
          </div>
        )
      })}
    </div>
  )
}

export default MarkupOverlay
