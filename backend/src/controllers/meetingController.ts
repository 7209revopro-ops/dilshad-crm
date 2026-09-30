import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../types/index.js";
import {
  calendarFor,
  cancelMeeting,
  createMeeting,
  findConflicts,
  getMeeting,
  listColleagues,
  updateMeeting,
  type Actor,
} from "../services/meetingService.js";
import {
  calendarQuery,
  cancelMeetingSchema,
  conflictsSchema,
  createMeetingSchema,
  peopleQuery,
  updateMeetingSchema,
} from "../validations/meetingValidation.js";
import { sendSuccess, sendError } from "../utils/response.js";

const actorOf = (req: AuthenticatedRequest): Actor => {
  const role = req.user!.role;
  return {
    userId: req.user!.userId,
    isSuperAdmin: Boolean(role?.isSystemRole && role.roleName === "Super Admin"),
    roleName: role?.roleName ?? "",
  };
};

// GET /api/v1/meetings/calendar?from&to&userId
export async function calendarHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = calendarQuery.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    sendSuccess(res, "Calendar", await calendarFor(parsed.data, actorOf(req)));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/meetings/people?search — colleagues anyone may invite
export async function peopleHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = peopleQuery.safeParse(req.query);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    sendSuccess(res, "People", await listColleagues(parsed.data.search));
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/meetings/conflicts
export async function conflictsHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = conflictsSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    sendSuccess(res, "Conflicts", await findConflicts(parsed.data));
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/meetings
export async function createHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createMeetingSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    sendSuccess(res, "Meeting booked", await createMeeting(parsed.data, actorOf(req)), 201);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/meetings/:id
export async function getHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, "Meeting", await getMeeting(req.params.id, actorOf(req)));
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/meetings/:id
export async function updateHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = updateMeetingSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    sendSuccess(res, "Meeting updated", await updateMeeting(req.params.id, parsed.data, actorOf(req)));
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/meetings/:id/cancel
export async function cancelHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = cancelMeetingSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    sendSuccess(res, "Meeting cancelled", await cancelMeeting(req.params.id, parsed.data.reason, actorOf(req)));
  } catch (err) {
    next(err);
  }
}
