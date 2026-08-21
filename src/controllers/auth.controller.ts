import type { Request, Response } from 'express';
import { env } from '../config/env';
import { User } from '../models/User';
import * as authService from '../services/auth.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { created, noContent, ok } from '../utils/apiResponse';
import type { AuthedRequest } from '../types';

const REFRESH_COOKIE = 'xf_refresh';

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const sessionId = (req as Request & { sessionId?: string }).sessionId;
  const result = await authService.register(req.body, sessionId);
  setRefreshCookie(res, result.refreshToken);
  return created(res, { user: result.user, accessToken: result.accessToken });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const sessionId = (req as Request & { sessionId?: string }).sessionId;
  const result = await authService.login(req.body.email, req.body.password, sessionId);
  setRefreshCookie(res, result.refreshToken);
  return ok(res, { user: result.user, accessToken: result.accessToken });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.body?.refreshToken || (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No refresh token supplied');

  const result = await authService.refresh(token);
  setRefreshCookie(res, result.refreshToken);
  return ok(res, { user: result.user, accessToken: result.accessToken });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
  return ok(res, { loggedOut: true });
});

export const me = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const user = await authService.currentUser(req.user!.sub);
  return ok(res, user);
});

export const updateProfile = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const user = await User.findByIdAndUpdate(req.user!.sub, req.body, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound('User not found');
  return ok(res, authService.toPublicUser(user));
});

export const changePassword = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await authService.changePassword(req.user!.sub, req.body.currentPassword, req.body.newPassword);
  return noContent(res);
});
