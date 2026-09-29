import { randomUUID } from 'node:crypto';
import { User, type UserDocument } from '../models/User';
import { Cart } from '../models/Cart';
import { RefreshSession } from '../models/RefreshSession';
import { ApiError } from '../utils/ApiError';
import { signAccessToken, signRefreshToken, tokenTtlMs, verifyRefreshToken } from '../utils/jwt';
import { gradeByKey } from '../constants';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
  marketingOptIn?: boolean;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  grade: string;
  gradeDiscountRate: number;
  pointRate: number;
  points: number;
  totalSpend: number;
  marketingOptIn: boolean;
  createdAt: Date;
}

export function toPublicUser(user: UserDocument): PublicUser {
  const grade = gradeByKey(user.grade);
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    grade: user.grade,
    gradeDiscountRate: grade.discountRate,
    pointRate: grade.pointRate,
    points: user.points,
    totalSpend: user.totalSpend,
    marketingOptIn: user.marketingOptIn,
    createdAt: user.createdAt,
  };
}

function identityOf(user: UserDocument) {
  return { id: String(user._id), email: user.email, role: user.role };
}

/**
 * Signs both tokens and records the refresh session first: a token whose row
 * could not be written is never handed out, and a hand without a row can never
 * be refreshed. `familyId` links every rotation of one login so logout can
 * revoke them together.
 */
async function issueSession(user: UserDocument, familyId: string = randomUUID()) {
  const identity = identityOf(user);
  const jti = randomUUID();
  const accessToken = signAccessToken(identity);
  const refreshToken = signRefreshToken(identity, { jti, fid: familyId });

  await RefreshSession.create({
    _id: jti,
    familyId,
    user: user._id,
    expiresAt: new Date(Date.now() + tokenTtlMs(refreshToken)),
  });

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput, sessionId?: string): Promise<AuthResult> {
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) throw ApiError.conflict('This email is already registered', { email: ['already registered'] });

  const user = await User.create({
    email: input.email.toLowerCase(),
    password: input.password,
    name: input.name,
    phone: input.phone,
    marketingOptIn: input.marketingOptIn ?? false,
  });

  if (sessionId) await mergeGuestCart(sessionId, String(user._id));

  return { user: toPublicUser(user), ...(await issueSession(user)) };
}

export async function login(email: string, password: string, sessionId?: string): Promise<AuthResult> {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) throw ApiError.unauthorized('Email or password is incorrect');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  const matches = await user.comparePassword(password);
  if (!matches) throw ApiError.unauthorized('Email or password is incorrect');

  user.lastLoginAt = new Date();
  await user.save();

  if (sessionId) await mergeGuestCart(sessionId, String(user._id));

  return { user: toPublicUser(user), ...(await issueSession(user)) };
}

/** Every unexpired row of one login, revoked in a single update. */
async function revokeFamily(familyId: string, reason: 'logout' | 'account-disabled'): Promise<void> {
  await RefreshSession.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

/**
 * Rotation with replay protection. The presented token is claimed in one
 * atomic update (`usedAt: null` -> now), so of two concurrent refreshes
 * carrying the same cookie exactly one can win; the loser - and anyone
 * replaying a token that was already rotated or revoked - gets a plain 401
 * and never a fresh session. The winner re-enters the same family under a
 * new `jti`.
 */
export async function refresh(token: string): Promise<AuthResult> {
  const payload = verifyRefreshToken(token);
  const jti = payload.jti;
  const familyId = payload.fid;
  if (!jti || !familyId) throw ApiError.unauthorized('Refresh token is invalid, please sign in again');

  const claimed = await RefreshSession.findOneAndUpdate(
    { _id: jti, familyId, usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );
  if (!claimed) throw ApiError.unauthorized('Refresh token is invalid, please sign in again');

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    await revokeFamily(familyId, 'account-disabled');
    throw ApiError.unauthorized('Account is no longer available');
  }

  return { user: toPublicUser(user), ...(await issueSession(user, familyId)) };
}

/**
 * Ends the session the presented token belongs to. An absent, expired or
 * otherwise unverifiable token simply skips the database - the caller still
 * gets its cookie cleared, so logout never fails from the client's view.
 */
export async function logout(token?: string): Promise<void> {
  if (!token) return;
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return;
  }
  if (!payload.fid) return;
  await revokeFamily(payload.fid, 'logout');
}

export async function currentUser(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return toPublicUser(user);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await User.findById(userId).select('+password');
  if (!user) throw ApiError.notFound('User not found');

  const matches = await user.comparePassword(currentPassword);
  if (!matches) throw ApiError.badRequest('Current password is incorrect', { currentPassword: ['incorrect'] });

  user.password = newPassword;
  await user.save();
}

/** A basket built before signing in must survive the login. */
export async function mergeGuestCart(sessionId: string, userId: string): Promise<void> {
  const guestCart = await Cart.findOne({ sessionId });
  if (!guestCart || guestCart.items.length === 0) return;

  const userCart = await Cart.findOne({ user: userId });
  if (!userCart) {
    guestCart.user = userId as never;
    guestCart.sessionId = undefined;
    await guestCart.save();
    return;
  }

  userCart.items.push(...guestCart.items);
  await userCart.save();
  await guestCart.deleteOne();
}
