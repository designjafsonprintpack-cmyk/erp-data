/**
 * Maps a courier name (as typed into the dispatch form — free text, not a
 * fixed list) to their official tracking page. These are the couriers'
 * general tracking pages, not deep-linked with the tracking number, because
 * none of the major Pakistani couriers publish a documented URL query-param
 * format for direct linking — guessing one risks a broken link, which is
 * worse than a working page that needs the number pasted in. The tracking
 * number is copied to the clipboard when the link opens so pasting it is
 * one action, not a re-type.
 *
 * Unrecognized courier names fall back to a Google search for
 * "<courier> tracking <number>" — still one click, never a dead end.
 */
const KNOWN_COURIERS: { match: RegExp; name: string; url: string }[] = [
  { match: /tcs/i, name: 'TCS', url: 'https://www.tcsexpress.com/track/' },
  { match: /leopard/i, name: 'Leopards Courier', url: 'https://www.leopardscourier.com/' },
  { match: /blue.?ex/i, name: 'BlueEx', url: 'https://www.blue-ex.com/' },
  { match: /trax/i, name: 'Trax', url: 'https://trax.pk/' },
  { match: /m\s*&\s*p|muller/i, name: 'M&P', url: 'https://mnptracking.com.pk/' },
  { match: /rider/i, name: 'Rider', url: 'https://www.riderpk.com/' },
  { match: /call\s*courier/i, name: 'Call Courier', url: 'https://callcourier.com.pk/' },
  { match: /postex/i, name: 'PostEx', url: 'https://postex.pk/' },
]

export function getCourierTrackingLink(courierName: string | null, trackingNumber: string | null): { url: string; label: string } | null {
  if (!courierName?.trim()) return null

  const known = KNOWN_COURIERS.find(c => c.match.test(courierName))
  if (known) return { url: known.url, label: `Track on ${known.name}` }

  if (trackingNumber?.trim()) {
    const q = encodeURIComponent(`${courierName} tracking ${trackingNumber}`)
    return { url: `https://www.google.com/search?q=${q}`, label: `Search "${courierName}" tracking` }
  }

  return null
}
