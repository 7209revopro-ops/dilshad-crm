import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/permissions.js";
import {
  heartbeatHandler,
  idleStretchesHandler,
  loginEventsHandler,
  peopleHandler,
} from "../controllers/activityController.js";

const router = Router();

// Everyone signed in reports their own activity.
router.post("/heartbeat", authenticate, heartbeatHandler);

// The Activity page — the super admin's alone.
router.get("/people", authenticate, requireSuperAdmin, peopleHandler);
router.get("/logins", authenticate, requireSuperAdmin, loginEventsHandler);
router.get("/idle", authenticate, requireSuperAdmin, idleStretchesHandler);

export default router;
