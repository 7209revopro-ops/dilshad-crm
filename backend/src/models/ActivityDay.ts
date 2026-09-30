import mongoose, { Schema } from "mongoose";
import type { IActivityDay } from "../types/index.js";

/**
 * Active minutes per person per day — `day` is the date in the working hours'
 * time zone. One minute counts once however many tabs send a heartbeat in it
 * (`lastMinute`). Kept a year.
 */
const activityDaySchema = new Schema<IActivityDay>(
  {
    user:          { type: Schema.Types.ObjectId, ref: "User", required: true },
    day:           { type: String, required: true },
    activeMinutes: { type: Number, default: 0 },
    firstActiveAt: { type: Date, default: null },
    lastActiveAt:  { type: Date, default: null },
    lastMinute:    { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

activityDaySchema.index({ user: 1, day: 1 }, { unique: true });
activityDaySchema.index({ day: 1 });
activityDaySchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const ActivityDay = mongoose.model<IActivityDay>("ActivityDay", activityDaySchema);
