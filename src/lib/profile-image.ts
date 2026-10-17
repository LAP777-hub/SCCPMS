export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateProfileImage(file: File) {
  if (!supportedTypes.has(file.type) || !file.size || file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Choose a JPEG, PNG or WebP image up to 5 MB.');
  }
}

// Optimise before sending so a selected 5 MB file stays below the host's
// request allowance. The API still independently decodes/re-encodes pixels.
export async function prepareProfileImage(file: File): Promise<Blob> {
  validateProfileImage(file);
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      const timer = window.setTimeout(() => { element.src = ''; reject(new Error('Image preparation timed out. Try selecting the image again.')); }, 15_000);
      element.onload = () => { window.clearTimeout(timer); resolve(element); };
      element.onerror = () => { window.clearTimeout(timer); reject(new Error('This image could not be opened. Choose a valid JPEG, PNG or WebP image.')); };
      element.src = source;
    });
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width * height > 16_000_000) throw new Error('Choose an image with no more than 16 megapixels.');
    const scale = Math.min(1, 1024 / width, 1024 / height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare this image in your browser. Try another browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const body = await new Promise<Blob>((resolve, reject) => {
      const failure = () => new Error('Unable to prepare this image. Choose another image.');
      const timer = window.setTimeout(() => reject(failure()), 10_000);
      try { canvas.toBlob(value => { window.clearTimeout(timer); if (value) resolve(value); else reject(failure()); }, 'image/webp', .86); }
      catch { window.clearTimeout(timer); reject(failure()); }
    });
    if (!body.size || body.size > 4 * 1024 * 1024 || !supportedTypes.has(body.type)) throw new Error('Unable to prepare this image for upload. Choose another image.');
    return body;
  } finally { URL.revokeObjectURL(source); }
}
