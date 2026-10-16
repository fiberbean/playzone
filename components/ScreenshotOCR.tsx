// components/ScreenshotOCR.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from '@/components/ui/Toast'

type DateReason = 'not_found' | 'not_today' | 'future' | null
type MatchedBy = 'upi' | 'name' | null

interface ExtractedData {
  utr?: string
  amount?: number
  detectedDate?: string | null
  dateValid?: boolean
  dateReason?: DateReason
  upiApp?: string | null
  paymentMatched?: boolean
  matchedBy?: MatchedBy
  detectedPayee?: string | null
  screenshotBlob: Blob
  previewUrl: string
}

interface Props {
  onExtracted: (data: ExtractedData) => void
  expectedUpiId?: string
  expectedPayeeName?: string
  expectedAmount?: number
}

// ============ DATE EXTRACTION ============
function extractDateFromText(text: string): string | null {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const t = text.replace(/\s+/g, ' ')

  const p1 = /(?:\b(?:on|at|dated|date)\s*)?(\d{1,2})\s*[-/ ]?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,]+(\d{4})/i
  let m = t.match(p1)
  if (m) {
    const d = parseInt(m[1], 10)
    const mo = months.indexOf(m[2].toLowerCase().slice(0, 3)) + 1
    const y = parseInt(m[3], 10)
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  const p2 = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})[\s,]+(\d{4})/i
  m = t.match(p2)
  if (m) {
    const mo = months.indexOf(m[1].toLowerCase().slice(0, 3)) + 1
    const d = parseInt(m[2], 10)
    const y = parseInt(m[3], 10)
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  const p3 = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/
  m = t.match(p3)
  if (m) {
    const d = parseInt(m[1], 10)
    const mo = parseInt(m[2], 10)
    const y = parseInt(m[3], 10)
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  const p4 = /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/
  m = t.match(p4)
  if (m) {
    const y = parseInt(m[1], 10)
    const mo = parseInt(m[2], 10)
    const d = parseInt(m[3], 10)
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  const p5 = /\b(\d{1,2})\s*[a-z\s]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})\b/i
  m = t.match(p5)
  if (m) {
    const d = parseInt(m[1], 10)
    const mo = months.indexOf(m[2].toLowerCase().slice(0, 3)) + 1
    const y = parseInt(m[3], 10)
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  return null
}

function validateDate(isoDate: string | null): { valid: boolean; reason: DateReason } {
  if (!isoDate) return { valid: false, reason: 'not_found' }
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000 + now.getTimezoneOffset() * 60 * 1000)
  const todayISO = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`
  if (isoDate > todayISO) return { valid: false, reason: 'future' }
  if (isoDate !== todayISO) return { valid: false, reason: 'not_today' }
  return { valid: true, reason: null }
}

// ============ PAYMENT MATCH — UPI ID OR Payee Name ============
// Returns matched=true if EITHER UPI ID or payee name matches
function checkPaymentMatch(
  text: string,
  expectedUpiId: string | undefined,
  expectedPayeeName: string | undefined
): {
  matched: boolean
  detected: string | null
  matchedBy: MatchedBy
} {
  // Normalize text: lowercase, collapse spaces, remove punctuation except alphanumeric + space
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')   // replace punctuation with space
    .replace(/\s+/g, ' ')
    .trim()

  // ---- 1. UPI ID match ----
  if (expectedUpiId) {
    const expectedLower = expectedUpiId.toLowerCase().trim()
    const normalizedUpiId = expectedLower.replace(/[^\w]/g, ' ').replace(/\s+/g, ' ').trim()

    // Direct substring
    if (normalized.includes(normalizedUpiId)) {
      return { matched: true, detected: expectedUpiId, matchedBy: 'upi' }
    }

    // Flexible (user + handle)
    const parts = normalizedUpiId.split(' ')
    if (parts.length === 2) {
      const [user, handle] = parts
      const flex = new RegExp(
        `${user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+${handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i'
      )
      if (flex.test(normalized)) {
        return { matched: true, detected: expectedUpiId, matchedBy: 'upi' }
      }
    }
  }

  // ---- 2. Payee Name match ----
  if (expectedPayeeName) {
    const normalizedName = expectedPayeeName
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // 2a. Direct full-string substring match
    if (normalizedName.length >= 3 && normalized.includes(normalizedName)) {
      return { matched: true, detected: expectedPayeeName, matchedBy: 'name' }
    }

    // 2b. Word-based fuzzy (75%+ words match)
    const nameWords = normalizedName.split(' ').filter((w) => w.length >= 3)
    if (nameWords.length > 0) {
      const matchedWords = nameWords.filter((w) => normalized.includes(w))
      const ratio = matchedWords.length / nameWords.length
      if (ratio >= 0.75) {
        return { matched: true, detected: expectedPayeeName, matchedBy: 'name' }
      }
      // 2c. Partial — at least 2 significant words match AND total matched length > 8
      if (matchedWords.length >= 2) {
        const totalLen = matchedWords.reduce((s, w) => s + w.length, 0)
        if (totalLen >= 8) {
          return { matched: true, detected: expectedPayeeName, matchedBy: 'name' }
        }
      }
    }
  }

  // ---- 3. No match — try to detect any UPI or name for error message ----
  const anyUpi = normalized.match(/([a-z0-9]{2,})\s+([a-z]{2,})/gi)
  return { matched: false, detected: anyUpi?.[0] ?? null, matchedBy: null }
}

// ============ UPI APP DETECTION ============
function detectUpiApp(text: string): string | null {
  const t = text.toLowerCase()
  if (/\bphonepe\b/.test(t)) return 'PhonePe'
  if (/\bgpay\b|\bgoogle\s*pay\b|\btez\b/.test(t)) return 'GPay'
  if (/\bpaytm\b/.test(t)) return 'Paytm'
  if (/\bbhim\b/.test(t)) return 'BHIM'
  if (/\bamazon\s*pay\b/.test(t)) return 'Amazon Pay'
  if (/\bwhatsapp\s*pay\b/.test(t)) return 'WhatsApp Pay'
  if (/\bcred\b/.test(t)) return 'CRED'
  if (/\baxis\s*pay\b/.test(t)) return 'Axis Pay'
  if (/\bfreecharge\b/.test(t)) return 'Freecharge'
  if (/\bmobikwik\b/.test(t)) return 'Mobikwik'
  if (/\bslice\b/.test(t)) return 'Slice'
  if (/\bnavi\b/.test(t)) return 'Navi'
  if (/\bairtel\s*pay\b|\bairtel\s*thanks\b/.test(t)) return 'Airtel Pay'
  if (/\bmyjio\b|\bjio\s*pay\b/.test(t)) return 'JioPay'
  return null
}

// ============ AMOUNT EXTRACTION — SMART + FALLBACK ============
function extractAmount(text: string): number | undefined {
  const candidates: {
    value: number
    original: number
    context: string
    position: number
    score: number
  }[] = []

  const addCandidate = (raw: string, position: number, baseScore: number) => {
    const cleaned = raw.replace(/[,\s₹Rs.INR%]/gi, '').trim()
    const original = Number(cleaned)
    if (isNaN(original) || original <= 0 || original > 1000000) return

    const ctx = text.slice(Math.max(0, position - 60), position + 100).toLowerCase()
    let score = baseScore

    if (/\b(paid|sent|debited|amount|total|received)\b/.test(ctx)) score += 3
    if (/\bpaid\s+to\b|\bsent\s+to\b|\btransfer\s+to\b/.test(ctx)) score += 3
    if (/\bto\s+[A-Z][A-Za-z\s]+/.test(ctx)) score += 2
    if (/\b(utr|transaction\s*id|txn|ref|transaction\s*no)\b/.test(ctx)) score -= 8
    if (/\b(am|pm|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)\b/.test(ctx)) score -= 4
    if (/\b(payment\s+of|completed|history|expense|split|receipt|converted|emi|instalments)\b/.test(ctx)) score -= 5
    if (/\b(bank|account|account\s+number|ifsc)\b/.test(ctx)) score -= 3

    candidates.push({ value: original, original, context: ctx, position, score })
  }

  // ---- Layer 1: ₹/Rs/INR/% + number ----
  const rupeeRegex = /(?:₹|Rs\.?|INR|%)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi
  let m: RegExpExecArray | null
  while ((m = rupeeRegex.exec(text)) !== null) {
    addCandidate(m[1], m.index, 6)
  }

  // ---- Layer 2: keyword + number ----
  const keywordRegex = /\b(?:paid|amount|sent|debited|total|received|transfer)\s*:?\s*(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi
  while ((m = keywordRegex.exec(text)) !== null) {
    addCandidate(m[1], m.index, 7)
  }

  // ---- Layer 3: comma-separated big numbers ----
  const commaRegex = /\b([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.\d{1,2})?)\b/g
  while ((m = commaRegex.exec(text)) !== null) {
    addCandidate(m[1], m.index, 5)
  }

  // ---- Layer 4: numbers with 2 decimals ----
  const decimalRegex = /\b([0-9]{3,6}\.\d{2})\b/g
  while ((m = decimalRegex.exec(text)) !== null) {
    addCandidate(m[1], m.index, 4)
  }

  // ---- Layer 5 (FALLBACK): small standalone numbers 1-99999 next to account/beneficiary ----
  // Pattern: "XXXXXX2404 1" or "XXXXX5615 1" → amount is trailing digit(s)
  const accountTrailingRegex = /\b[Xx*]{4,}\d{2,6}\s+([0-9]{1,6})\b/g
  while ((m = accountTrailingRegex.exec(text)) !== null) {
    addCandidate(m[1], m.index, 6)
  }

  // ---- Layer 6 (FALLBACK): standalone small number on its own line ----
  const standaloneRegex = /(?:^|\n)\s*([0-9]{1,6})\s*(?:\n|$)/gm
  while ((m = standaloneRegex.exec(text)) !== null) {
    const val = Number(m[1])
    if (val >= 1 && val <= 100000) {
      addCandidate(m[1], m.index, 3)
    }
  }

  if (candidates.length === 0) return undefined

  // ---- Smart strip logic (₹ → leading digit confusion) ----
  const STRIP_THRESHOLD = 10000
  const strippedCounts = new Map<number, number>()

  for (const c of candidates) {
    if (c.value > STRIP_THRESHOLD) {
      const strVal = String(Math.floor(c.value)).replace(/[^0-9]/g, '')
      if (strVal.length >= 5) {
        const stripped = Number(strVal.slice(1))
        if (stripped > 0) {
          strippedCounts.set(stripped, (strippedCounts.get(stripped) ?? 0) + 1)
        }
      }
    }
  }

  const confirmedStripped = new Set<number>()
  for (const [strippedVal, count] of strippedCounts.entries()) {
    if (count >= 2) {
      confirmedStripped.add(strippedVal)
      continue
    }
    const asIsRegex = new RegExp(`\\b${strippedVal.toLocaleString('en-IN')}\\b`)
    if (asIsRegex.test(text)) {
      confirmedStripped.add(strippedVal)
    }
  }

  const finalCandidates: typeof candidates = []
  for (const c of candidates) {
    if (c.value > STRIP_THRESHOLD) {
      const strVal = String(Math.floor(c.value)).replace(/[^0-9]/g, '')
      if (strVal.length >= 5) {
        const stripped = Number(strVal.slice(1))
        if (confirmedStripped.has(stripped)) {
          finalCandidates.push({ ...c, value: stripped, score: c.score + 5 })
          continue
        }
      }
    }
    finalCandidates.push(c)
  }

  const freq = new Map<number, number>()
  for (const c of finalCandidates) freq.set(c.value, (freq.get(c.value) ?? 0) + 1)

  finalCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (freq.get(b.value) ?? 0) - (freq.get(a.value) ?? 0)
  })

  console.log('[OCR] Amount candidates:', finalCandidates)
  console.log('[OCR] Confirmed stripped:', Array.from(confirmedStripped))

  return finalCandidates[0]?.value
}

// ============ CROP TOP REGION ============
async function cropTopRegion(file: File, percent: number = 0.25): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const cropHeight = Math.floor(img.height * percent)
      canvas.width = img.width
      canvas.height = cropHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas failed'))
      ctx.drawImage(img, 0, 0, img.width, cropHeight, 0, 0, img.width, cropHeight)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Crop failed'))),
        'image/jpeg',
        0.9
      )
    }
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = URL.createObjectURL(file)
  })
}

// ============ COMPONENT ============
export function ScreenshotOCR({ onExtracted, expectedUpiId, expectedPayeeName }: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)

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
    setProgress(0)
    if (inputRef.current) inputRef.current.value = ''
    onExtracted({ screenshotBlob: new Blob(), previewUrl: '' })
  }, [onExtracted])

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large', 'Max 10 MB')
      return
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const previewUrl = URL.createObjectURL(file)
    previewUrlRef.current = previewUrl

    setPreview(previewUrl)
    setProcessing(true)
    setProgress(0)

    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        logger: (m: any) => {
          if (!mountedRef.current) return
          if (m.status === 'recognizing text') setProgress(Math.floor(m.progress * 100))
        },
      })

      await worker.setParameters({ tessedit_pageseg_mode: '6' as any })

      const { data: fullData } = await worker.recognize(file)
      const fullText = fullData.text || ''
      console.log('[OCR] Full text:', fullText)

      let dateIso = extractDateFromText(fullText)
      let dateSource = 'full'

      if (!dateIso) {
        console.log('[OCR] Date not in full — cropping top 25%')
        try {
          const topBlob = await cropTopRegion(file, 0.25)
          await worker.setParameters({ tessedit_pageseg_mode: '11' as any })
          const { data: topData } = await worker.recognize(topBlob)
          const topText = topData.text || ''
          console.log('[OCR] Top region text:', topText)
          dateIso = extractDateFromText(topText)
          if (dateIso) dateSource = 'top-crop'
        } catch (err) {
          console.warn('[OCR] Crop failed:', err)
        }
      }

      await worker.terminate()
      if (!mountedRef.current) return

      // UTR
      const utrPatterns = [
        /\bUTR[\s:#-]*([0-9]{10,18})\b/i,
        /UPI\s*(?:transaction\s*)?(?:id|ref|reference)[\s:#-]*([A-Z0-9]{8,22})/i,
        /(?:transaction|txn)\s*(?:id|no\.?|number)?[\s:#-]*([A-Z0-9]{10,22})/i,
        /ref(?:erence)?\s*(?:no\.?|number|id)?[\s:#-]*([A-Z0-9]{8,22})/i,
        /\b(\d{12})\b/,
        /\b(\d{10,18})\b/,
      ]
      let utr: string | undefined
      for (const p of utrPatterns) {
        const match = fullText.match(p)
        if (match && match[1]) {
          utr = match[1].replace(/\s/g, '')
          break
        }
      }

      const amount = extractAmount(fullText)
      const { valid: dateValid, reason: dateReason } = validateDate(dateIso)
      const upiApp = detectUpiApp(fullText)
      const { matched: paymentMatched, detected: detectedPayee, matchedBy } =
        checkPaymentMatch(fullText, expectedUpiId, expectedPayeeName)

      console.log('[OCR] Detected:', {
        utr,
        amount,
        dateIso,
        dateSource,
        dateValid,
        dateReason,
        upiApp,
        paymentMatched,
        matchedBy,
        detectedPayee,
      })

      onExtracted({
        utr,
        amount,
        detectedDate: dateIso,
        dateValid,
        dateReason,
        upiApp,
        paymentMatched,
        matchedBy,
        detectedPayee,
        screenshotBlob: file,
        previewUrl,
      })

      if (paymentMatched !== false && utr && amount && dateValid) {
        toast.success('Detected', `₹${amount}`)
      }
    } catch (e) {
      console.error('OCR error:', e)
      if (!mountedRef.current) return
      toast.error('Scan failed', 'Try again')
      onExtracted({ screenshotBlob: file, previewUrl })
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
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center gap-2 py-8 rounded-xl border-2 border-dashed border-cyan-500/40 hover:border-cyan-500/70 bg-cyan-500/5 hover:bg-cyan-500/10 transition"
        >
          <span className="text-4xl">📸</span>
          <span className="text-sm font-bold tracking-wider text-cyan-300">
            UPLOAD PAYMENT DETAILS
          </span>
          <span className="text-[11px] text-gray-500">Camera or gallery</span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden border border-cyan-500/30 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Screenshot"
              className="w-full max-h-72 object-contain"
              onError={() => {
                toast.error('Preview failed')
                resetPreview()
              }}
            />
            <button
              type="button"
              onClick={resetPreview}
              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-red-500/90 hover:bg-red-500 rounded-full text-white text-sm"
              aria-label="Remove screenshot"
            >
              ✕
            </button>

            {processing && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
                <div className="text-4xl mb-3 animate-pulse">🔍</div>
                <div className="text-sm font-bold text-cyan-300 tracking-wider mb-2">
                  SCANNING
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
        </div>
      )}
    </div>
  )
}