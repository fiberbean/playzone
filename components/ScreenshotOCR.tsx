// components/ScreenshotOCR.tsx
'use client'

import { useState, useRef } from 'react'
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

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large', 'Max 10 MB')
      return
    }

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file)
    setPreview(previewUrl)
    setProcessing(true)
    setProgress(0)
    setExtractedText(null)

    try {
      // Dynamic import — only load when needed (saves bundle)
      const Tesseract = await import('tesseract.js')

      const result = await Tesseract.recognize(file, 'eng', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.floor(m.progress * 100))
          }
        },
      })

      const text = result.data.text
      setExtractedText(text)

      // ---- UTR extraction patterns ----
      // Common patterns in UPI screenshots:
      //   "UTR: 402312345678"  →  UTR + 12 digits
      //   "UPI transaction ID 4023XXXX"
      //   "Transaction ID: 123456789012"
      //   "Reference: 402312345678"
      //   "Ref No. 402312345678"
      const utrPatterns = [
        /UTR[\s:#-]*(\d{9,18})/i,
        /UPI\s*(?:transaction\s*)?(?:id|ref|reference)[\s:#-]*([A-Z0-9]{8,20})/i,
        /(?:transaction|txn|ref(?:erence)?)\s*(?:id|no\.?|number)?[\s:#-]*([A-Z0-9]{10,20})/i,
        /\b(\d{12})\b/,        // fallback: 12 consecutive digits
        /\b(\d{10,18})\b/,     // fallback: 10-18 digits
      ]

      let utr: string | undefined
      for (const pattern of utrPatterns) {
        const match = text.match(pattern)
        if (match && match[1]) {
          utr = match[1].replace(/\s/g, '')
          break
        }
      }

      // ---- Amount extraction ----
      // Matches: "₹500", "Rs 500", "INR 500", "500.00"
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
      toast.error('OCR failed', 'Please enter UTR manually')
      onExtracted({
        screenshotBlob: file,
        previewUrl,
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
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
          {/* Preview */}
          <div className="relative rounded-xl overflow-hidden border border-cyan-500/30 bg-black">
            <img
              src={preview}
              alt="Screenshot preview"
              className="w-full max-h-72 object-contain"
            />
            <button
              type="button"
              onClick={() => {
                setPreview(null)
                setExtractedText(null)
                setProgress(0)
                if (inputRef.current) inputRef.current.value = ''
              }}
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-red-500/90 hover:bg-red-500 rounded-full text-white text-sm"
            >
              ✕
            </button>

            {/* Progress overlay */}
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

          {/* Extracted text preview (collapsed, useful for debug) */}
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