import type { Metadata } from 'next'
import './globals.css'
import { getPublicCompanyInfo } from '@/lib/utils/getPublicCompanyInfo'

export async function generateMetadata(): Promise<Metadata> {
  const company = await getPublicCompanyInfo()
  return {
    title: company.name,
    description: 'Enterprise Printing & Packaging ERP System',
    icons: { icon: '/favicon.ico' },
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="github-dark" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
