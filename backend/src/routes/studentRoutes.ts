import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middleware/auth.js";
import { checkPermission } from "../middleware/permissions.js";
import {
  createStudent, getStudents, getStudentById,
  getStudentByLeadId, updateStudent, deleteStudent,
  getMyEnrolments, requestInvoice, getDailyClosings, uploadPaymentReceipt,
} from "../controllers/studentController.js";

const router = Router();

/**
 * A receipt is a photograph or a PDF of one, so the list is short and the
 * limit is what a phone camera produces rather than what a scanner can.
 */
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("A receipt must be a JPG, PNG, WebP, HEIC or PDF"));
  },
});

// Static before parameterized
router.get("/by-lead/:leadId", authenticate, checkPermission("students", "view"), getStudentByLeadId);

// The enrolments screen: a counsellor's own sales, with the state of each
// invoice beside them, so the question does not have to be taken to finance.
// Its own module, not "students" — seeing your own sales is not the same
// grant as seeing the whole student list.
router.get("/enrolments/mine", authenticate, checkPermission("enrolments", "view"), getMyEnrolments);
// Before "/:id", or Express reads "closings" as a student id.
router.get("/closings/daily", authenticate, checkPermission("closings", "view"), getDailyClosings);
// Before "/:id", or Express reads "receipts" as a student id.
router.post(
  "/receipts/:leadId",
  authenticate,
  checkPermission("students", "create"),
  receiptUpload.single("file"),
  uploadPaymentReceipt,
);

// Generate the invoice — the same handover that runs when a lead closes,
// asked for by hand when it never ran or did not get through. Reached only
// from the enrolments screen, so it is gated the same way that screen is.
router.post("/:id/invoice", authenticate, checkPermission("enrolments", "edit"), requestInvoice);

router.get("/",    authenticate, checkPermission("students", "view"),   getStudents);
router.post("/",   authenticate, checkPermission("students", "create"), createStudent);
router.get("/:id", authenticate, checkPermission("students", "view"),   getStudentById);
router.put("/:id", authenticate, checkPermission("students", "edit"),   updateStudent);
router.delete("/:id", authenticate, checkPermission("students", "delete"), deleteStudent);

export default router;
