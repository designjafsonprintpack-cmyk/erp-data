'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import jsQR from 'jsqr'
import { ScanLine, CameraOff, Loader2, AlertCircle } from 'lucide-react'
import { toast } from '@/components/ui/Toast'

// A job/dispatch QR just encodes the plain document number (JOB-..., DISP-...
// — see get_next_sequence_number's p_document_type). No lookup API call is
// needed to know WHICH kind of document it is; the prefix alone routes it.
const ROUTES: { prefix: string; searchPath: string; detailPath: (id: string) => string; numberField: string }[] = [
  { prefix: 'JOB-',  searchPath: '/api/v1/jobs?search=',     detailPath: id => `/dashboard/jobs/${id}`,     numberField: 'job_number' },
  { prefix: 'DISP-', searchPath: '/api/v1/dispatch?search=', detailPath: id => `/dashboard/dispatch/${id}`, numberField: 'dispatch_number' },
]

export default function ScanClient() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>()
  const [error, setError] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)
  const lastScanned = useRef<string | null>(null)

  const lookup = useCallback(async (code: string) => {
    if (looking || code === lastScanned.current) return
    lastScanned.current = code
    setLooking(true)

    const route = ROUTES.find(r => code.startsWith(r.prefix))
    if (!route) {
      toast.error(`Unrecognized code: ${code}`)
      setLooking(false)
      setTimeout(() => { lastScanned.current = null }, 2000)
      return
    }

    try {
      const res = await fetch(`${route.searchPath}${encodeURIComponent(code)}`)
      const json = await res.json()
      const match = (json.data ?? []).find((row: any) => row[route.numberField] === code)
      if (!match) {
        toast.error(`No match found for ${code}`)
        setLooking(false)
        setTimeout(() => { lastScanned.current = null }, 2000)
        return
      }
      router.push(route.detailPath(match.id))
    } catch {
      toast.error('Lookup failed — check your connection')
      setLooking(false)
      setTimeout(() => { lastScanned.current = null }, 2000)
    }
  }, [looking, router])

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        scanLoop()
      } catch {
        setError('Could not access camera. Check browser permissions.')
      }
    }

    function scanLoop() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scanLoop)
        return
      }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { rafRef.current = requestAnimationFrame(scanLoop); return }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      if (code?.data) lookup(code.data)
      rafRef.current = requestAnimationFrame(scanLoop)
    }

    start()
    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [lookup])

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <ScanLine size={22} /> Scan
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Point the camera at a job card or dispatch label QR code.</p>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-[var(--color-border)] bg-black aspect-square">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70 p-6 text-center">
            <CameraOff size={28} />
            <p className="text-sm">{error}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-8 border-2 border-white/60 rounded-lg pointer-events-none" />
            {looking && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="animate-spin text-white" size={28} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-[var(--color-text-muted)]">
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <p>Recognizes job card QR codes (JOB-...) and dispatch label QR codes (DISP-...). Camera access requires HTTPS.</p>
      </div>
    </div>
  )
}
