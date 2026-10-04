import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  getPlan,
  updateCoursePlan,
  updateSettings,
  getEarnings,
  getPreview,
  requireSuperAdmin,
} from "../controllers/commissionController.js";

/*
 * Commission: open to everyone signed in, like Mentors — what each person sees
 * is narrowed in the service (their own, their team's, or everyone's), and
 * only a Super Admin changes the plan. Not behind a module: a module would
 * start every role but Super Admin with no access to their own pay.
 */
const router = Router();

router.use(authenticate);

router.get("/plan", getPlan);
router.put("/plan/:courseId", requireSuperAdmin, updateCoursePlan);
router.put("/settings", requireSuperAdmin, updateSettings);
router.get("/earnings", getEarnings);
// What a sale would earn, for the closing dialog — nothing is saved.
router.get("/preview", getPreview);

export default router;
