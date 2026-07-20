import { NextResponse, type NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { withErrorHandling } from '@/lib/utils/apiHandler'

// Generates a QR code PNG for a job/dispatch/plate identifier, embedded
// directly in print pages via <img src="/api/v1/print/qr?data=...">.
// Deliberately unauthenticated — this only encodes whatever text the caller
// passes in (a job number, not sensitive data), the same way a print page's
// static assets are unauthenticated. It does not read from the database.
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const data = searchParams.get('data')
  if (!data) return NextResponse.json({ error: 'data param is required' }, { status: 400 })

  const buffer = await QRCode.toBuffer(data, {
    type: 'png',
    width: 200,
    margin: 1,
    errorCorrectionLevel: 'M',
  })

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})
