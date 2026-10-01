import { Schema, model, type Document, type Model, type Types } from 'mongoose';

/**
 * Server-side record of one issued refresh token, grouped by session family:
 * a login creates the first row, every rotation shares the same `familyId`,
 * and logout revokes the whole family in one update. The token itself is never
 * stored - only the `jti` it carries - so reading this collection cannot mint
 * a session, while `usedAt` can only be claimed once and ever after a reused
 * token is refused.
 */
export interface RefreshSessionDocument extends Document<string> {
  _id: string; // the token's jti
  familyId: string;
  user: Types.ObjectId;
  usedAt: Date | null;
  revokedAt: Date | null;
  revokedReason?: 'logout' | 'account-disabled' | 'password-change';
  expiresAt: Date;
}

export type RefreshSessionModel = Model<RefreshSessionDocument>;

const refreshSessionSchema = new Schema<RefreshSessionDocument>(
  {
    _id: { type: String },
    familyId: { type: String, required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: ['logout', 'account-disabled', 'password-change'] },
    /** Mirrors the JWT exp so MongoDB purges the row the moment the token dies. */
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false },
);

export const RefreshSession = model<RefreshSessionDocument, RefreshSessionModel>('RefreshSession', refreshSessionSchema);
