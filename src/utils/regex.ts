const SPECIAL = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\', '/', '-']);

/** Escapes user input so it can be embedded in a RegExp without changing its meaning. */
export function escapeRegex(input: string): string {
  let out = '';
  for (const ch of input) out += SPECIAL.has(ch) ? `\\${ch}` : ch;
  return out;
}

/** Case-insensitive "contains" matcher for search boxes. */
export function containsRegex(input: string): RegExp {
  return new RegExp(escapeRegex(input.trim()), 'i');
}
