import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  listMyNotifications,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
} from "../controllers/notificationController.js";

// Everyone's own notifications — no module permission, only a signed-in user.
const router = Router();

router.use(authenticate);

router.get("/",          listMyNotifications);
router.post("/read-all", markAllNotificationsRead);
router.delete("/",       clearNotifications);
router.delete("/:id",    deleteNotification);   // ← parameterised last

export default router;
