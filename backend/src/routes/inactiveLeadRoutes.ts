import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissions.js";
import {
  listInactiveLeadsHandler,
  listLeadMovesHandler,
  reassignInactiveLeadsHandler,
} from "../controllers/inactiveLeadController.js";

/** The super admin's Inactive leads page — nobody else's. */
const router = Router();

// The Super Admin, and any role given the Inactive Leads box: view to look,
// edit to move leads to someone else.
router.use(authenticate);

router.get("/", checkPermission("inactive-leads", "view"), listInactiveLeadsHandler);
router.get("/moves", checkPermission("inactive-leads", "view"), listLeadMovesHandler);
router.post("/reassign", checkPermission("inactive-leads", "edit"), reassignInactiveLeadsHandler);

export default router;
