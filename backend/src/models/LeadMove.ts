import mongoose, { Schema } from "mongoose";
import type { ILeadMove } from "../types/index.js";

/**
 * The log behind the Inactive leads page: every lead moved on because its
 * owner did not act on it in time. The lead's own activity log says the same
 * thing on the lead; this is the one place to read them all, newest first.
 */
const leadMoveSchema = new Schema<ILeadMove>(
  {
    lead:            { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    leadName:        { type: String, default: "" },
    team:            { type: Schema.Types.ObjectId, ref: "Team", default: null },
    from:            { type: Schema.Types.ObjectId, ref: "User", required: true },
    to:              { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind:            { type: String, enum: ["automatic", "manual"], required: true },
    by:              { type: Schema.Types.ObjectId, ref: "User", default: null },
    inactiveMinutes: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

leadMoveSchema.index({ createdAt: -1 });
leadMoveSchema.index({ lead: 1, createdAt: -1 });

export const LeadMove = mongoose.model<ILeadMove>("LeadMove", leadMoveSchema);
