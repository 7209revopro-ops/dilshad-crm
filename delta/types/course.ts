import type { CoursePlan } from "@/types/commission";

export interface Course {
  /** The Delta Finance catalogue item this course is, once mapped. */
  financeItemId?: string | null;
  /** The first of `lmsCourseSlugs` — what a single-course reader sees. */
  lmsCourseSlug?: string;
  /** Every LMS course it opens, in order — two for a bundle. */
  lmsCourseSlugs?: string[];
  /** How it sells at the Bangalore academy: its INR price, finance item and LMS courses (none = Dubai's). */
  bangalore?: CourseBangalore | null;
  _id: string;
  name: string;
  description?: string;
  amount: number;
  /** The bonus a client gets with it, in the amount's currency; 0 (or missing, on one from before) for none. */
  bonusAmount?: number;
  /** The SAC code this course is billed under, for GST invoices. */
  hsnSac?: string;
  /** What selling it earns (AED per approved sale) — set on the Commission plan. */
  commission?: CoursePlan;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface CourseFilters {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/** A published course in the LMS, as the Map screen offers it. */
export interface LmsCourse {
  slug: string;
  title: string;
}

/** A course at the Bangalore academy, as set on the Map dialog. */
export interface CourseBangalore {
  /** Its price there, in INR; without one it can't be closed for Bangalore. */
  price?: number | null;
  /** The item in Bangalore's finance organization; unmapped bills a plain line. */
  financeItemId?: string | null;
  /** The LMS courses it opens there; none means the same as Dubai's. */
  lmsCourseSlugs?: string[];
}

/** Its Bangalore price in INR, or 0 when it has none — and then it can't be closed for Bangalore. */
export const bangalorePriceOf = (course: Pick<Course, "bangalore"> | null | undefined): number => {
  const price = course?.bangalore?.price;
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : 0;
};

/** What a close starts the fee at: the course's price for that academy (Dubai's in AED, Bangalore's in INR). */
export const feeFor = (course: Pick<Course, "amount" | "bangalore"> | null | undefined, academy: "dubai" | "bangalore"): number =>
  academy === "bangalore" ? bangalorePriceOf(course) : course?.amount ?? 0;

/** Every LMS course a course opens; a single mapping from before reads the same. */
export const lmsCoursesOf = (course: Pick<Course, "lmsCourseSlug" | "lmsCourseSlugs">): string[] =>
  course.lmsCourseSlugs?.length ? course.lmsCourseSlugs : course.lmsCourseSlug ? [course.lmsCourseSlug] : [];
