import type { Response, NextFunction } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../types/index.js";
import { CourseService } from "../services/courseService.js";
import { sendSuccess, sendError } from "../utils/response.js";

const courseService = new CourseService();

// ─── Validation Schemas ───────────────────────────────────────────────────────

/**
 * Every LMS course a course opens, in order ([] unmaps it) — two for a bundle.
 * Slugs as the LMS writes them: lowercase letters, digits and hyphens.
 */
const lmsCourseSlugsSchema = z
  .array(z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,199}$/, "Not an LMS course slug"))
  .max(10, "At most 10 LMS courses")
  .optional();

/** The finance catalogue item it bills against: a 24-character id, or "" to unmap. */
const financeItemIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Not a finance item id").or(z.literal("")).optional();

/** The bonus a client gets with the course, in its amount's currency; 0 for none. */
const bonusAmountSchema = z.number().min(0, "Bonus cannot be negative").optional();

/**
 * The course at the Bangalore academy: its INR price (null takes it off), the
 * item in the Bangalore finance organization ("" unmaps it), and the LMS
 * courses it opens there ([] means the same as Dubai's).
 */
const bangaloreSchema = z
  .object({
    price: z.number().min(0, "Bangalore price cannot be negative").nullable().optional(),
    financeItemId: financeItemIdSchema,
    lmsCourseSlugs: lmsCourseSlugsSchema,
  })
  .strict()
  .optional();

const createCourseSchema = z.object({
  name: z.string().min(1, "Course name is required").max(150),
  description: z.string().max(1000).optional(),
  amount: z.number().min(0, "Amount cannot be negative"),
  bonusAmount: bonusAmountSchema,
  /** The SAC code this course is billed under, for GST invoices. */
  hsnSac: z.string().max(20).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  financeItemId: financeItemIdSchema,
  lmsCourseSlugs: lmsCourseSlugsSchema,
  bangalore: bangaloreSchema,
});

const updateCourseSchema = z.object({
  /**
   * The finance catalogue item this course maps to.
   *
   * A 24-character id or an empty string, which clears it. Accepted here rather
   * than on a route of its own because it is a property of the course, and a
   * second endpoint would be a second thing to keep permissioned.
   */
  financeItemId: financeItemIdSchema,
  lmsCourseSlugs: lmsCourseSlugsSchema,
  bangalore: bangaloreSchema,
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(1000).optional().nullable(),
  amount: z.number().min(0).optional(),
  bonusAmount: bonusAmountSchema,
  hsnSac: z.string().max(20).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

// ─── Controllers ─────────────────────────────────────────────────────────────

export const createCourse = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = createCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const course = await courseService.createCourse(parsed.data);
    sendSuccess(res, "Course created successfully", course, 201);
  } catch (err) {
    next(err);
  }
};

export const getCourses = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { search, status, page, limit } = req.query as Record<string, string>;
    const result = await courseService.getCourses({ search, status, page, limit });
    sendSuccess(res, "Courses fetched successfully", result.courses, 200, result.pagination);
  } catch (err) {
    next(err);
  }
};

export const getAllCourses = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const courses = await courseService.getAllCourses();
    sendSuccess(res, "Courses fetched successfully", courses);
  } catch (err) {
    next(err);
  }
};

export const getCourseById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const course = await courseService.getCourseById(req.params.id);
    sendSuccess(res, "Course fetched successfully", course);
  } catch (err) {
    next(err);
  }
};

export const updateCourse = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = updateCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, "Validation failed", 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const course = await courseService.updateCourse(req.params.id, parsed.data as Record<string, unknown>);
    sendSuccess(res, "Course updated successfully", course);
  } catch (err) {
    next(err);
  }
};

export const deleteCourse = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await courseService.deleteCourse(req.params.id);
    sendSuccess(res, result.message, null);
  } catch (err) {
    next(err);
  }
};

/**
 * The finance catalogue a course can be mapped to.
 *
 * Proxied rather than called from the browser: the signing secret belongs on
 * the server, and a key shipped to a browser is a key that has been published.
 *
 * `?academy=bangalore` lists the Bangalore organization's catalogue instead —
 * where a course's Bangalore item comes from; Dubai's otherwise.
 */
export const getFinanceItems = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { listFinanceItems, financeConfigured, financeOrgOf } = await import("../services/financeClient.js");
    if (!financeConfigured()) {
      sendSuccess(res, "Finance integration is not configured", []);
      return;
    }
    const academy = req.query.academy === "bangalore" ? "bangalore" : "dubai";
    const org = financeOrgOf(academy);
    if (!org) {
      sendSuccess(res, "The Bangalore finance organization is not configured", []);
      return;
    }
    sendSuccess(res, "Finance catalogue retrieved", await listFinanceItems(org));
  } catch (err) {
    next(err);
  }
};

/**
 * The LMS's published courses, for mapping a course onto the one(s) it opens.
 * Read live from the LMS's public course list, so what is offered is what
 * exists there now.
 */
export const getLmsCourses = async (
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { listLmsCourses } = await import("../services/lmsClient.js");
    sendSuccess(res, "LMS courses retrieved", await listLmsCourses());
  } catch (err) {
    next(err);
  }
};
