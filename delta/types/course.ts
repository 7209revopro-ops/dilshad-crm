export interface Course {
  /** The Delta Finance catalogue item this course is, once mapped. */
  financeItemId?: string | null;
  _id: string;
  name: string;
  description?: string;
  amount: number;
  /** The SAC code this course is billed under, for GST invoices. */
  hsnSac?: string;
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
