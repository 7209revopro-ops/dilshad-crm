import mongoose, { Schema } from "mongoose";
import type { INotification } from "../types/index.js";

/**
 * One person's notice, kept so the bell still shows it after a reload.
 *
 * Written by `notify()` alongside the live socket event and the push — those
 * two are how it arrives, this is what is left afterwards. Old ones expire on
 * their own after 60 days: long enough to scroll back to, short enough that
 * the collection never needs tending.
 */
const notificationSchema = new Schema<INotification>(
  {
    user:   { type: Schema.Types.ObjectId, ref: "User", required: true },
    type:   { type: String, required: true, trim: true, maxlength: 60 },
    title:  { type: String, required: true, trim: true, maxlength: 200 },
    body:   { type: String, default: "", trim: true, maxlength: 1000 },
    url:    { type: String, default: "", trim: true, maxlength: 500 },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

// The bell's own query: newest first, per person.
notificationSchema.index({ user: 1, createdAt: -1 });
// The unread count.
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export const Notification = mongoose.model<INotification>("Notification", notificationSchema);
