import type { Response, NextFunction } from "express";
import { Types } from "mongoose";
import type { AuthenticatedRequest } from "../types/index.js";
import { Notification } from "../models/Notification.js";
import { toNotificationDTO } from "../services/notificationService.js";
import { sendSuccess, sendError } from "../utils/response.js";

/*
 * Everyone reads and clears their own notifications, and only their own —
 * every query below is keyed on the caller. Somebody else's notification id
 * answers exactly like one that does not exist.
 */

// GET /api/v1/notifications?limit=50
export async function listMyNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = new Types.ObjectId(req.user!.userId);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const [items, unread] = await Promise.all([
      Notification.find({ user }).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ user, readAt: null }),
    ]);
    sendSuccess(res, "Notifications", { items: items.map(toNotificationDTO), unread });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/notifications/read-all
export async function markAllNotificationsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await Notification.updateMany(
      { user: new Types.ObjectId(req.user!.userId), readAt: null },
      { $set: { readAt: new Date() } }
    );
    sendSuccess(res, "Marked as read", { updated: result.modifiedCount });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/notifications/:id
export async function deleteNotification(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      sendError(res, "Invalid notification id", 400);
      return;
    }
    const result = await Notification.deleteOne({ _id: id, user: new Types.ObjectId(req.user!.userId) });
    if (!result.deletedCount) {
      sendError(res, "Notification not found", 404);
      return;
    }
    sendSuccess(res, "Notification removed", { id });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/notifications
export async function clearNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await Notification.deleteMany({ user: new Types.ObjectId(req.user!.userId) });
    sendSuccess(res, "Notifications cleared", { deleted: result.deletedCount });
  } catch (err) {
    next(err);
  }
}
