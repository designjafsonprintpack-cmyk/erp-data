'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface ScrollRowProps {
  children: ReactNode
  /** Classes for the outer positioning wrapper. */
  className?: string
  /** Classes for the scrolling track itself (layout, gap, padding). */
  contentClassName?: string
  /** Forwarded to the scrolling track, e.g. "tablist". */
  role?: string
  /**
   * Selector for the element that should be scrolled into view whenever it
   * changes — used to pull the active tab back on screen after a filter change
   * or a page load that lands on a tab which is off to the right.
   */
  activeSelector?: string
  /** Changing this re-runs the scroll-into-view. Pass the active key. */
  activeKey?: string
  /**
   * Wrap onto multiple lines below `md` instead of scrolling sideways.
   *
   * For a row of six or seven filter chips this is the right answer on a
   * phone: nothing leaves the screen at all, every option is visible without
   * discovering that the row scrolls. At `md` and above the row goes back to a
   * single scrolling line, so tablet and desktop are untouched.
   */
  wrap?: boolean
}

/** Width of the fade at each end, in px. */
const FADE = 28

/**
 * Horizontally scrollable row with overflow-aware edge fades.
 *
 * WHY THIS EXISTS
 * The tab and filter rows already scrolled (overflow-x-auto, scrollbar hidden),
 * but on a phone that reads as broken rather than scrollable: the last chip is
 * sliced clean through by the viewport edge with nothing to suggest there is
 * more to the right. Reported from the device test as "tab buttons bahir ja
 * rahe hain".
 *
 * The fix is a soft fade at whichever end currently has hidden content — the
 * universal signal for "this scrolls". A cut-off chip under a gradient reads as
 * continuation; the same chip against a hard edge reads as a layout bug.
 *
 * Implemented as a CSS mask rather than a gradient overlay in the page colour,
 * so it works on any background and needs no colour prop. The edges are
 * measured (ResizeObserver + scroll), so a row that fits shows no fade at all
 * and desktop output is pixel-identical to before.
 */
export function ScrollRow({
  children,
  className,
  contentClassName,
  role,
  activeSelector,
  activeKey,
  wrap = false,
}: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState(false)
  const [end, setEnd] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    // 1px tolerance — sub-pixel layout leaves a permanent phantom fade otherwise.
    const max = el.scrollWidth - el.clientWidth
    setStart(el.scrollLeft > 1)
    setEnd(el.scrollLeft < max - 1)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  // Tab labels carry live counts, so the track's width changes without the box
  // ever resizing. Re-measuring after every render is cheaper than watching the
  // subtree, and settles immediately because the state only updates on change.
  useEffect(measure)

  // Keep the selected tab visible — otherwise the one tab the user cares about
  // can sit off-screen with no indication of which is active.
  useEffect(() => {
    if (!activeSelector) return
    const el = ref.current
    if (!el) return
    // No-op while wrapped — there is nothing to scroll, and calling
    // scrollIntoView anyway can nudge the whole page.
    if (el.scrollWidth <= el.clientWidth) return
    const target = el.querySelector(activeSelector)
    if (target) {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      measure()
    }
  }, [activeSelector, activeKey, measure])

  const mask =
    start && end
      ? `linear-gradient(to right, transparent 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), transparent 100%)`
      : start
        ? `linear-gradient(to right, transparent 0, #000 ${FADE}px, #000 100%)`
        : end
          ? `linear-gradient(to right, #000 0, #000 calc(100% - ${FADE}px), transparent 100%)`
          : undefined

  return (
    <div className={cn('relative min-w-0', className)}>
      <div
        ref={ref}
        role={role}
        onScroll={measure}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        className={cn(
          'flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none',
          contentClassName,
          // AFTER contentClassName on purpose: cn() is tailwind-merge, so a
          // `gap-1` passed by a call site would otherwise cancel the row gap.
          // Wrapped rows have no horizontal overflow, so the fade measurement
          // resolves to "no fade" on its own — the mask needs no breakpoint logic.
          wrap && 'flex-wrap gap-y-1.5 md:flex-nowrap md:gap-y-0'
        )}
      >
        {children}
      </div>
    </div>
  )
}

export default ScrollRow
