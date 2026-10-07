import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissions.js";
import {
  calendarHandler,
  cancelHandler,
  conflictsHandler,
  createHandler,
  getHandler,
  peopleHandler,
  updateHandler,
} from "../controllers/meetingController.js";

/*
 * Open to anybody signed in, like the mentor calendar: booking time with
 * colleagues is everyday work. Who may see, change or cancel a meeting is
 * decided per meeting in meetingService — organizer, attendees, super admin.
 */
const router = Router();

router.use(authenticate);

// Static paths before /:id
// The Calendar page itself follows the Calendar box on the Roles screen.
router.get("/calendar", checkPermission("calendar", "view"), calendarHandler);
router.get("/people", peopleHandler);
router.post("/conflicts", conflictsHandler);
router.post("/", createHandler);

router.get("/:id", getHandler);
router.put("/:id", updateHandler);
router.post("/:id/cancel", cancelHandler);

export default router;
