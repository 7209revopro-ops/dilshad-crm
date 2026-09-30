import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  mentorSchedule, classDetail, scheduleMeeting, meetingDetail, updateMeeting, cancelMeeting,
} from "../controllers/mentorController.js";

const router = Router();

/*
 * Open to anybody signed in — no permission check, by decision. Booking an
 * hour with a mentor is work the people doing the work do; a calendar only
 * some of them can see is one they have to ask somebody else to read for
 * them. The same reasoning the Root portal, which reads this same LMS, was
 * already built on.
 *
 * Nothing here reaches into the LMS on the viewer's behalf beyond what it
 * already authorises for itself: listing one academy's mentors, and booking,
 * reading, changing or cancelling one meeting. Editing or cancelling
 * somebody else's is the LMS's call, not this router's — it checks who
 * booked it, or whether this CRM's own super admin is asking.
 */
router.use(authenticate);

router.get("/schedule", mentorSchedule);
router.post("/meetings", scheduleMeeting);

router.get("/classes/:classId", classDetail);
router.get("/meetings/:meetingId", meetingDetail);
router.patch("/meetings/:meetingId", updateMeeting);
router.post("/meetings/:meetingId/cancel", cancelMeeting);

export default router;
