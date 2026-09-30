import mongoose, { Schema } from "mongoose";
import type { IUserPresence } from "../types/index.js";

/**
 * Where each person is — one document per user. The web app's heartbeat
 * moves lastSeenAt (the app is open) and lastActiveAt (someone used it);
 * sign-in and sign-out stamp theirs. Read by the Activity page and the idle
 * alerts.
 */
const userPresenceSchema = new Schema<IUserPresence>(
  {
    user:          { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    lastSeenAt:    { type: Date, default: null },
    lastActiveAt:  { type: Date, default: null },
    lastLoginAt:   { type: Date, default: null },
    lastLogoutAt:  { type: Date, default: null },
    lastIp:        { type: String, default: "" },
    lastDevice:    { type: String, default: "" },
    idleAlertedAt: { type: Date, default: null },
  },
  { versionKey: false }
);

userPresenceSchema.index({ lastActiveAt: 1 });

export const UserPresence = mongoose.model<IUserPresence>("UserPresence", userPresenceSchema);
