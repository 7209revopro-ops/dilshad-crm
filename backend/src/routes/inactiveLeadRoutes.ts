import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireSuperAdmin } from "../middleware/permissions.js";
import {
  listInactiveLeadsHandler,
  listLeadMovesHandler,
  reassignInactiveLeadsHandler,
} from "../controllers/inactiveLeadController.js";

/** The super admin's Inactive leads page — nobody else's. */
const router = Router();

router.use(authenticate, requireSuperAdmin);

router.get("/", listInactiveLeadsHandler);
router.get("/moves", listLeadMovesHandler);
router.post("/reassign", reassignInactiveLeadsHandler);

export default router;
