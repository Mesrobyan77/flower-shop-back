/**
 * Upload type verification.
 *
 * Multer only reports what the client *claimed* in the multipart part header, and
 * that header is attacker-controlled. Every uploaded buffer is therefore sniffed
 * before it reaches storage: the bytes themselves have to look like the image type
 * we were told, so a text payload sent as `image/png` is refused instead of being
 * forwarded to Cloudinary.
 */

export type SniffedImageType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/avif' | 'image/svg+xml';

/** Only the head of the file is inspected - SVG is text, the raster formats are magic bytes. */
const SVG_PROBE_BYTES = 1024;

function hasBytes(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function sniffRaster(buffer: Buffer): SniffedImageType | null {
  if (hasBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (hasBytes(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (hasBytes(buffer, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (hasBytes(buffer, [0x52, 0x49, 0x46, 0x46]) && hasBytes(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (hasBytes(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buffer.subarray(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return null;
}

/**
 * SVG is XML, so an optional BOM, XML declaration or leading comment is allowed -
 * but the root element itself has to be `<svg>`, which keeps an arbitrary XML or
 * HTML document from passing under an `image/svg+xml` header.
 */
function looksLikeSvg(buffer: Buffer): boolean {
  const head = buffer.subarray(0, SVG_PROBE_BYTES).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  const root = head
    .replace(/^<\?xml[\s\S]*?\?>/i, '')
    .replace(/^<!--[\s\S]*?-->/, '')
    .trimStart();
  return /^<svg[\s>]/i.test(root) || /^<!DOCTYPE\s+svg/i.test(root);
}

export function sniffImageType(buffer: Buffer): SniffedImageType | null {
  return sniffRaster(buffer) ?? (looksLikeSvg(buffer) ? 'image/svg+xml' : null);
}

/** True only when the bytes match the type the client declared for the part. */
export function bufferMatchesMimeType(buffer: Buffer, declaredType: string): boolean {
  const sniffed = sniffImageType(buffer);
  if (!sniffed) return false;
  // Browsers and some tools spell the JPEG part type both ways.
  if (declaredType === 'image/jpg') return sniffed === 'image/jpeg';
  return sniffed === declaredType;
}
