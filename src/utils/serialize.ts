/**
 * Mongoose `toJSON` transforms do not apply to `.lean()` results or aggregation
 * output, so `_id` would leak into some responses and `id` into others.
 * Normalising once at the response layer keeps the API contract identical no
 * matter how a controller fetched its data.
 */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function hasToJSON(value: object): value is { toJSON: () => unknown } {
  return typeof (value as { toJSON?: unknown }).toJSON === 'function';
}

export function normalizeIds<T>(input: T): T {
  if (Array.isArray(input)) return input.map((item) => normalizeIds(item)) as unknown as T;

  if (input instanceof Date) return input;
  if (Buffer.isBuffer(input)) return input;

  if (isObject(input)) {
    // ObjectId and other scalar wrappers collapse to their primitive form.
    if (typeof (input as { toHexString?: unknown }).toHexString === 'function') {
      return (input as unknown as { toHexString: () => string }).toHexString() as unknown as T;
    }

    // Mongoose documents must be flattened before their own keys are readable.
    if (hasToJSON(input)) {
      const plain = input.toJSON();
      return (plain === input ? plain : normalizeIds(plain)) as unknown as T;
    }

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (key === '__v' || key === 'password') continue;
      if (key === '_id') {
        out.id = normalizeIds(value);
        continue;
      }
      out[key] = normalizeIds(value);
    }
    return out as unknown as T;
  }

  return input;
}
