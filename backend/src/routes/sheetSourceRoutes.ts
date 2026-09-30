import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissions.js";
import {
  listSheetSources,
  createSheetSource,
  updateSheetSource,
  deleteSheetSource,
} from "../controllers/sheetSourceController.js";

const router = Router();

router.get(  "/",    authenticate, checkPermission("settings", "view"),   listSheetSources);
router.post( "/",    authenticate, checkPermission("settings", "create"), createSheetSource);
router.put(  "/:id", authenticate, checkPermission("settings", "edit"),   updateSheetSource);
router.delete("/:id", authenticate, checkPermission("settings", "delete"), deleteSheetSource);

export default router;
