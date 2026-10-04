import type { Response, NextFunction } from "express";
import { Types } from "mongoose";
import type { AuthenticatedRequest, JwtPayload } from "../types/index.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { sendError } from "../utils/response.js";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import { Impersonation } from "../models/Impersonation.js";

type ImpersonatedBy = NonNullable<NonNullable<AuthenticatedRequest["user"]>["impersonatedBy"]>;

/** A "View as" pass may only read — anything else is refused (bar ending the session). */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A "View as" pass is good only while its session is open and unexpired, and
 * while the super admin who started it still is one and is still active.
 */
async function checkImpersonation(decoded: JwtPayload): Promise<ImpersonatedBy | string> {
  const imp = decoded.impersonation!;
  if (!Types.ObjectId.isValid(imp.id)) return "This view-as session has ended";
  const session = await Impersonation.findById(imp.id)
    .select("admin target endedAt expiresAt")
    .lean<{ _id: Types.ObjectId; admin: Types.ObjectId; target: Types.ObjectId; endedAt: Date | null; expiresAt: Date } | null>();
  if (
    !session ||
    session.endedAt ||
    session.expiresAt.getTime() <= Date.now() ||
    String(session.target) !== decoded.userId ||
    String(session.admin) !== imp.by
  ) {
    return "This view-as session has ended";
  }
  const admin = await User.findById(session.admin)
    .select("name email status role")
    .populate("role", "roleName isSystemRole")
    .lean<{ _id: Types.ObjectId; name: string; email: string; status: string; role: { roleName?: string; isSystemRole?: boolean } | null } | null>();
  if (!admin || admin.status !== "active" || !(admin.role?.isSystemRole && admin.role.roleName === "Super Admin")) {
    return "Only an active super admin can view the CRM as someone else";
  }
  return { id: String(admin._id), name: admin.name, email: admin.email, sessionId: String(session._id) };
}

async function verify(req: AuthenticatedRequest, res: Response, next: NextFunction, allowViewAsWrites: boolean): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      sendError(res, "Access token is required", 401);
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    // A super admin's "View as" pass: still open, and only reading.
    let impersonatedBy: ImpersonatedBy | undefined;
    if (decoded.impersonation) {
      const checked = await checkImpersonation(decoded);
      if (typeof checked === "string") {
        sendError(res, checked, 401);
        return;
      }
      impersonatedBy = checked;
      if (!allowViewAsWrites && !READ_METHODS.has(req.method)) {
        sendError(res, "View only: you are viewing the CRM as someone else. Go back to your own account to make changes.", 403);
        return;
      }
    }

    // Verify user still exists and is active
    const user = await User.findById(decoded.userId).select("status");
    if (!user) {
      sendError(res, "User no longer exists", 401);
      return;
    }
    if (user.status === "inactive") {
      // While viewing as someone, the app takes a 401 back to the admin's own account.
      sendError(res, impersonatedBy ? "The person you were viewing as has been deactivated" : "Your account has been deactivated. Contact an administrator.", impersonatedBy ? 401 : 403);
      return;
    }

    // Load role with permissions
    const role = await Role.findById(decoded.roleId);
    if (!role) {
      sendError(res, "Role not found", 401);
      return;
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      roleId: decoded.roleId,
      role,
      ...(impersonatedBy ? { impersonatedBy } : {}),
    };

    next();
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === "TokenExpiredError") {
        sendError(res, "Access token expired", 401);
        return;
      }
      if (error.name === "JsonWebTokenError") {
        sendError(res, "Invalid access token", 401);
        return;
      }
    }
    sendError(res, "Authentication failed", 401);
  }
}

/** Every protected route. A super admin's "View as" pass may only read through it. */
export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> =>
  verify(req, res, next, false);

/** Ending a "View as" session — the one write such a pass may make. */
export const authenticateViewAsExit = (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> =>
  verify(req, res, next, true);
