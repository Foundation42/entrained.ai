// R2 storage helpers for sprite sheets

export async function uploadToR2(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer,
  mimeType: string
): Promise<void> {
  await bucket.put(key, data, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000', // Cache for 1 year (immutable assets)
    },
  });
  console.log(`[R2] Uploaded: ${key} (${data.byteLength} bytes)`);
}

export async function getFromR2(
  bucket: R2Bucket,
  key: string
): Promise<R2ObjectBody | null> {
  return await bucket.get(key);
}

export async function deleteFromR2(
  bucket: R2Bucket,
  key: string
): Promise<void> {
  await bucket.delete(key);
  console.log(`[R2] Deleted: ${key}`);
}

// Generate public URL for R2 object
// Note: R2 public access must be enabled on the bucket
export function getPublicUrl(key: string): string {
  // Format: https://<bucket>.r2.cloudflarestorage.com/<key>
  // Or with custom domain: https://sprites.entrained.ai/assets/<key>
  // For now, we'll use a path-based URL that the worker can serve
  return `https://sprites.entrained.ai/assets/${key}`;
}
