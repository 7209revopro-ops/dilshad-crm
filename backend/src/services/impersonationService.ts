import { Types } from "mongoose";
import type { Request } from "express";
import { User } from "../models/User.js";
import { Impersonation } from "../models/Impersonation.js";
import { signImpersonationToken, IMPERSONATION_TTL_SECONDS } from "../utils/jwt.js";
import { clientIp, describeDevice } from "../utils/requestMeta.js";
import type { IRole } from "../types/index.js";

const refuse = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

/*
 * "View as": a super admin sees the CRM exactly as one of their people does,
 * for 30 minutes, read only (the auth middleware refuses every write). Each
 * session is a record — who, as whom, from where, when it ended — and the pass
 * names it, so ending the record ends the pass. No refresh token: when the
 * time is up the app goes back to the admin's own account.
 */
export class ImpersonationService {
  /** A 30-minute, read-only pass for `targetId`. Never yourself, a super admin, or someone deactivated. */
  async start(req: Request, admin: { userId: string; email: string }, targetId: string) {
    if (!Types.ObjectId.isValid(targetId)) throw refuse("User not found", 404);
    if (targetId === admin.userId) throw refuse("You can't view the CRM as yourself", 400);

    const target = await User.findById(targetId).populate("role");
    if (!target) throw refuse("User not found", 404);
    const role = target.role as IRole | null;
    if (!role) throw refuse("That user has no role", 409);
    if (role.isSystemRole && role.roleName === "Super Admin") throw refuse("You can't view the CRM as a super admin", 403);
    if (target.status !== "active") throw refuse("That user is deactivated", 409);

    const iat = Math.floor(Date.now() / 1000);
    const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 500);
    const session = await Impersonation.create({
      admin: admin.userId,
      adminEmail: admin.email,
      target: target._id,
      targetEmail: target.email,
      startedAt: new Date(iat * 1000),
      expiresAt: new Date((iat + IMPERSONATION_TTL_SECONDS) * 1000),
      ip: clientIp(req),
      userAgent,
      device: describeDevice(userAgent).label,
    });

    const accessToken = signImpersonationToken(
      {
        userId: target._id.toString(),
        email: target.email,
        roleId: role._id.toString(),
        impersonation: { id: session._id.toString(), by: admin.userId },
      },
      iat
    );

    return {
      accessToken,
      expiresAt: session.expiresAt.toISOString(),
      // The same shape as a sign-in's user (role and permissions included, no password).
      user: target.toJSON(),
    };
  }

  /** "Back to my account" (or signing out while viewing as someone). Ending one that is already over is fine. */
  async stop(sessionId: string): Promise<void> {
    await Impersonation.updateOne({ _id: sessionId, endedAt: null }, { $set: { endedAt: new Date() } });
  }
}
