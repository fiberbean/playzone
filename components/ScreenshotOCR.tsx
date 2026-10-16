// components/ScreenshotOCR.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from '@/components/ui/Toast'

interface ExtractedData {
  utr?: string
  amount?: number
  screenshotBlob: Blob
  previewUrl: string
}

interface Props {
  onExtracted: (data: ExtractedData) => void
  /** Optional: last accepted amount, for "use this" compare */
  expectedAmount?: number
}

export function ScreenshotOCR({ onExtracted, expectedAmount }: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<string | null>(null)

  // NEW: state for showing what was detected
  const [detected, setDetected] = useState<{
    utr?: string
    amount?: number
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [])

  const resetPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview(null)
    setExtractedText(null)
    setDetected(null)
    setProgress(0)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large', 'Max 10 MB')
      return
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
    const previewUrl = URL.createObjectURL(file)
    previewUrlRef.current = previewUrl

    setPreview(previewUrl)
    setProcessing(true)
    setProgress(0)
    setExtractedText(null)
    setDetected(null)

    try {
      const Tesseract = await import('tesseract.js')

      const result = await Tesseract.recognize(file, 'eng', {
        logger: (m: any) => {
          if (!mountedRef.current) return
          if (m.status === 'recognizing text') {
            setProgress(Math.floor(m.progress * 100))
          }
        },
      })

      if (!mountedRef.current) return

      const text = result.data.text
      setExtractedText(text)

      // ---- UTR extraction ----
      const utrPatterns = [
        /\bUTR[\s:#-]*([0-9]{10,18})\b/i,
        /UPI\s*(?:transaction\s*)?(?:id|ref|reference)[\s:#-]*([A-Z0-9]{8,22})/i,
        /(?:transaction|txn)\s*(?:id|no\.?|number)?[\s:#-]*([A-Z0-9]{10,22})/i,
        /ref(?:erence)?\s*(?:no\.?|number|id)?[\s:#-]*([A-Z0-9]{8,22})/i,
        /\b(\d{12})\b/,
        /\b(\d{10,18})\b/,
      ]

      let utr: string | undefined
      for (const pattern of utrPatterns) {
        const match = text.match(pattern)
        if (match && match[1]) {
          utr = match[1].replace(/\s/g, '')
          break
        }
      }

      // ---- Amount extraction (context-aware) ----
      const MIN_AMT = 10
      const MAX_AMT = 50000

      const parseAmt = (s: string): number | null => {
        const n = Number(s.replace(/[,\s]/g, ''))
        if (isNaN(n) || n < MIN_AMT || n > MAX_AMT) return null
        return n
      }

      const allAmounts: { value: number; context: string; score: number }[] = []

      const rupeeRegex = /(?:₹|Rs\.?|INR)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi
      let m: RegExpExecArray | null
      while ((m = rupeeRegex.exec(text)) !== null) {
        const val = parseAmt(m[1])
        if (val === null) continue
        const ctx = text.slice(Math.max(0, m.index - 40), m.index + 60).toLowerCase()
        let score = 1

        if (/\b(paid|sent|debited|amount|total)\b/.test(ctx)) score += 3
        if (/\bpaid\s+to\b|\bsent\s+to\b/.test(ctx)) score += 4
        if (/\b(am|pm|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|\d{4}\s*$)/.test(ctx)) {
          score -= 5
        }
        if (/\b(utr|transaction\s*id|txn|ref)\b/.test(ctx)) score -= 4

        allAmounts.push({ value: val, context: ctx, score })
      }

      const paidRegex = /\b(?:paid|sent|debited)\s*:?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi
      while ((m = paidRegex.exec(text)) !== null) {
        const val = parseAmt(m[1])
        if (val === null) continue
        allAmounts.push({ value: val, context: m[0].toLowerCase(), score: 4 })
      }

      let amount: number | undefined
      if (allAmounts.length > 0) {
        const freq = new Map<number, number>()
        for (const a of allAmounts) freq.set(a.value, (freq.get(a.value) ?? 0) + 1)

        allAmounts.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score
          return (freq.get(b.value) ?? 0) - (freq.get(a.value) ?? 0)
        })

        amount = allAmounts[0].value
      }

      console.log('[OCR] Amount candidates:', allAmounts)
      console.log('[OCR] Picked amount:', amount)

      setDetected({ utr, amount })

      onExtracted({
        utr,
        amount,
        screenshotBlob: file,
        previewUrl,
      })

      // Smarter toasts
      if (utr && amount) {
        toast.success('Detected', `UTR: ${utr} · ₹${amount}`)
      } else if (utr) {
        toast.success('UTR detected', `Auto-filled: ${utr}`)
      } else if (amount) {
        toast.success('Amount detected', `₹${amount}`)
      } else {
        toast.warning('Nothing detected', 'Please fill UTR & amount manually')
      }
    } catch (e) {
      console.error('OCR error:', e)
      if (!mountedRef.current) return
      toast.error('OCR failed', 'Please enter UTR manually')
      onExtracted({
        screenshotBlob: file,
        previewUrl,
      })
    } finally {
      if (mountedRef.current) setProcessing(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {!preview ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.removeAttribute('capture')
                inputRef.current.click()
              }
            }}
            className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-cyan-500/30 hover:border-cyan-500/60 bg-cyan-500/5 transition"
          >
            <span className="text-3xl">🖼️</span>
            <span className="text-xs font-bold tracking-wider text-cyan-300">
              UPLOAD SCREENSHOT
            </span>
            <span className="text-[10px] text-gray-500">From gallery</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.setAttribute('capture', 'environment')
                inputRef.current.click()
              }
            }}
            className="flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-pink-500/30 hover:border-pink-500/60 bg-pink-500/5 transition"
          >
            <span className="text-3xl">📷</span>
            <span className="text-xs font-bold tracking-wider text-pink-300">
              TAKE PHOTO
            </span>
            <span className="text-[10px] text-gray-500">Use camera</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Preview */}
          <div className="relative rounded-xl overflow-hidden border border-cyan-500/30 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Screenshot preview"
              className="w-full max-h-72 object-contain"
              onError={() => {
                toast.error('Preview failed', 'Please retry upload')
                resetPreview()
              }}
            />
            <button
              type="button"
              onClick={resetPreview}
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-red-500/90 hover:bg-red-500 rounded-full text-white text-sm"
            >
              ✕
            </button>

            {processing && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
                <div className="text-4xl mb-3 animate-pulse">🔍</div>
                <div className="text-sm font-bold text-cyan-300 tracking-wider mb-2">
                  SCANNING SCREENSHOT
                </div>
                <div className="w-48 h-1.5 rounded-full bg-neutral-800 overflow-hidden mb-1">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-pink-400 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-[10px] text-gray-400 font-mono">{progress}%</div>
              </div>
            )}
          </div>

          {/* NEW: Detected chips — visible feedback */}
          {detected && !processing && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2">
              <div className="text-[10px] font-bold tracking-wider text-cyan-300">
                ✓ AUTO-DETECTED
              </div>

              {/* UTR chip */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400">UTR / Ref</span>
                {detected.utr ? (
                  <span className="font-mono text-xs text-green-300 bg-green-500/10 px-2 py-1 rounded border border-green-500/30">
                    {detected.utr}
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-300 italic">
                    Not detected — enter manually
                  </span>
                )}
              </div>

              {/* Amount chip */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400">Amount</span>
                {detected.amount ? (
                  <span className="font-mono text-xs text-green-300 bg-green-500/10 px-2 py-1 rounded border border-green-500/30">
                    ₹{detected.amount}
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-300 italic">
                    Not detected — verify amount
                  </span>
                )}
              </div>

              {/* Hint if detected amount differs from expected */}
              {detected.amount && expectedAmount && detected.amount !== expectedAmount && (
                <div className="text-[10px] text-amber-300 pt-1 border-t border-cyan-500/20">
                  ⚠ Detected ₹{detected.amount}, expected ₹{expectedAmount}. Verify before submit.
                </div>
              )}
            </div>
          )}

          {/* Extracted text (debug) */}
          {extractedText && !processing && (
            <details className="rounded-lg bg-neutral-900/50 border border-white/10 p-2">
              <summary className="text-[10px] text-gray-500 cursor-pointer tracking-wider font-bold">
                VIEW EXTRACTED TEXT (debug)
              </summary>
              <pre className="text-[10px] text-gray-400 mt-2 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                {extractedText}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}