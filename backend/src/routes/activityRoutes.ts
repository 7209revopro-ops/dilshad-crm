import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissions.js";
import {
  heartbeatHandler,
  idleStretchesHandler,
  loginEventsHandler,
  peopleHandler,
} from "../controllers/activityController.js";

const router = Router();

// Everyone signed in reports their own activity.
router.post("/heartbeat", authenticate, heartbeatHandler);

// The Activity page — the Super Admin, and any role given the Activity box.
router.get("/people", authenticate, checkPermission("activity", "view"), peopleHandler);
router.get("/logins", authenticate, checkPermission("activity", "view"), loginEventsHandler);
router.get("/idle", authenticate, checkPermission("activity", "view"), idleStretchesHandler);

export default router;
