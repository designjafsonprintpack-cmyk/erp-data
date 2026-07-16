import { cn } from '@/lib/utils/cn'

interface SkeletonProps {
  className?: string
  lines?: number
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded bg-[var(--color-bg-elevated)]', className)} />
  )
}

export function SkeletonText({ lines = 3 }: SkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 && 'w-3/4')} />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <Card className="p-4 space-y-3">
      <Skeleton className="h-5 w-1/3" />
      <SkeletonText lines={3} />
    </Card>
  )
}

import { Card } from './Card'
export default Skeleton
