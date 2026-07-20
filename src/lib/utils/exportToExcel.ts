import * as XLSX from 'xlsx'

/**
 * Exports an array of flat objects to a downloaded .xlsx file. Column
 * headers are taken from the keys of the first row — callers should pass
 * already-shaped display data (e.g. formatted currency as a plain number,
 * not a "PKR 1,234" string) rather than raw API rows with internal-only
 * fields, so the exported sheet reads the way a report should.
 */
export function exportToExcel(rows: Record<string, any>[], filename: string, sheetName = 'Report') {
  if (!rows.length) return
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, `${filename}.xlsx`)
}
