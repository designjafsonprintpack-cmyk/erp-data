'use client'
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
  closeOnBackdrop?: boolean
}

const sizeStyles = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-md',
  lg: 'md:max-w-lg',
  xl: 'md:max-w-2xl',
}

/**
 * Responsive dialog.
 *
 *   >= md (768px)  centred dialog, unchanged from the previous desktop look
 *   <  md          bottom sheet: full width, rounded top corners, drag handle
 *
 * The important change is not the sheet — it is the height model. The
 * previous version was `fixed inset-0 flex items-center justify-center` with
 * a `w-full` panel and NO height ceiling and NO internal scroll, while
 * `document.body.style.overflow` was locked to 'hidden'. Any modal taller
 * than the viewport therefore overflowed in BOTH directions: the top was
 * clipped off-screen and unreachable, the footer was clipped off the bottom,
 * and the page could not be scrolled to reach either. On a 667px-tall phone
 * that meant every modal with more than ~6 fields became unsubmittable, and
 * on a 768px-tall laptop it already affected QC Inspection (22 inputs),
 * Purchase Order and Add Plates.
 *
 * Now the panel is a flex column capped at 90dvh (dvh, not vh, so mobile
 * browser chrome is accounted for) with a fixed header, a scrolling body and
 * a fixed footer. All 60 existing call sites keep working unchanged — the
 * props contract is identical.
 */
export function Modal({ open, onClose, title, children, size = 'md', footer, closeOnBackdrop = true }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex justify-center',
        // Mobile: sheet anchored to the bottom edge, no outer padding.
        // Desktop: centred with breathing room, exactly as before.
        'items-end p-0',
        'md:items-center md:p-4'
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div className={cn(
        'relative w-full flex flex-col',
        // Height ceiling + internal scroll — this is the actual fix.
        'max-h-[90dvh] md:max-h-[85dvh]',
        'border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl animate-fade-in',
        // Sheet on mobile (top corners only), dialog on desktop.
        'rounded-t-2xl md:rounded-xl',
        sizeStyles[size]
      )}>
        {/* Drag handle — mobile affordance only, purely visual */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-[var(--color-border)]" />
        </div>

        {title && (
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 md:py-4 border-b border-[var(--color-border)] flex-shrink-0">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] truncate">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              // 44px touch target on mobile, unchanged visual weight on desktop
              className="w-11 h-11 md:w-8 md:h-8 -mr-2 md:-mr-1 flex items-center justify-center rounded-md flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Scrolling body — overscroll-contain stops the scroll chaining
            through to the (locked) page behind the sheet on iOS. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5">
          {children}
        </div>

        {footer && (
          <div className={cn(
            'flex items-center justify-end gap-2 px-5 pt-4 border-t border-[var(--color-border)] flex-shrink-0',
            'bg-[var(--color-bg-elevated)]',
            // 1rem of real padding PLUS the iOS gesture-bar inset, so the
            // primary action never sits under the home indicator. Resolves
            // to exactly 1rem on desktop (--safe-bottom is 0px there).
            'pb-[calc(1rem+var(--safe-bottom))]'
          )}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'primary' | 'danger'
  loading?: boolean
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', confirmVariant = 'danger', loading }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      {/* whitespace-pre-line: ek paighaam ab kai paragraph ka ho sakta hai
          (job delete wala batata hai ke kya jayega aur kya nahi). Mojooda saare
          paighaam ek hi satr ke hain, is liye kisi ki shakl nahi badalti. */}
      <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-line">{message}</p>
    </Modal>
  )
}

export default Modal
