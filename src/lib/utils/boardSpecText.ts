/**
 * "208 gsm · 18.75 × 35 in" — board ki poori pehchan, ek satr mein.
 *
 * Board ka NAAM akela kaafi nahi hai. Live par "Bleach Board" naam ki 23 stock
 * rows hain, alag alag GSM aur alag alag sheet size ki — aur demand khud bhi
 * isi joray se match karti hai (135: gsm + sheet size, type sirf tarjeeh).
 * MRN par sirf "Bleach Board" likh kar Store ko bhejna us se ye ummeed rakhna
 * hai ke wo yaad rakhe ke kis job ka board kaunsa tha.
 *
 * `specification` ka khana MRN par pehle din se maujood hai, list bhi usay
 * dikhati hai — bas koi us mein likhta nahi tha.
 */
export function boardSpecText(j: {
  gsm?: number | string | null
  sheet_width_in?: number | string | null
  sheet_height_in?: number | string | null
}): string {
  const bits: string[] = []
  if (j.gsm != null && j.gsm !== '') bits.push(`${Number(j.gsm)} gsm`)
  if (j.sheet_width_in != null && j.sheet_height_in != null
      && j.sheet_width_in !== '' && j.sheet_height_in !== '') {
    bits.push(`${Number(j.sheet_width_in)} × ${Number(j.sheet_height_in)} in`)
  }
  return bits.join(' · ')
}

export default boardSpecText
