import type { MetadataRoute } from 'next'
import { getPublicCompanyInfo } from '@/lib/utils/getPublicCompanyInfo'

/**
 * Web app manifest — lets the ERP be installed to a phone's home screen and
 * run without browser chrome. This matters most for the shop floor: Scan,
 * Printing, Die Cutting and QC are one-tap-from-home tasks, and running them
 * in a browser tab wastes ~110px of vertical space to the address bar.
 *
 * Served by Next.js at /manifest.webmanifest — no route or public file needed.
 * Company name is read from the same source the header and login page use, so
 * the installed app is branded correctly per company.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const company = await getPublicCompanyInfo()

  return {
    name: company.name || 'Jafson Print ERP',
    short_name: 'Jafson ERP',
    description: 'Enterprise Printing & Packaging ERP System',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0d1117',
    theme_color: '#0d1117',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
