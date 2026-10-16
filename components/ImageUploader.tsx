'use client'

import { useState, useRef } from 'react'
import { compressImage } from '@/lib/utils/compress'
import { uploadImageToR2 } from '@/lib/actions/upload'

type Props = {
  onUploadComplete: (url: string, key: string) => void
  onUploadError?: (error: string) => void
}

export default function ImageUploader({ onUploadComplete, onUploadError }: Props) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset
    setUploading(true)
    setProgress('Compressing...')
    setPreview(null)

    try {
      // Step 1: Compress
      const compressed = await compressImage(file)

      // Step 2: Preview
      const previewUrl = URL.createObjectURL(compressed)
      setPreview(previewUrl)

      // Step 3: Upload to R2
      setProgress('Uploading...')
      const formData = new FormData()
      formData.append('file', compressed)

      const result = await uploadImageToR2(formData)

      if (result.error) {
        setProgress('')
        setUploading(false)
        onUploadError?.(result.error)
        alert(`Upload failed: ${result.error}`)
        return
      }

      // Step 4: Success
      setProgress('Done!')
      setUploading(false)
      onUploadComplete(result.url!, result.key!)
    } catch (error) {
      console.error('Upload error:', error)
      setUploading(false)
      setProgress('')
      onUploadError?.('Upload failed')
    }
  }

  const handleRemove = () => {
    setPreview(null)
    setProgress('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="w-full">
      {!preview ? (
        <label
          className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-2xl cursor-pointer transition ${
            uploading
              ? 'border-cyan-500/50 bg-cyan-500/10'
              : 'border-cyan-500/30 hover:border-cyan-500/60 bg-[#0a0a0f]'
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
              <p className="text-sm text-cyan-400 font-bold">{progress}</p>
            </div>
          ) : (
            <>
              <span className="text-5xl mb-3">📷</span>
              <p className="text-sm font-bold text-cyan-400">Click to upload image</p>
              <p className="text-xs text-gray-500 mt-1">JPG, PNG • max 5 MB</p>
              <p className="text-xs text-cyan-500/60 mt-2">Auto-compressed to ~150 KB</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
        </label>
      ) : (
        <div className="relative w-full rounded-2xl overflow-hidden border border-cyan-500/30">
          <img src={preview} alt="preview" className="w-full h-auto" />
          {!uploading && (
            <>
              <div className="absolute top-2 right-2">
                <button
                  onClick={handleRemove}
                  type="button"
                  className="w-9 h-9 flex items-center justify-center bg-red-500/90 hover:bg-red-500 text-white rounded-full transition shadow-lg"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                <p className="text-xs text-green-400 font-bold">✅ Uploaded</p>
              </div>
            </>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
              <p className="text-sm text-cyan-400 font-bold">{progress}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}