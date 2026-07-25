import type { Metadata, Viewport } from 'next'
import './globals.css'
import { getPublicCompanyInfo } from '@/lib/utils/getPublicCompanyInfo'

/**
 * Viewport / safe-area configuration.
 *
 * Next.js injects a default `width=device-width, initial-scale=1` on its own,
 * but NOT `viewport-fit=cover` — and without that the browser reports every
 * `env(safe-area-inset-*)` as 0, so the fixed header sits under the notch and
 * a bottom action bar sits under the gesture indicator. Declaring the export
 * explicitly also lets us set the browser-chrome colour per theme.
 *
 * `maximumScale` and `userScalable` are deliberately NOT set — capping zoom is
 * an accessibility failure, and the real cause of unwanted zoom (13px inputs)
 * is fixed properly in globals.css instead.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
}

export async function generateMetadata(): Promise<Metadata> {
  const company = await getPublicCompanyInfo()
  return {
    title: company.name,
    description: 'Enterprise Printing & Packaging ERP System',
    icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: company.name },
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="github-dark" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
