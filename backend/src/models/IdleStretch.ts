import mongoose, { Schema } from "mongoose";
import type { IIdleStretch } from "../types/index.js";

/**
 * A stretch of no activity that raised an idle alert — from the last activity
 * (`since`) until the person is back in the app (`endedAt`). Kept a year.
 */
const idleStretchSchema = new Schema<IIdleStretch>(
  {
    user:      { type: Schema.Types.ObjectId, ref: "User", required: true },
    since:     { type: Date, required: true },
    alertedAt: { type: Date, required: true },
    endedAt:   { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

idleStretchSchema.index({ user: 1, alertedAt: -1 });
idleStretchSchema.index({ alertedAt: -1 });
idleStretchSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const IdleStretch = mongoose.model<IIdleStretch>("IdleStretch", idleStretchSchema);
