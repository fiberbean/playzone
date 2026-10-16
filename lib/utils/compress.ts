import imageCompression from 'browser-image-compression'

export async function compressImage(file: File): Promise<File> {
  const options = {
    maxSizeMB: 0.15,          // 150 KB target
    maxWidthOrHeight: 1080,   // max 1080px
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  }

  try {
    const compressed = await imageCompression(file, options)
    console.log(
      `Image compressed: ${(file.size / 1024).toFixed(1)} KB → ${(compressed.size / 1024).toFixed(1)} KB`
    )
    return compressed
  } catch (error) {
    console.error('Compression error:', error)
    return file
  }
}