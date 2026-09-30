import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissions.js";
import {
  getAppSettingsHandler,
  updateAppSettingsHandler,
  sendTestEmail,
} from "../controllers/settingsController.js";

const router = Router();

router.use(authenticate);

router.get("/app",             checkPermission("settings", "view"), getAppSettingsHandler);
router.put("/app",             checkPermission("settings", "edit"), updateAppSettingsHandler);
router.post("/app/test-email", checkPermission("settings", "edit"), sendTestEmail);

export default router;
