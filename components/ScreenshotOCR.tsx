// components/ScreenshotOCR.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from '@/components/ui/Toast'

interface Props {
  onExtracted: (data: {
    utr?: string
    amount?: number
    screenshotBlob: Blob
    previewUrl: string
  }) => void
}

export function ScreenshotOCR({ onExtracted }: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  // Track mount + cleanup blob URLs to avoid React #441 on mobile
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

    // Revoke any old blob URL before creating new one
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
    const previewUrl = URL.createObjectURL(file)
    previewUrlRef.current = previewUrl

    setPreview(previewUrl)
    setProcessing(true)
    setProgress(0)
    setExtractedText(null)

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

      const utrPatterns = [
        /UTR[\s:#-]*(\d{9,18})/i,
        /UPI\s*(?:transaction\s*)?(?:id|ref|reference)[\s:#-]*([A-Z0-9]{8,20})/i,
        /(?:transaction|txn|ref(?:erence)?)\s*(?:id|no\.?|number)?[\s:#-]*([A-Z0-9]{10,20})/i,
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

      const amountPatterns = [
        /(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.\d{1,2})?)/i,
        /\b([0-9]{2,6}(?:\.\d{1,2})?)\s*(?:paid|sent|debited)/i,
      ]

      let amount: number | undefined
      for (const pattern of amountPatterns) {
        const match = text.match(pattern)
        if (match && match[1]) {
          const parsed = Number(match[1].replace(/,/g, ''))
          if (parsed > 0 && parsed < 100000) {
            amount = parsed
            break
          }
        }
      }

      if (!mountedRef.current) return

      onExtracted({
        utr,
        amount,
        screenshotBlob: file,
        previewUrl,
      })

      if (utr) {
        toast.success('UTR detected', `Auto-filled: ${utr}`)
      } else {
        toast.warning('UTR not detected', 'Please enter manually')
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
            <span className="text-[10px] text-gray-500">
              From gallery
            </span>
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
            <span className="text-[10px] text-gray-500">
              Use camera
            </span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden border border-cyan-500/30 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Screenshot preview"
              className="w-full max-h-72 object-contain"
              onError={() => {
                // If blob URL is broken, reset gracefully
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
                <div className="text-[10px] text-gray-400 font-mono">
                  {progress}%
                </div>
              </div>
            )}
          </div>

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