import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../types/index.js";
import { listIdleStretches, listLoginEvents, listPeople, recordHeartbeat } from "../services/activityService.js";
import { heartbeatSchema, idleStretchesQuery, loginEventsQuery, peopleQuery } from "../validations/activityValidation.js";
import { sendSuccess, sendError } from "../utils/response.js";

// POST /api/v1/activity/heartbeat — anyone signed in; the web app sends it every minute it is open.
export async function heartbeatHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    await recordHeartbeat(req.user!.userId, parsed.data.active);
    sendSuccess(res, "OK");
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/activity/people
export async function peopleHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = peopleQuery.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    sendSuccess(res, "People", await listPeople(parsed.data));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/activity/logins
export async function loginEventsHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = loginEventsQuery.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    const { items, pagination } = await listLoginEvents(parsed.data);
    sendSuccess(res, "Sign-ins", items, 200, pagination);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/activity/idle
export async function idleStretchesHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = idleStretchesQuery.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    const { items, pagination } = await listIdleStretches(parsed.data);
    sendSuccess(res, "Idle alerts", items, 200, pagination);
  } catch (err) {
    next(err);
  }
}
