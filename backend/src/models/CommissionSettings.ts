import mongoose, { Schema } from "mongoose";
import type { ICommissionSettings } from "../types/index.js";

/**
 * The commission plan's settings, in one document: who the Sales Manager is,
 * which logins earn nothing, and the salary slabs.
 *
 * A setting rather than a role: there is one Sales Manager for the whole CRM,
 * and whoever holds the job keeps whatever role they had. The excluded logins
 * are the shared ones (root user, superadmin, developer) — a sale closed under
 * one belongs to nobody in particular, so it earns nobody anything.
 */
const slabRowSchema = new Schema(
  {
    name: { type: String, required: true },
    target: { type: Number, min: 0, required: true },
    salary: { type: Number, min: 0, required: true },
    percent: { type: Number, min: 0, max: 100, required: true },
  },
  { _id: false },
);

/**
 * The slabs as a Super Admin left them in a month ("YYYY-MM"), in force from
 * that month until the next change — so changing them in November leaves
 * October's pay as it was. None stored: the defaults (salaryService).
 */
const slabsVersionSchema = new Schema(
  {
    from: { type: String, required: true },
    sales: { type: [slabRowSchema], default: [] },
    tl: { type: [slabRowSchema], default: [] },
    sm: { type: [slabRowSchema], default: [] },
    updatedAt: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const commissionSettingsSchema = new Schema<ICommissionSettings>(
  {
    key: { type: String, default: "default", unique: true },
    salesManager: { type: Schema.Types.ObjectId, ref: "User", default: null },
    excludedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    salarySlabs: { type: [slabsVersionSchema], default: undefined },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  // Named outright: the user-run setup script writes this collection by name.
  { timestamps: true, versionKey: false, collection: "commissionsettings" },
);

export const CommissionSettings = mongoose.model<ICommissionSettings>(
  "CommissionSettings",
  commissionSettingsSchema,
);
