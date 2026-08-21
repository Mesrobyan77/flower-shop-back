import { User, type UserDocument } from '../models/User';
import { Cart } from '../models/Cart';
import { ApiError } from '../utils/ApiError';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
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

function issueTokens(user: UserDocument) {
  const identity = { id: String(user._id), email: user.email, role: user.role };
  return { accessToken: signAccessToken(identity), refreshToken: signRefreshToken(identity) };
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

  return { user: toPublicUser(user), ...issueTokens(user) };
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

  return { user: toPublicUser(user), ...issueTokens(user) };
}

export async function refresh(token: string): Promise<AuthResult> {
  const payload = verifyRefreshToken(token);
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account is no longer available');
  return { user: toPublicUser(user), ...issueTokens(user) };
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
