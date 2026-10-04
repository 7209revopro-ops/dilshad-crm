import mongoose, { Schema } from "mongoose";
import type { ICommissionSettings } from "../types/index.js";

/**
 * The commission plan's two settings, in one document: who the Sales Manager
 * is, and which logins earn nothing.
 *
 * A setting rather than a role: there is one Sales Manager for the whole CRM,
 * and whoever holds the job keeps whatever role they had. The excluded logins
 * are the shared ones (root user, superadmin, developer) — a sale closed under
 * one belongs to nobody in particular, so it earns nobody anything.
 */
const commissionSettingsSchema = new Schema<ICommissionSettings>(
  {
    key: { type: String, default: "default", unique: true },
    salesManager: { type: Schema.Types.ObjectId, ref: "User", default: null },
    excludedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  // Named outright: the user-run setup script writes this collection by name.
  { timestamps: true, versionKey: false, collection: "commissionsettings" },
);

export const CommissionSettings = mongoose.model<ICommissionSettings>(
  "CommissionSettings",
  commissionSettingsSchema,
);
