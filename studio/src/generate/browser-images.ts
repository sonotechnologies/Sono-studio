import { paletteFromPixels, weightedPalette } from './palette';

/* Browser-only helpers for the content step. */

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = url;
  });
}

/** Photos are shrunk to at most 2000px and re-encoded as JPEG before upload. */
export async function prepareUpload(file: File, kind: 'photo' | 'logo'): Promise<{ blob: Blob; width: number; height: number; name: string }> {
  const img = await loadImage(file);
  const w = img.naturalWidth || 800;
  const h = img.naturalHeight || 800;
  URL.revokeObjectURL(img.src);
  if (kind === 'logo' && (file.type === 'image/svg+xml' || file.size < 1_500_000)) return { blob: file, width: w, height: h, name: file.name };
  const scale = Math.min(1, 2000 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const type = kind === 'logo' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, 0.85));
  return { blob, width: canvas.width, height: canvas.height, name: file.name.replace(/\.[^.]+$/, kind === 'logo' ? '.png' : '.jpg') };
}

export async function logoPalette(file: Blob): Promise<string[]> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const size = 96;
  const scale = size / Math.max(img.naturalWidth || size, img.naturalHeight || size);
  canvas.width = Math.max(1, Math.round((img.naturalWidth || size) * scale));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || size) * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  return paletteFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}

/** Colours in a screenshot weighted by area, background included. */
export async function screenshotColors(file: Blob): Promise<{ hex: string; weight: number }[]> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const size = 200;
  const scale = size / Math.max(img.naturalWidth || size, img.naturalHeight || size);
  canvas.width = Math.max(1, Math.round((img.naturalWidth || size) * scale));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || size) * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  return weightedPalette(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}
