// components/HoverZoom.tsx
'use client'

import { useRef, useState, useCallback } from 'react'

interface Props {
  src: string
  alt?: string
  className?: string
  /** Zoom magnification */
  zoomLevel?: number
  /** Preview window size in px */
  previewSize?: number
}

export function HoverZoom({
  src,
  alt = '',
  className = '',
  zoomLevel = 3,
  previewSize = 220,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [hovering, setHovering] = useState(false)
  const [preview, setPreview] = useState<{
    x: number
    y: number
    bgX: number
    bgY: number
    bgW: number
    bgH: number
    imgW: number
    imgH: number
  } | null>(null)

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current
      const img = imgRef.current
      if (!container || !img) return

      const rect = img.getBoundingClientRect()
      // Mouse position relative to image
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      // Image rendered size vs natural size ratio
      const ratioX = img.naturalWidth / rect.width
      const ratioY = img.naturalHeight / rect.height

      // Zoomed image dimensions (full, scaled)
      const bgW = rect.width * zoomLevel
      const bgH = rect.height * zoomLevel

      // Background position: shift so the mouse point stays centered in preview
      const bgX = -(x * zoomLevel - previewSize / 2)
      const bgY = -(y * zoomLevel - previewSize / 2)

      // Preview window position: follow cursor (floating, offset from cursor)
      const previewX = e.clientX
      const previewY = e.clientY

      setPreview({
        x: previewX,
        y: previewY,
        bgX,
        bgY,
        bgW,
        bgH,
        imgW: rect.width,
        imgH: rect.height,
      })
    },
    [zoomLevel, previewSize]
  )

  const handleMouseEnter = () => setHovering(true)
  const handleMouseLeave = () => {
    setHovering(false)
    setPreview(null)
  }

  return (
    <>
      <div
        ref={containerRef}
        className={`relative select-none overflow-hidden ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: hovering ? 'none' : 'zoom-in' }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="w-full max-h-80 object-contain bg-black"
          draggable={false}
        />

        {/* Custom magnifier cursor */}
        {hovering && preview && (
          <div
            className="pointer-events-none fixed z-[100]"
            style={{
              left: preview.x - previewSize / 2,
              top: preview.y - previewSize / 2,
              width: previewSize,
              height: previewSize,
            }}
          >
            {/* Magnifier glass outer ring (glow) */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: '3px solid #22d3ee',
                boxShadow:
                  '0 0 20px rgba(34,211,238,0.7), inset 0 0 20px rgba(34,211,238,0.3)',
                background: `url(${src}) no-repeat`,
                backgroundSize: `${preview.bgW}px ${preview.bgH}px`,
                backgroundPosition: `${preview.bgX}px ${preview.bgY}px`,
                overflow: 'hidden',
              }}
            />
            {/* Inner shine */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 60%)',
              }}
            />
            {/* Crosshair dot at center */}
            <div
              className="absolute rounded-full bg-cyan-300/70 pointer-events-none"
              style={{
                width: 6,
                height: 6,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 6px rgba(34,211,238,0.9)',
              }}
            />
            {/* Handle (small at bottom-right like a glass) */}
            <div
              className="absolute rounded-full bg-cyan-500"
              style={{
                width: 12,
                height: 30,
                right: -2,
                bottom: -20,
                transform: 'rotate(45deg)',
                transformOrigin: 'top center',
                boxShadow: '0 0 8px rgba(34,211,238,0.6)',
              }}
            />
          </div>
        )}
      </div>

      {/* Helper text */}
      <div className="text-[9px] text-gray-500 text-center mt-1.5">
        {hovering ? 'Magnifying… move to explore' : '🔍 Hover to magnify'}
      </div>
    </>
  )
}