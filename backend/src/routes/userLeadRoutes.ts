import { Router } from "express";
import { getLeadsByUser, getUserLeadStats, getUserRevenue } from "../controllers/leadController.js";
import { authenticate } from "../middleware/auth.js";
import { selfOrOverseer } from "../middleware/permissions.js";

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(authenticate);

// Their own, or someone who may see them — see selfOrOverseer.
router.get("/:userId/leads", selfOrOverseer(), getLeadsByUser);
router.get("/:userId/lead-stats", selfOrOverseer(), getUserLeadStats);
router.get("/:userId/revenue", selfOrOverseer(), getUserRevenue);

export default router;
