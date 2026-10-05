import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../types/index.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { env } from "../config/env.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { sendPushToUser } from "../services/pushService.js";

// GET /api/v1/push/vapid-public-key
export async function getVapidPublicKey(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    sendSuccess(res, "VAPID public key", { publicKey: env.VAPID_PUBLIC_KEY });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/push/subscribe
export async function subscribePush(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { endpoint, keys } = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      sendError(res, "Invalid subscription object", 400);
      return;
    }

    const userId = req.user!.userId;

    // Upsert by endpoint
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { userId, endpoint, keys },
      { upsert: true, new: true }
    );

    sendSuccess(res, "Push subscription saved", null, 201);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/push/unsubscribe
export async function unsubscribePush(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) {
      sendError(res, "Endpoint required", 400);
      return;
    }
    await PushSubscription.deleteOne({ endpoint, userId: req.user!.userId });
    sendSuccess(res, "Unsubscribed");
  } catch (err) {
    next(err);
  }
}

/** Who last asked for a test, and when — one every TEST_GAP_MS each. */
const lastTest = new Map<string, number>();
const TEST_GAP_MS = 10_000;

// POST /api/v1/push/test — a test notification to every device the signed-in
// person enabled notifications on: their phone's installed app as much as this
// browser, open or closed. Only ever to themselves.
export async function sendTestPush(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const last = lastTest.get(userId) ?? 0;
    if (Date.now() - last < TEST_GAP_MS) {
      sendError(res, "A test was just sent — wait a few seconds before sending another.", 429);
      return;
    }
    lastTest.set(userId, Date.now());
    const result = await sendPushToUser(userId, {
      title: "Test notification",
      body: "Notifications reach this device. A new lead will show up like this.",
      tag: "crm-test",
      url: "/dashboard",
      data: { type: "test" },
    });
    if (result.devices === 0) {
      sendError(res, "No device is set up for notifications yet — press Enable on this device first.", 409);
      return;
    }
    sendSuccess(res, `Sent to ${result.delivered} of ${result.devices} device${result.devices === 1 ? "" : "s"}`, result);
  } catch (err) {
    next(err);
  }
}
