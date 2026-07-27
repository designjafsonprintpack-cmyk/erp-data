/**
 * What can change on a "Repeat with Changes" job (migration 097).
 *
 * The `value`s are exactly the slugs stored in `jobs.changed_aspects` and
 * validated by `jobSchema` — keep the three in step. Shared rather than
 * duplicated because the same labels appear on the New Job form, the Job
 * Detail warning banner and the printed Job Card, and a label that reads
 * differently on the print-out than on screen is worse than no label.
 *
 * `printed_rate` is the rate/MRP PRINTED ON THE BOX. It is never our selling
 * price — pricing is deliberately absent from Job Cards and Sales Orders.
 */
export interface ChangeAspect {
  value: string
  /** On-screen label. */
  label: string
  /** Shouted on the printed job card, where it has to read at arm's length. */
  printLabel: string
  hint?: string
}

export const CHANGE_ASPECTS: ChangeAspect[] = [
  { value: 'design',       label: 'Design / Artwork',   printLabel: 'DESIGN',       hint: 'New layout, logo or claim' },
  { value: 'expiry',       label: 'Expiry / Date Code', printLabel: 'EXPIRY' },
  { value: 'printed_rate', label: 'Printed Rate / MRP', printLabel: 'PRINTED RATE', hint: 'The price printed on the box' },
  { value: 'size',         label: 'Size',               printLabel: 'SIZE' },
  { value: 'board_gsm',    label: 'Board / GSM',        printLabel: 'BOARD / GSM' },
  { value: 'colors',       label: 'Colours',            printLabel: 'COLOURS' },
  { value: 'die',          label: 'Die',                printLabel: 'DIE' },
  { value: 'finishing',    label: 'Finishing',          printLabel: 'FINISHING' },
  { value: 'other',        label: 'Other',              printLabel: 'OTHER' },
]

const BY_VALUE = new Map(CHANGE_ASPECTS.map(a => [a.value, a]))

/** Screen labels for stored slugs. An unknown slug falls back to itself so a
 *  value written before this list grew never renders as a blank chip. */
export function changeAspectLabels(values: string[] | null | undefined): string[] {
  return (values ?? []).map(v => BY_VALUE.get(v)?.label ?? v)
}

/** Same, in the shouty form the printed job card uses. */
export function changeAspectPrintLabels(values: string[] | null | undefined): string[] {
  return (values ?? []).map(v => BY_VALUE.get(v)?.printLabel ?? v.toUpperCase())
}
