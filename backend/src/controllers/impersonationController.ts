import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../types/index.js";
import { ImpersonationService } from "../services/impersonationService.js";
import { sendSuccess, sendError } from "../utils/response.js";

const impersonationService = new ImpersonationService();

// POST /api/v1/users/:id/impersonate — super admin only (see userRoutes). Starts "View as":
// a 30-minute, read-only pass for that user, with the user record the app signs in as.
export const startImpersonation = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user!.impersonatedBy) {
      sendError(res, "You are already viewing the CRM as someone", 409);
      return;
    }
    const result = await impersonationService.start(req, req.user!, req.params.id);
    sendSuccess(res, `Viewing the CRM as ${result.user.name}`, result, 201);
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/auth/impersonation/stop — "Back to my account": ends the session the pass
// belongs to, so the pass stops working at once.
export const stopImpersonation = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const by = req.user!.impersonatedBy;
    if (!by) {
      sendError(res, "You are not viewing the CRM as anyone", 400);
      return;
    }
    await impersonationService.stop(by.sessionId);
    sendSuccess(res, "Back to your own account");
  } catch (error) {
    next(error);
  }
};
