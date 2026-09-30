import mongoose, { Schema } from "mongoose";
import type { ILoginEvent } from "../types/index.js";

/**
 * Sign-ins, failed sign-ins and sign-outs, for the Activity page. Kept a year.
 * `user` is null when the email matched nobody.
 */
const loginEventSchema = new Schema<ILoginEvent>(
  {
    user:       { type: Schema.Types.ObjectId, ref: "User", default: null },
    email:      { type: String, default: "", lowercase: true, trim: true, maxlength: 200 },
    kind:       { type: String, enum: ["login", "login_failed", "logout"], required: true },
    method:     { type: String, enum: ["password", "sso", null], default: null },
    reason:     { type: String, enum: ["wrong_password", "unknown_email", "deactivated", "no_account", null], default: null },
    ip:         { type: String, default: "" },
    userAgent:  { type: String, default: "", maxlength: 500 },
    device:     { type: String, default: "" },
    deviceType: { type: String, enum: ["desktop", "mobile", "tablet", "app", "unknown"], default: "unknown" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

loginEventSchema.index({ user: 1, createdAt: -1 });
loginEventSchema.index({ kind: 1, createdAt: -1 });
loginEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const LoginEvent = mongoose.model<ILoginEvent>("LoginEvent", loginEventSchema);
