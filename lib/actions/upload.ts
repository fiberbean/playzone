'use server'

import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from '@/lib/r2/client'
import { createClient } from '@/lib/supabase/server'

export async function uploadImageToR2(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const file = formData.get('file') as File
  if (!file) {
    return { error: 'No file provided' }
  }

  // File size check — 5 MB max (before compression)
  if (file.size > 5 * 1024 * 1024) {
    return { error: 'File too large (max 5 MB)' }
  }

  // File type check
  if (!file.type.startsWith('image/')) {
    return { error: 'Only images allowed' }
  }

  // Unique filename with user folder
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`

  // Convert File to Buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: fileName,
        Body: buffer,
        ContentType: file.type,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    )

    return {
      success: true,
      url: `${R2_PUBLIC_URL}/${fileName}`,
      key: fileName,
    }
  } catch (error) {
    console.error('R2 upload error:', error)
    return { error: 'Upload failed' }
  }
}

export async function deleteImageFromR2(key: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Security: user own folder matrame delete cheyyali
  if (!key.startsWith(`${user.id}/`)) {
    return { error: 'Unauthorized' }
  }

  try {
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      })
    )
    return { success: true }
  } catch (error) {
    console.error('R2 delete error:', error)
    return { error: 'Delete failed' }
  }
}