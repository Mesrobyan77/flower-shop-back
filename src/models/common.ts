import { Schema } from 'mongoose';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../constants';

export interface Localized {
  hy: string;
  en?: string;
  ru?: string;
}

/**
 * Every user-visible string is stored per locale. `hy` is mandatory because it is
 * the default locale; `en`/`ru` fall back to it when empty.
 */
export const localizedSchema = (required = true) =>
  new Schema<Localized>(
    {
      hy: { type: String, required, trim: true, default: '' },
      en: { type: String, trim: true, default: '' },
      ru: { type: String, trim: true, default: '' },
    },
    { _id: false },
  );

export function pickLocale(value: Localized | undefined | null, locale: Locale = DEFAULT_LOCALE): string {
  if (!value) return '';
  const wanted = value[locale];
  if (wanted && wanted.trim()) return wanted;
  for (const l of LOCALES) {
    const v = value[l];
    if (v && v.trim()) return v;
  }
  return '';
}

/** Consistent JSON shape: `id` instead of `_id`, no `__v`, no password leakage. */
export const baseToJSON = {
  virtuals: true,
  versionKey: false,
  transform(_doc: unknown, ret: Record<string, unknown>) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.password;
    return ret;
  },
};
