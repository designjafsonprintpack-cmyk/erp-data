import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Jafson Print ERP',
  description: 'Enterprise Printing & Packaging ERP System',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="github-dark" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
