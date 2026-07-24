import { Skeleton } from '@/components/ui/Skeleton'

// Jobs list skeleton — mirrors the actual page: title row, filter chips,
// then a 12-col list. More accurate than the generic dashboard skeleton.
export default function JobsLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="flex items-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-md" />
        ))}
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <Skeleton className="h-3.5 w-full" />
        </div>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="px-5 py-3.5">
              <Skeleton className="h-9" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
