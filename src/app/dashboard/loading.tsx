import { Skeleton } from '@/components/ui/Skeleton'

// Route-level loading state for every /dashboard page that doesn't define
// its own loading.tsx. Before this existed, navigation showed a blank
// frozen screen while server components fetched — this generic layout
// (title + stat band + content panel) roughly matches most pages' shape.
export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--color-border)]">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-5 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    </div>
  )
}
