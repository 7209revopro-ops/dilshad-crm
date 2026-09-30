import mongoose, { Schema } from "mongoose";
import type { IMeeting } from "../types/index.js";

/**
 * A meeting booked in the CRM: the organizer, the employees they invited, and
 * optionally a client (a lead) and mentors from the LMS — those two are
 * invited by email with a calendar invite. Cancelled meetings are kept, marked
 * cancelled, so the calendar can say so.
 */
const meetingMentorSchema = new Schema(
  {
    lmsId: { type: String, required: true },
    name:  { type: String, default: "" },
    email: { type: String, required: true, lowercase: true, trim: true },
  },
  { _id: false }
);

const meetingSchema = new Schema<IMeeting>(
  {
    title:           { type: String, required: true, trim: true, maxlength: 200 },
    notes:           { type: String, trim: true, maxlength: 2000, default: "" },
    link:            { type: String, trim: true, maxlength: 500, default: "" },
    startAt:         { type: Date, required: true },
    endAt:           { type: Date, required: true },
    organizer:       { type: Schema.Types.ObjectId, ref: "User", required: true },
    attendees:       [{ type: Schema.Types.ObjectId, ref: "User" }],
    lead:            { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    mentors:         { type: [meetingMentorSchema], default: [] },
    status:          { type: String, enum: ["scheduled", "cancelled"], default: "scheduled" },
    cancelledAt:     { type: Date, default: null },
    cancelledBy:     { type: Schema.Types.ObjectId, ref: "User", default: null },
    cancelReason:    { type: String, trim: true, maxlength: 500, default: "" },
    reminderMinutes: { type: Number, default: 15, min: 0, max: 1440 },
    reminderSentAt:  { type: Date, default: null },
    sequence:        { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

meetingSchema.index({ organizer: 1, startAt: 1 });
meetingSchema.index({ attendees: 1, startAt: 1 });
meetingSchema.index({ status: 1, startAt: 1 });
meetingSchema.index({ lead: 1 });

export const Meeting = mongoose.model<IMeeting>("Meeting", meetingSchema);
