import { readFileSync } from 'node:fs';

export const allowedImageOrigins: string[] = JSON.parse(readFileSync(new URL('../../public/assets/image-origins.json', import.meta.url), 'utf8'));
const origins = new Set(allowedImageOrigins);
export const mediaPath = (id: string) => `/api/v1/archivos/${id}`;

export function validImage(value: string, optional = false) {
  if (!value) return optional;
  if (/^assets\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/.test(value)) return true;
  if (/^\/api\/v1\/archivos\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && origins.has(url.origin);
  } catch { return false; }
}
