import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import {
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
  sendTestPush,
} from "../controllers/pushController.js";

const router = Router();

router.use(authenticate);

router.get("/vapid-public-key", getVapidPublicKey);
router.post("/subscribe",       subscribePush);
router.delete("/unsubscribe",   unsubscribePush);
// A test notification to the signed-in person's own devices only.
router.post("/test",           sendTestPush);

export default router;
