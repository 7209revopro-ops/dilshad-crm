import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissions.js";
import { LeaderboardService, isLeaderboardMonth } from "../services/leaderboardService.js";
import { sendSuccess, sendError } from "../utils/response.js";

const router = Router();
const service = new LeaderboardService();

// GET /api/v1/leaderboard?month=YYYY-MM — the whole board, for a role with the
// Leaderboard box (every role until someone unticks it); no month means this Dubai month.
router.get("/", authenticate, checkPermission("leaderboard", "view"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const month = req.query.month;
    if (month !== undefined && !isLeaderboardMonth(month)) {
      sendError(res, "month must look like 2026-10", 400);
      return;
    }
    sendSuccess(res, "Leaderboard", await service.getLeaderboard(month as string | undefined));
  } catch (error) {
    next(error);
  }
});

export default router;
