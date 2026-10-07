/**
 * `undefined` cannot survive `JSON.stringify`, so an admin form that wants to REMOVE
 * a field - a strike-through price, a cover image - has no way to say so with a
 * partial body, and a plain `{...body}` patch leaves the old value in the database
 * while the UI shows the field empty. The panel sends an explicit `null`, and this
 * helper turns those keys into `$unset` operations.
 */
export function toMongoUpdate(body: Record<string, unknown>, keepNull: string[] = []): Record<string, unknown> {
  const keep = new Set(keepNull);
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  for (const [key, value] of Object.entries(body)) {
    if (value === null && !keep.has(key)) unset[key] = '';
    else set[key] = value;
  }

  if (Object.keys(unset).length === 0) return set;
  return { $set: set, $unset: unset };
}
