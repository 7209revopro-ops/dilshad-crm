import { Router } from "express";
import { login, refreshToken, getProfile, changePassword, ssoLogin, logout } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// Public routes
router.post("/login", login);
router.post("/refresh-token", refreshToken);
router.post("/sso-login", ssoLogin); // Root ERP SSO

// Protected routes
router.get("/profile", authenticate, getProfile);
router.put("/change-password", authenticate, changePassword);
router.post("/logout", authenticate, logout);

export default router;
