import type { Response, NextFunction } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../types/index.js";
import { CommissionService, isSuperAdmin, uaeMonthOf } from "../services/commissionService.js";
import { sendSuccess, sendError } from "../utils/response.js";

const commissionService = new CommissionService();

// ─── Validation Schemas ───────────────────────────────────────────────────────

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Not an id");
/** AED (or USD for the credit), whole or with fils; never negative. */
const money = z.number().min(0, "Cannot be negative").max(1_000_000);

const coursePlanSchema = z.object({
  sales: money,
  tl: money,
  sm: money,
  creditUsd: money,
});

const settingsSchema = z
  .object({
    salesManager: objectId.or(z.literal("")).nullable().optional(),
    excludedUsers: z.array(objectId).max(200).optional(),
  })
  .refine((v) => v.salesManager !== undefined || v.excludedUsers !== undefined, "Nothing to change");

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM");

const previewSchema = z.object({
  course: objectId,
  team: objectId.optional(),
  closer: objectId.optional(),
});

// ─── Middleware ───────────────────────────────────────────────────────────────

/** Only a Super Admin sets what people are paid. */
export const requireSuperAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!isSuperAdmin(req.user?.role)) {
    sendError(res, "Only a Super Admin can change the commission plan", 403);
    return;
  }
  next();
};

const viewerOf = (req: AuthenticatedRequest) => ({ userId: req.user!.userId, role: req.user!.role });

// ─── Controllers ─────────────────────────────────────────────────────────────

export const getPlan = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const plan = await commissionService.getPlan(viewerOf(req));
    sendSuccess(res, "Commission plan fetched", plan);
  } catch (err) {
    next(err);
  }
};

export const updateCoursePlan = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = objectId.safeParse(req.params.courseId);
    const parsed = coursePlanSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      sendError(res, "Validation failed", 400, parsed.success ? { courseId: ["Not an id"] } : parsed.error.flatten().fieldErrors);
      return;
    }
    const course = await commissionService.updateCoursePlan(id.data, parsed.data, req.user!.userId);
    sendSuccess(res, "Commission plan updated", course);
  } catch (err) {
    next(err);
  }
};

export const updateSettings = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten());
      return;
    }
    const plan = await commissionService.updateSettings(
      {
        ...(parsed.data.salesManager !== undefined ? { salesManager: parsed.data.salesManager || null } : {}),
        ...(parsed.data.excludedUsers !== undefined ? { excludedUsers: parsed.data.excludedUsers } : {}),
      },
      viewerOf(req),
    );
    sendSuccess(res, "Commission settings updated", plan);
  } catch (err) {
    next(err);
  }
};

export const getEarnings = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const raw = typeof req.query.month === "string" && req.query.month ? req.query.month : uaeMonthOf(new Date());
    const month = monthSchema.safeParse(raw);
    if (!month.success) {
      sendError(res, "Month must be YYYY-MM", 400);
      return;
    }
    const earnings = await commissionService.getEarnings(viewerOf(req), month.data);
    sendSuccess(res, "Commission fetched", earnings);
  } catch (err) {
    next(err);
  }
};

export const getPreview = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const parsed = previewSchema.safeParse({
      course: q.course,
      team: q.team || undefined,
      closer: q.closer || undefined,
    });
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const preview = await commissionService.preview(parsed.data);
    sendSuccess(res, "Commission preview", preview);
  } catch (err) {
    next(err);
  }
};
