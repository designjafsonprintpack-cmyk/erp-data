export function formatDate(date: string | Date | null, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return '—'
  // Intl.DateTimeFormat throws if `dateStyle` is combined with individual
  // component options (day/month/weekday/year/etc.) — it's one or the
  // other, never both. Only fall back to the default dateStyle when the
  // caller didn't ask for a specific format; otherwise use exactly what
  // was passed in.
  return new Intl.DateTimeFormat('en-PK', options ?? { dateStyle: 'medium' }).format(new Date(date))
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

export function formatTimeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function formatCurrency(amount: number, currency = 'PKR'): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount)
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '…'
}
