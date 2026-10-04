import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { JwtPayload } from "../types/index.js";

export const signAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
};

export const signRefreshToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
};

/** How long a super admin's "View as" pass lasts. It has no refresh token. */
export const IMPERSONATION_TTL_SECONDS = 30 * 60;

/** A "View as" pass: the target's identity plus the session it belongs to, issued at `iat` (seconds). */
export const signImpersonationToken = (payload: Required<JwtPayload>, iat: number): string => {
  return jwt.sign({ ...payload, iat }, env.JWT_SECRET, { expiresIn: IMPERSONATION_TTL_SECONDS });
};

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
};
