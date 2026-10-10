import { Course } from "../models/Course.js";
import { buildPagination } from "../utils/response.js";
import type { ICourse } from "../types/index.js";

export interface CourseFilters {
  search?: string;
  status?: string;
  page?: string;
  limit?: string;
}

/** Where a course maps: finance's product, and the LMS course(s) it opens. */
export interface CourseMapping {
  /** The finance catalogue item's id; "" or null unmaps it; undefined leaves it. */
  financeItemId?: string | null;
  /** Every LMS course it opens, in order; [] unmaps it; undefined leaves it. */
  lmsCourseSlugs?: string[];
  /** How it sells at the Bangalore academy; each field as above (undefined leaves it). */
  bangalore?: {
    /** Its price there, in INR; null takes it off — it then can't be closed for Bangalore. */
    price?: number | null;
    /** The item in the Bangalore finance organization; "" or null unmaps it. */
    financeItemId?: string | null;
    /** The LMS courses it opens there; [] means the same as Dubai's. */
    lmsCourseSlugs?: string[];
  };
}

/** Trimmed, no repeats, in order. */
const slugList = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];

/** The Bangalore fields to set, by name under `bangalore`: only those the caller mentioned. */
function bangaloreFields(b: CourseMapping["bangalore"]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (!b) return fields;
  if (b.price !== undefined) fields.price = b.price === null ? undefined : b.price;
  if (b.financeItemId !== undefined) fields.financeItemId = b.financeItemId || null;
  if (b.lmsCourseSlugs !== undefined) fields.lmsCourseSlugs = slugList(b.lmsCourseSlugs);
  return fields;
}

/**
 * The fields to store for a mapping: nothing for a side the caller did not
 * mention, and the LMS list (trimmed, no repeats) with its first as
 * `lmsCourseSlug` — what everything reading a single course reads.
 */
function mappingFields(mapping: CourseMapping): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  // "" is how a form says "no item"; stored as null rather than an empty id
  if (mapping.financeItemId !== undefined) fields.financeItemId = mapping.financeItemId || null;
  if (mapping.lmsCourseSlugs !== undefined) {
    const slugs = slugList(mapping.lmsCourseSlugs);
    fields.lmsCourseSlugs = slugs;
    fields.lmsCourseSlug = slugs[0] ?? "";
  }
  return fields;
}

export class CourseService {
  // ── Create ──────────────────────────────────────────────────────────────────
  async createCourse(data: { name: string; description?: string; amount: number; bonusAmount?: number; status?: string } & CourseMapping) {
    const { financeItemId, lmsCourseSlugs, bangalore, ...rest } = data;
    const b = bangaloreFields(bangalore);
    const course = await Course.create({
      ...rest,
      ...mappingFields({ financeItemId, lmsCourseSlugs }),
      ...(Object.keys(b).length ? { bangalore: b } : {}),
    });
    return course;
  }

  // ── List ─────────────────────────────────────────────────────────────────────
  async getCourses(filters: CourseFilters) {
    const page = Math.max(1, parseInt(filters.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit ?? "20", 10)));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (filters.status) query.status = filters.status;

    if (filters.search) {
      const regex = new RegExp(filters.search, "i");
      query.$or = [{ name: regex }, { description: regex }];
    }

    const [courses, total] = await Promise.all([
      Course.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Course.countDocuments(query),
    ]);

    return { courses, pagination: buildPagination(total, page, limit) };
  }

  // ── Get All (for dropdowns) ──────────────────────────────────────────────────
  async getAllCourses() {
    return Course.find({ status: "active" }).sort({ name: 1 }).lean();
  }

  // ── Get by ID ────────────────────────────────────────────────────────────────
  async getCourseById(id: string) {
    const course = await Course.findById(id);
    if (!course)
      throw Object.assign(new Error("Course not found"), { statusCode: 404 });
    return course;
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  async updateCourse(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      amount: number;
      bonusAmount: number;
      status: string;
    }> & CourseMapping,
  ) {
    const course = await Course.findById(id);
    if (!course)
      throw Object.assign(new Error("Course not found"), { statusCode: 404 });

    const { financeItemId, lmsCourseSlugs, bangalore, ...rest } = data;
    Object.assign(course, rest, mappingFields({ financeItemId, lmsCourseSlugs }));
    for (const [key, value] of Object.entries(bangaloreFields(bangalore))) course.set(`bangalore.${key}`, value);
    await course.save();
    return course;
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async deleteCourse(id: string) {
    const course = await Course.findById(id);
    if (!course)
      throw Object.assign(new Error("Course not found"), { statusCode: 404 });
    await Course.findByIdAndDelete(id);
    return { message: "Course deleted successfully" };
  }
}
