// Class name utility — merges Tailwind classes safely.
// Uses tailwind-merge so that conflicting utilities (e.g. base `w-full` +
// an override like `w-28`) resolve to whichever was passed LAST, matching
// call-site intent, instead of whichever happens to land later in the
// compiled stylesheet.
import { twMerge } from 'tailwind-merge'

export function cn(...classes: (string | undefined | null | false)[]): string {
  return twMerge(classes.filter(Boolean).join(' '))
}
