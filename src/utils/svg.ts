/**
 * SVG is a scripting format, not a picture.
 *
 * A browser that loads an SVG document runs whatever the document says, so an
 * uploaded file is only as safe as its markup. The media library hands the bytes
 * straight to Cloudinary and the delivery URL is reachable in a top-level tab,
 * which makes an executable SVG a stored payload that appears to come from our
 * own asset host. Nothing here can be fixed by hiding the upload button: the
 * content has to be refused where it is accepted.
 *
 * This is a denylist over the constructs that turn markup into behaviour, not a
 * parser, and it is not proof that a document is benign - it is the boundary the
 * application can enforce without a rendering engine.
 */
const FORBIDDEN: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<script\b/i, reason: 'it contains a <script> element' },
  { pattern: /<\/script\b/i, reason: 'it contains a script tag' },
  { pattern: /\son[a-z]+\s*=/i, reason: 'it contains an event-handler attribute' },
  { pattern: /<foreignObject\b/i, reason: 'it contains a <foreignObject> element' },
  { pattern: /<(iframe|frame|embed|object)\b/i, reason: 'it embeds another document' },
  { pattern: /<(animate|animateTransform|set)\b[^>]*attributeName\s*=\s*["']?(href|xlink:href)/i, reason: 'it animates a link target' },
  { pattern: /(?:xlink:)?href\s*=\s*["']?\s*(?:javascript|data)\s*:/i, reason: 'it links to a script URL' },
  { pattern: /(?:xlink:)?href\s*=\s*["']?\s*(?:https?:)?\/\//i, reason: 'it references an external document' },
  { pattern: /<!DOCTYPE[\s\S]*<!ENTITY/i, reason: 'it declares an external entity' },
];

/** Returns the reason the document is unsafe, or null when nothing matched. */
export function svgRejectedReason(buffer: Buffer): string | null {
  const source = buffer.toString('utf8');
  for (const { pattern, reason } of FORBIDDEN) {
    if (pattern.test(source)) return reason;
  }
  return null;
}
