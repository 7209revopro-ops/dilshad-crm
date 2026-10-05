import { Types } from "mongoose";
import {
  BASE_CURRENCY,
  CLOSE_CURRENCIES,
  ENROLMENT_LANGUAGES,
  ENROLMENT_PAYMENT_METHODS,
  type CloseCurrency,
  type EnrolmentLanguage,
  type EnrolmentPaymentMethod,
} from "../types/index.js";
import { Student } from "../models/Student.js";
import { Lead } from "../models/Lead.js";
import type { IStudent, IStudentPayment } from "../types/index.js";

function createError(msg: string, status: number) {
  return Object.assign(new Error(msg), { statusCode: status });
}

/** Whole fils, so 300.10 + 199.90 is 500 and never 499.9999. */
const minor = (n: number) => Math.round(n * 100);
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

type ReceiptInput = { name?: string; url?: string; key?: string; size?: number; mimeType?: string } | null | undefined;
type PaymentInput = {
  method?: string;
  amount?: number | string;
  receipt?: ReceiptInput;
  paidAt?: string;
  collectedBefore?: boolean;
  currency?: string;
  amountInCurrency?: number | string;
  exchangeRate?: number | string;
} | null;

/**
 * A payment taken in another currency than AED (the owner, 2026-10-05): the
 * currency, the amount in it and the rate — 1 of it = `exchangeRate` AED —
 * checked against the AED amount the close converted it to. Within half a
 * percent, for rounding; a figure typed in the wrong currency is refused rather
 * than billed. Nothing for an AED payment, nor for the money already on the
 * lead, which is in AED.
 */
function foreignPart(raw: PaymentInput, aed: number, n: string): Pick<IStudentPayment, "currency" | "amountInCurrency" | "exchangeRate"> {
  const currency = typeof raw?.currency === "string" ? raw.currency.trim().toUpperCase() : "";
  if (!currency || currency === BASE_CURRENCY) return {};
  if (!CLOSE_CURRENCIES.includes(currency as CloseCurrency)) throw createError(`${n} is in a currency this CRM does not take (${currency}).`, 422);
  if (raw?.collectedBefore) throw createError(`${n} was already on the lead in ${BASE_CURRENCY}, so it cannot be in ${currency}.`, 422);
  const inCurrency = Number(raw?.amountInCurrency);
  if (!Number.isFinite(inCurrency) || inCurrency <= 0) throw createError(`${n} needs the amount paid in ${currency}.`, 422);
  const rate = Number(raw?.exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) throw createError(`${n} needs its rate: 1 ${currency} = how many ${BASE_CURRENCY}.`, 422);
  const expected = Math.round(inCurrency * rate * 100);
  if (Math.abs(minor(aed) - expected) > Math.max(1, Math.round(expected * 0.005))) {
    throw createError(
      `${n}: ${money(inCurrency)} ${currency} at 1 ${currency} = ${rate} ${BASE_CURRENCY} comes to ${money(expected / 100)} ${BASE_CURRENCY}, not ${money(aed)}.`,
      422,
    );
  }
  return { currency: currency as CloseCurrency, amountInCurrency: minor(inCurrency) / 100, exchangeRate: rate };
}

/**
 * The payments a close sends, checked (the user, 2026-10-05: a client may pay
 * part in cash and part by card, each with its own receipt): every one with a
 * method this CRM takes, an amount above zero and its receipt, and together
 * exactly what was paid. Null when the close sent none — an older screen, with
 * one method, one receipt and the total.
 */
function checkedPayments(list: unknown, paidAmount: number, enrolledOn: Date): IStudentPayment[] | null {
  if (list === undefined || list === null) return null;
  if (!Array.isArray(list) || list.length === 0 || list.length > 10) throw createError("A closing takes between one and ten payments.", 422);
  const payments = (list as PaymentInput[]).map((raw, i) => {
    const n = list.length > 1 ? `Payment ${i + 1}` : "The payment";
    if (!ENROLMENT_PAYMENT_METHODS.includes(raw?.method as EnrolmentPaymentMethod)) throw createError(`${n} needs a payment method.`, 422);
    const amount = Number(raw?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw createError(`${n} needs an amount above zero.`, 422);
    if (!raw?.receipt?.key || !raw.receipt.url) throw createError(`${n} needs its receipt.`, 422);
    const paidAt = raw.paidAt ? new Date(raw.paidAt) : enrolledOn;
    return {
      method: raw.method as EnrolmentPaymentMethod,
      amount: minor(amount) / 100,
      receipt: {
        name: raw.receipt.name || "Receipt",
        url: raw.receipt.url,
        key: raw.receipt.key,
        ...(raw.receipt.size ? { size: raw.receipt.size } : {}),
        ...(raw.receipt.mimeType ? { mimeType: raw.receipt.mimeType } : {}),
        uploadedAt: new Date(),
      },
      paidAt: Number.isNaN(paidAt.getTime()) ? enrolledOn : paidAt,
      ...(raw.collectedBefore ? { collectedBefore: true } : {}),
      ...foreignPart(raw, amount, n),
    };
  });
  const sum = payments.reduce((s, p) => s + minor(p.amount), 0);
  if (sum !== minor(paidAmount)) {
    throw createError(`The payments come to ${money(sum / 100)}, but ${money(paidAmount)} was paid — they must match.`, 422);
  }
  return payments;
}

/** What was collected may not be more than the fee (the user, 2026-10-05: "block"). */
function assertNotOverFee(totalFee: number, paidAmount: number): void {
  if (minor(paidAmount) > minor(totalFee)) {
    throw createError(
      `What was collected (${money(paidAmount)}) is more than the fee (${money(totalFee)}). Check the course, the fee and the amounts, then try again.`,
      422,
    );
  }
}

/** A bonus amount that can be recorded: a real number above zero. */
function isBonusAmount(v: unknown): boolean {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) && n > 0;
}

// Auto-generate enrollment number: STU-0001, STU-0002, ...
async function nextEnrollmentNumber(): Promise<string> {
  const last = await Student.findOne().sort({ createdAt: -1 }).select("enrollmentNumber").lean();
  if (!last) return "STU-0001";
  const match = last.enrollmentNumber.match(/\d+$/);
  const num = match ? parseInt(match[0], 10) + 1 : 1;
  return `STU-${String(num).padStart(4, "0")}`;
}

export class StudentService {

  // ── Create ───────────────────────────────────────────────────────────────────

  async createStudent(data: {
    leadId: string;
    name: string;
    phone?: string;
    email?: string;
    course?: string | null;
    team?: string | null;
    assignedTo?: string | null;
    initialLeadResponse?: string | null;
    primaryConcern?: string | null;
    followupStrategyType?: string | null;
    demoScheduled?: boolean;
    demoAttended?: boolean;
    firstContactTime?: string | null;
    lastFollowupDate?: string | null;
    enrollmentDate?: string;
    feeStatus?: string;
    totalFee?: number;
    paidAmount?: number;
    notes?: string;
    language?: string;
    paymentMethod?: string;
    paymentReceipt?: { name: string; url: string; key: string; size?: number; mimeType?: string } | null;
    /** Each payment taken, when the client paid in more than one way. */
    payments?: unknown;
    hasBonus?: boolean;
    bonusAmount?: number;
  }) {
    const existing = await Student.findOne({ leadId: data.leadId });
    if (existing) throw createError("A student already exists for this lead", 409);

    const totalFee   = data.totalFee   ?? 0;
    const paidAmount = data.paidAmount ?? 0;
    const enrolledOn = data.enrollmentDate ? new Date(data.enrollmentDate) : new Date();
    // One payment or several; the first is also the one method and receipt.
    const payments = checkedPayments(data.payments, paidAmount, enrolledOn);
    const paymentMethod = payments?.[0]?.method ?? data.paymentMethod;
    const paymentReceipt = payments?.[0]?.receipt ?? data.paymentReceipt;

    /*
     * Required here rather than on the model.
     *
     * Enrolments predating these fields exist and have to keep loading, so the
     * schema leaves them optional; the requirement belongs at the moment of
     * closing, which is the only moment somebody is in a position to answer.
     *
     * All three are asked for at once and refused as one list. Rejecting them
     * one at a time means three round trips to learn three things the form
     * could have said together.
     */
    const missing: string[] = [];
    if (!ENROLMENT_LANGUAGES.includes(data.language as EnrolmentLanguage)) missing.push("language");
    if (!ENROLMENT_PAYMENT_METHODS.includes(paymentMethod as EnrolmentPaymentMethod)) {
      missing.push("payment method");
    }
    if (!paymentReceipt?.key || !paymentReceipt.url) missing.push("payment receipt");
    // Yes or no, every time — and a yes is only an answer with its amount.
    if (typeof data.hasBonus !== "boolean") missing.push("whether a bonus was given");
    else if (data.hasBonus && !isBonusAmount(data.bonusAmount)) missing.push("the bonus amount");
    if (missing.length) {
      throw createError(
        `A closing needs ${missing.join(", ")}. Upload the receipt, choose the language and payment method, and say whether a bonus was given, then close again.`,
        422,
      );
    }

    assertNotOverFee(totalFee, paidAmount);

    const enrollmentNumber = await nextEnrollmentNumber();

    const student = await Student.create({
      enrollmentNumber,
      name: data.name,
      phone: data.phone,
      email: data.email,
      course: data.course || undefined,
      team:   data.team   || undefined,
      assignedTo: data.assignedTo || undefined,
      leadId: data.leadId,
      initialLeadResponse:  data.initialLeadResponse  ?? null,
      primaryConcern:       data.primaryConcern        ?? null,
      followupStrategyType: data.followupStrategyType  ?? null,
      demoScheduled:    data.demoScheduled  ?? false,
      demoAttended:     data.demoAttended   ?? false,
      firstContactTime: data.firstContactTime ? new Date(data.firstContactTime) : null,
      lastFollowupDate: data.lastFollowupDate ? new Date(data.lastFollowupDate) : null,
      enrollmentDate:   enrolledOn,
      feeStatus:    this.computeFeeStatus(totalFee, paidAmount, data.feeStatus),
      totalFee,
      paidAmount,
      pendingAmount: Math.max(0, totalFee - paidAmount),
      notes: data.notes,
      language: data.language,
      paymentMethod,
      paymentReceipt: paymentReceipt
        ? { ...paymentReceipt, uploadedAt: new Date() }
        : undefined,
      ...(payments ? { payments } : {}),
      hasBonus: data.hasBonus,
      bonusAmount: data.hasBonus ? Number(data.bonusAmount) : 0,
      status: "active",
    });

    // Queued, not sent. The sale is recorded the moment this returns; the
    // invoice follows when finance is reachable. See financeHandoverWorker.
    await this.queueFinanceHandover(String(student._id), data.leadId);

    return this.populateStudent(String(student._id));
  }

  /**
   * Put this enrolment in the queue for Delta Finance.
   *
   * Deliberately swallows its own failures. The student exists by the time this
   * runs, and a salesperson should not see an error — still less lose the
   * enrolment — because a queue row could not be written or because the
   * integration is switched off. A missing row is visible on the student, which
   * shows no invoice number.
   */
  /**
   * The enrolment as finance needs to read it.
   *
   * Built from the student as it stands right now. Whether that is a snapshot
   * or the current truth depends on when it is called: at the close it is the
   * snapshot, because the queue row keeps the first one it is given; for a
   * correction after finance sent the enrolment back it is deliberately the
   * current record, because the correction is the whole point.
   *
   * Null when the student has gone.
   */
  async buildHandoverPayload(studentId: string): Promise<Record<string, unknown> | null> {
    const { Student } = await import("../models/Student.js");
    const { Course } = await import("../models/Course.js");
    const { User } = await import("../models/User.js");

    const student = await Student.findById(studentId).lean();
    if (!student) return null;

    const course = student.course ? await Course.findById(student.course).lean() : null;
    const rep = student.assignedTo ? await User.findById(student.assignedTo).select("name email").lean() : null;
    // Every LMS course it opens — the list where it was mapped as one (two for a
    // bundle), the single slug from before otherwise.
    const listed = (course?.lmsCourseSlugs ?? []).map((s) => s.trim()).filter(Boolean);
    const lms = listed.length ? listed : course?.lmsCourseSlug?.trim() ? [course.lmsCourseSlug.trim()] : [];

    return {
      externalId: String(student._id),
      source: "crm",
      // Which sales CRM sold it, shown as a tag in finance, the LMS and
      // Tetra Commission. Not the source: this CRM began as a copy of Delta's
      // and sends the same "crm", which is part of finance's idempotency key,
      // so it cannot change for enrolments already sent. Keep "remote" here
      // when code is copied across from Delta's CRM.
      crm: "remote",
      customer: {
        name: student.name,
        email: student.email ?? "",
        phone: student.phone ?? "",
      },
      course: {
        name: course?.name ?? "Course",
        ...(course?.financeItemId ? { itemId: course.financeItemId } : {}),
        // The code this course is billed under, where somebody has set one.
        ...(course?.hsnSac?.trim() ? { hsnSac: course.hsnSac.trim() } : {}),
        // Which course(s) this is in the LMS, for finance to fall back on when
        // the item it bills against has no LMS courses of its own — a bundle
        // with no product opens all of them.
        ...(lms.length ? { lmsCourseSlug: lms[0], lmsCourseSlugs: lms } : {}),
        // Minor units: finance counts in fils and paise, the CRM in whole
        // currency. Getting this wrong bills a client a hundredfold.
        amountMinor: Math.round((student.totalFee ?? 0) * 100),
      },
      ...(rep?.email ? { salespersonEmail: rep.email } : {}),
      ...(rep?.name ? { salespersonName: rep.name } : {}),
      enrolledOn: (student.enrollmentDate ?? new Date()).toISOString().slice(0, 10),
      declaredPaidMinor: Math.round((student.paidAmount ?? 0) * 100),
      // The fee less what was paid, in the same minor units as the two figures
      // it comes from, so finance sees exactly the difference of what it was
      // sent. The bonus is never in it.
      balanceMinor: Math.max(0, Math.round((student.totalFee ?? 0) * 100) - Math.round((student.paidAmount ?? 0) * 100)),
      // Whether a bonus was given at the close, for information. Not sent for
      // an enrolment from before it was asked: unknown is not "no".
      ...(typeof student.hasBonus === "boolean"
        ? {
            bonus: {
              given: student.hasBonus,
              amountMinor: student.hasBonus ? Math.round((student.bonusAmount ?? 0) * 100) : 0,
            },
          }
        : {}),
      modeOfStudy: "online" as const,
      // Taken at the close now, rather than sent empty for finance to record
      // as "Not specified" — which is what every enrolment from here used to
      // say, because this field had nothing behind it.
      language: student.language ?? "",
      ...(student.paymentMethod ? { declaredPaymentMethod: student.paymentMethod } : {}),
      // The key, not a copy. Both applications address the same bucket, so
      // finance attaches the file this already wrote rather than being sent
      // a second one that can drift from it.
      ...(student.paymentReceipt?.key
        ? {
            receipt: {
              name: student.paymentReceipt.name,
              url: student.paymentReceipt.url,
              key: student.paymentReceipt.key,
              ...(student.paymentReceipt.size ? { size: student.paymentReceipt.size } : {}),
              ...(student.paymentReceipt.mimeType ? { mimeType: student.paymentReceipt.mimeType } : {}),
            },
          }
        : {}),
      // Each payment on its own, with its own method, date and receipt — they
      // add up to declaredPaidMinor, and finance records them on approval. The
      // fields above stay for whatever reads only the total.
      ...(student.payments?.length
        ? {
            payments: student.payments.map((p) => ({
              method: p.method,
              amountMinor: Math.round(p.amount * 100),
              paidOn: new Date(p.paidAt).toISOString().slice(0, 10),
              ...(p.receipt?.key && p.receipt.url
                ? {
                    receipt: {
                      name: p.receipt.name,
                      url: p.receipt.url,
                      key: p.receipt.key,
                      ...(p.receipt.size ? { size: p.receipt.size } : {}),
                      ...(p.receipt.mimeType ? { mimeType: p.receipt.mimeType } : {}),
                    },
                  }
                : {}),
              // Paid in another currency: amountMinor above is the AED it was
              // converted to (what finance records); this is what was handed
              // over, and the rate — finance's `original`, 1 of it = rate AED.
              ...(p.currency && p.currency !== BASE_CURRENCY && p.amountInCurrency && p.exchangeRate
                ? { original: { currency: p.currency, amountMinor: Math.round(p.amountInCurrency * 100), rate: p.exchangeRate } }
                : {}),
            })),
          }
        : {}),
    };
  }

  async queueFinanceHandover(studentId: string, leadId: string): Promise<void> {
    try {
      const { financeConfigured } = await import("./financeClient.js");
      if (!financeConfigured()) return;

      const { FinanceHandover } = await import("../models/FinanceHandover.js");
      const { Student } = await import("../models/Student.js");

      const student = await Student.findById(studentId).select("_id").lean();
      if (!student) return;

      /*
       * A snapshot, not a reference.
       *
       * What is delivered is what was true when the sale happened. If somebody
       * renames the course or reprices it tomorrow, the invoice that goes out
       * should still say what the client actually agreed to. $setOnInsert below
       * is what holds that: a row that exists keeps the payload it was made with.
       */
      const payload = await this.buildHandoverPayload(studentId);
      if (!payload) return;

      await FinanceHandover.updateOne(
        { studentId: student._id },
        {
          $setOnInsert: {
            studentId: student._id,
            leadId,
            payload,
            status: "pending",
            nextAttemptAt: new Date(),
          },
        },
        { upsert: true },
      );

      // Out now, in the background; the worker's timer retries whatever this cannot send.
      const { kickFinanceHandover } = await import("./financeHandoverWorker.js");
      kickFinanceHandover();
    } catch (err) {
      console.error("[finance] could not queue the handover", err);
    }
  }

  // ── Read ─────────────────────────────────────────────────────────────────────

  async getStudents(filters: {
    search?: string;
    status?: string;
    feeStatus?: string;
    course?: string;
    team?: string;
    assignedTo?: string;
    initialLeadResponse?: string;
    primaryConcern?: string;
    followupStrategyType?: string;
    demoScheduled?: string;
    demoAttended?: string;
    enrollmentFrom?: string;
    enrollmentTo?: string;
    page?: string;
    limit?: string;
  }) {
    const page  = Math.max(1, parseInt(filters.page  ?? "1",  10));
    const limit = Math.min(100, parseInt(filters.limit ?? "20", 10));
    const skip  = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = {};

    if (filters.search) {
      const re = new RegExp(filters.search, "i");
      query.$or = [{ name: re }, { phone: re }, { email: re }, { enrollmentNumber: re }];
    }
    if (filters.status)               query.status     = filters.status;
    if (filters.feeStatus)            query.feeStatus  = filters.feeStatus;
    if (filters.course)               query.course     = filters.course;
    if (filters.team)                 query.team       = filters.team;
    if (filters.assignedTo)           query.assignedTo = filters.assignedTo;
    if (filters.initialLeadResponse)  query.initialLeadResponse  = filters.initialLeadResponse;
    if (filters.primaryConcern)       query.primaryConcern       = filters.primaryConcern;
    if (filters.followupStrategyType) query.followupStrategyType = filters.followupStrategyType;
    if (filters.demoScheduled !== undefined) query.demoScheduled = filters.demoScheduled === "true";
    if (filters.demoAttended  !== undefined) query.demoAttended  = filters.demoAttended  === "true";
    if (filters.enrollmentFrom || filters.enrollmentTo) {
      query.enrollmentDate = {};
      if (filters.enrollmentFrom) query.enrollmentDate.$gte = new Date(filters.enrollmentFrom + "T00:00:00.000Z");
      if (filters.enrollmentTo)   query.enrollmentDate.$lte = new Date(filters.enrollmentTo   + "T23:59:59.999Z");
    }

    const [students, total] = await Promise.all([
      Student.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("course",     "name amount")
        .populate("team",       "name")
        .populate("assignedTo", "name email designation")
        .populate("leadId",     "name phone status")
        .lean(),
      Student.countDocuments(query),
    ]);

    return {
      students,
      pagination: {
        total, page, limit,
        totalPages:  Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getStudentById(id: string) {
    const student = await this.populateStudent(id);
    if (!student) throw createError("Student not found", 404);
    return student;
  }

  async getStudentByLeadId(leadId: string) {
    return Student.findOne({ leadId })
      .populate("course",     "name amount")
      .populate("team",       "name")
      .populate("assignedTo", "name email designation")
      .lean();
  }

  // ── Update ───────────────────────────────────────────────────────────────────

  async updateStudent(id: string, data: Partial<IStudent & { course?: string; team?: string; assignedTo?: string }>) {
    const student = await Student.findById(id);
    if (!student) throw createError("Student not found", 404);

    const allowed: Array<keyof typeof data> = [
      "name", "phone", "email", "course", "team", "assignedTo",
      "initialLeadResponse", "primaryConcern", "followupStrategyType",
      "demoScheduled", "demoAttended", "firstContactTime", "lastFollowupDate",
      "enrollmentDate", "feeStatus", "totalFee", "paidAmount", "notes", "status",
    ];
    for (const field of allowed) {
      if (data[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (student as any)[field] = data[field];
      }
    }

    /*
     * The bonus, corrected after the close. Kept here: an enrolment already
     * with finance is not re-sent for an edit — the bonus reaches finance with
     * a correction only after finance sends the enrolment back.
     */
    if (typeof data.hasBonus === "boolean") student.hasBonus = data.hasBonus;
    if (data.bonusAmount !== undefined) student.bonusAmount = Number(data.bonusAmount);
    if (student.hasBonus === true && !isBonusAmount(student.bonusAmount)) {
      throw createError("A bonus needs an amount above zero — or choose no bonus.", 422);
    }
    if (student.hasBonus !== true) student.bonusAmount = 0;

    // Recompute pendingAmount and feeStatus if fee fields changed
    const total   = (student as unknown as Record<string, number>).totalFee   as number ?? 0;
    const paid    = (student as unknown as Record<string, number>).paidAmount  as number ?? 0;
    // Only when the money is being changed: an enrolment already over its fee
    // from before this rule can still have its notes or status edited.
    if (data.totalFee !== undefined || data.paidAmount !== undefined) assertNotOverFee(total, paid);
    student.pendingAmount = Math.max(0, total - paid);
    // An explicitly sent status is honoured, as it is on create. The figures
    // decide when nobody says otherwise — but a counsellor who marks an
    // enrolment paid against a part payment has a reason, and discarding it
    // made the dropdown on the enrolment dialog do nothing at all.
    student.feeStatus     = this.computeFeeStatus(total, paid, data.feeStatus);

    await student.save();
    return this.populateStudent(id);
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async deleteStudent(id: string) {
    const student = await Student.findByIdAndDelete(id);
    if (!student) throw createError("Student not found", 404);
    return { deleted: String(student._id) };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private computeFeeStatus(total: number, paid: number, override?: string): "paid" | "partial" | "pending" {
    if (override && ["paid", "partial", "pending"].includes(override)) return override as "paid" | "partial" | "pending";
    if (total <= 0 || paid <= 0) return "pending";
    if (paid >= total) return "paid";
    return "partial";
  }

  private populateStudent(id: string) {
    return Student.findById(id)
      .populate("course",     "name amount")
      .populate("team",       "name")
      .populate("assignedTo", "name email designation")
      .populate("leadId",     "name phone status")
      .lean();
  }

  // ── The closing book ─────────────────────────────────────────────────────────

  /**
   * Enrolments grouped by the day they were closed.
   *
   * A closing is the moment a lead becomes a student, and the question people
   * actually ask about it is "how did today go" — a number, a value, and the
   * names behind both. That was answerable only by opening the enrolment list
   * and counting, which nobody does twice.
   *
   * Bucketed in Asia/Dubai rather than UTC, which is the whole difficulty.
   * `enrollmentDate` is an instant, and the business day it belongs to is a
   * local question: a sale closed at 2am Dubai is 10pm UTC the day before, and
   * grouping on UTC would file it under yesterday and quietly take a closing
   * off the day somebody is being measured on. Mongo can bucket by timezone, so
   * it does.
   *
   * The enrolments come back inside their day rather than on request. A month
   * of closings is a few hundred rows, and the alternative is a request per day
   * for something whose whole purpose is being glanced at.
   */
  async listDailyClosings(filters: {
    dateFrom?: string;
    dateTo?: string;
    team?: string;
    user?: string;
  }) {
    const TZ = "Asia/Dubai";
    const match: Record<string, unknown> = {};

    // Inclusive at both ends, and read as local days: "to 18 Sept" means up to
    // the end of the 18th in Dubai, not up to midnight at the start of it.
    if (filters.dateFrom || filters.dateTo) {
      const range: Record<string, Date> = {};
      if (filters.dateFrom) range.$gte = new Date(`${filters.dateFrom}T00:00:00+04:00`);
      if (filters.dateTo) range.$lte = new Date(`${filters.dateTo}T23:59:59.999+04:00`);
      match.enrollmentDate = range;
    }
    if (filters.team) match.team = new Types.ObjectId(filters.team);
    if (filters.user) match.assignedTo = new Types.ObjectId(filters.user);

    const days = await Student.aggregate([
      { $match: match },
      { $sort: { enrollmentDate: -1 } },
      {
        $lookup: { from: "courses", localField: "course", foreignField: "_id", as: "courseInfo" },
      },
      { $unwind: { path: "$courseInfo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: { from: "users", localField: "assignedTo", foreignField: "_id", as: "userInfo" },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: { from: "teams", localField: "team", foreignField: "_id", as: "teamInfo" },
      },
      { $unwind: { path: "$teamInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$enrollmentDate", timezone: TZ } },
          count: { $sum: 1 },
          totalFee: { $sum: { $ifNull: ["$totalFee", 0] } },
          paidAmount: { $sum: { $ifNull: ["$paidAmount", 0] } },
          pendingAmount: { $sum: { $ifNull: ["$pendingAmount", 0] } },
          enrolments: {
            $push: {
              id: "$_id",
              name: "$name",
              phone: "$phone",
              email: "$email",
              enrollmentNumber: "$enrollmentNumber",
              enrollmentDate: "$enrollmentDate",
              courseName: { $ifNull: ["$courseInfo.name", ""] },
              closedByName: { $ifNull: ["$userInfo.name", "Unassigned"] },
              teamName: { $ifNull: ["$teamInfo.name", "Unassigned"] },
              totalFee: { $ifNull: ["$totalFee", 0] },
              paidAmount: { $ifNull: ["$paidAmount", 0] },
              pendingAmount: { $ifNull: ["$pendingAmount", 0] },
              feeStatus: "$feeStatus",
              status: "$status",
            },
          },
        },
      },
      { $sort: { _id: -1 } },
      { $project: { _id: 0, date: "$_id", count: 1, totalFee: 1, paidAmount: 1, pendingAmount: 1, enrolments: 1 } },
    ]);

    type Day = {
      date: string;
      count: number;
      totalFee: number;
      paidAmount: number;
      pendingAmount: number;
      enrolments: unknown[];
    };
    const rows = days as Day[];

    // Who closed what over the whole period, which is the second question the
    // page gets asked and is cheaper to answer here than to recompute on screen.
    const byCloser = new Map<string, { name: string; count: number; totalFee: number }>();
    for (const d of rows) {
      for (const e of d.enrolments as { closedByName: string; totalFee: number }[]) {
        const cur = byCloser.get(e.closedByName) ?? { name: e.closedByName, count: 0, totalFee: 0 };
        cur.count += 1;
        cur.totalFee += e.totalFee ?? 0;
        byCloser.set(e.closedByName, cur);
      }
    }

    const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
    const today = rows.find((d) => d.date === todayKey);

    return {
      days: rows,
      totals: {
        days: rows.length,
        count: rows.reduce((s, d) => s + d.count, 0),
        totalFee: rows.reduce((s, d) => s + d.totalFee, 0),
        paidAmount: rows.reduce((s, d) => s + d.paidAmount, 0),
        pendingAmount: rows.reduce((s, d) => s + d.pendingAmount, 0),
      },
      // Always present, so the header can say "nothing yet today" rather than
      // disappearing on a quiet morning.
      today: {
        date: todayKey,
        count: today?.count ?? 0,
        totalFee: today?.totalFee ?? 0,
      },
      leaderboard: [...byCloser.values()].sort((a, b) => b.count - a.count || b.totalFee - a.totalFee),
    };
  }

  // ── Enrolments, and what finance made of them ────────────────────────────────

  /**
   * A counsellor's own enrolments, each with the state of its invoice.
   *
   * Three things live in three places: the enrolment here, the delivery in the
   * outbox, and the approval in finance. Somebody who wants to know whether
   * their sale went through had to be given a finance login and told to go and
   * look. This joins them so the question is answered where it is asked.
   *
   * Finance is asked once for the whole page. When it cannot be reached the
   * rows still come back — without an approval state, which is the honest
   * answer rather than a wrong one.
   */
  async listEnrolments(filters: {
    mine?: string;
    userId: string;
    search?: string;
    state?: string;
    page?: string;
    limit?: string;
  }) {
    const { FinanceHandover } = await import("../models/FinanceHandover.js");
    const { fetchEnrolmentStatuses } = await import("./financeClient.js");

    const page  = Math.max(1, parseInt(filters.page ?? "1", 10));
    const limit = Math.min(100, parseInt(filters.limit ?? "20", 10));

    // "Your enrolments" by default. Somebody looking at the whole book asks for
    // it explicitly, and still only sees what students:view already allows.
    const query: Record<string, unknown> = {};
    if (filters.mine !== "false") query.assignedTo = filters.userId;

    /*
     * Narrowed to what finance sent back, when that is what was asked for.
     *
     * Answerable here only because the outcome is now written down as the
     * outbox learns it. Filtering on what finance says live would mean asking
     * finance about every enrolment ever closed in order to show one page of
     * the few it sent back — the query would grow with the book and the answer
     * would not.
     */
    if (filters.state === "returned") {
      const sentBack = await FinanceHandover.find({ approvalState: "returned" })
        .select("studentId")
        .lean();
      query._id = { $in: sentBack.map((h) => h.studentId) };
    }

    if (filters.search?.trim()) {
      const rx = new RegExp(filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ name: rx }, { email: rx }, { phone: rx }, { enrollmentNumber: rx }];
    }

    const [students, total] = await Promise.all([
      Student.find(query)
        .sort({ enrollmentDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("course", "name amount")
        .populate("assignedTo", "name email")
        .populate("leadId", "name phone status")
        .lean(),
      Student.countDocuments(query),
    ]);

    const ids = students.map((s) => String(s._id));
    const handovers = await FinanceHandover.find({ studentId: { $in: ids } })
      .select("studentId status attempts lastError invoiceId invoiceNumber flags sentAt approvalState returnedReason returnedAt approvedAt")
      .lean();
    const byStudent = new Map(handovers.map((h) => [String(h.studentId), h]));

    const { stepsOf } = await import("./enrolmentSteps.js");
    const statuses = await fetchEnrolmentStatuses(ids);
    const byExternal = new Map(statuses.map((s) => [s.externalId, s]));

    const rows = students.map((s) => {
      const h = byStudent.get(String(s._id));
      const f = byExternal.get(String(s._id));
      return {
        ...s,
        handover: h
          ? {
              status: h.status,
              attempts: h.attempts,
              lastError: h.lastError ?? "",
              invoiceId: h.invoiceId ?? "",
              invoiceNumber: h.invoiceNumber ?? "",
              flags: h.flags ?? [],
              sentAt: h.sentAt ?? null,
              // What the outbox last heard, as opposed to `invoice` below,
              // which is finance answering right now and may be absent.
              approvalState: h.approvalState ?? "unknown",
              returnedReason: h.returnedReason ?? "",
              returnedAt: h.returnedAt ?? null,
            }
          : null,
        // Absent rather than guessed when finance could not be reached.
        invoice: f ?? null,
        // Its five steps — finance, LMS, CS, onboarded, MT5 bonus — green / yellow / red on the card.
        steps: stepsOf(f ?? null, h ? { status: h.status, lastError: h.lastError, approvedAt: h.approvedAt } : null),
      };
    });

    /*
     * The counts are of this page's rows, not of the whole book.
     *
     * Counting every enrolment would mean asking finance about every one of
     * them on every request. The bar says what it is counting.
     */
    const counts = {
      total,
      onThisPage: rows.length,
      approved: rows.filter((r) => r.invoice?.approval === "approved").length,
      pending: rows.filter((r) => r.invoice?.approval === "pending").length,
      returned: rows.filter((r) => (r.invoice?.approval ?? r.handover?.approvalState) === "returned").length,
      notInvoiced: rows.filter((r) => !r.invoice).length,
      failed: rows.filter((r) => r.handover?.status === "failed").length,
      flagged: rows.filter((r) => (r.handover?.flags?.length ?? 0) > 0).length,
    };

    return { rows, counts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /**
   * One enrolment, for its own page: the student, what finance and the outbox
   * know of it, its five steps with who did each and when, and its commission
   * as the viewer may see it — their own lines; everyone's for a Super Admin
   * or the Sales Manager.
   *
   * The closer sees their own; anyone who may view students sees any.
   */
  async getEnrolment(id: string, viewer: { userId: string; role?: { isSystemRole?: boolean; roleName?: string; permissions?: Record<string, { view?: boolean } | undefined> } }) {
    const { FinanceHandover } = await import("../models/FinanceHandover.js");
    const { CommissionSale } = await import("../models/CommissionSale.js");
    const { fetchEnrolmentStatuses } = await import("./financeClient.js");
    const { stepsOf } = await import("./enrolmentSteps.js");
    const { isSuperAdmin, loadConfig } = await import("./commissionService.js");

    if (!Types.ObjectId.isValid(id)) throw createError("Enrolment not found", 404);
    const student = await Student.findById(id)
      .populate("course", "name amount")
      .populate("assignedTo", "name email")
      .populate("team", "name")
      .lean();
    if (!student) throw createError("Enrolment not found", 404);
    const closer = student.assignedTo && typeof student.assignedTo === "object" && "_id" in student.assignedTo
      ? String((student.assignedTo as { _id: unknown })._id)
      : String(student.assignedTo ?? "");
    const all = isSuperAdmin(viewer.role as never) || viewer.role?.permissions?.students?.view === true;
    if (closer !== viewer.userId && !all) throw createError("This enrolment isn't yours", 403);

    const h = await FinanceHandover.findOne({ studentId: student._id })
      .select("status attempts lastError invoiceId invoiceNumber flags sentAt approvalState returnedReason returnedAt approvedAt")
      .lean();
    const [st] = await fetchEnrolmentStatuses([id]);
    const sale = await CommissionSale.findOne({ student: student._id }).lean();
    const config = sale ? await loadConfig() : null;
    const everything = isSuperAdmin(viewer.role as never) || (config?.salesManager ? String(config.salesManager) === viewer.userId : false);

    return {
      ...student,
      handover: h
        ? {
            status: h.status, attempts: h.attempts, lastError: h.lastError ?? "", invoiceId: h.invoiceId ?? "",
            invoiceNumber: h.invoiceNumber ?? "", flags: h.flags ?? [], sentAt: h.sentAt ?? null,
            approvalState: h.approvalState ?? "unknown", returnedReason: h.returnedReason ?? "", returnedAt: h.returnedAt ?? null,
            approvedAt: h.approvedAt ?? null,
          }
        : null,
      invoice: st ?? null,
      steps: stepsOf(st ?? null, h ? { status: h.status, lastError: h.lastError, approvedAt: h.approvedAt } : null),
      commission: sale
        ? {
            state: sale.state,
            reason: sale.reason,
            month: sale.month,
            countedAt: sale.countedAt ?? null,
            lines: (sale.lines ?? [])
              .filter((l) => everything || String(l.user) === viewer.userId)
              .map((l) => ({ role: l.role, userName: l.userName, amount: l.amount, note: l.note ?? "" })),
          }
        : null,
    };
  }

  /**
   * Send this enrolment to finance, or send it again.
   *
   * The queue row is upserted with $setOnInsert, so a row that already exists
   * keeps the payload it was created with — the snapshot of the sale. This
   * resets the schedule instead, which is what "try again now" means for one
   * that failed or is waiting on a backoff.
   */
  async requestInvoice(studentId: string): Promise<{ queued: boolean; message: string }> {
    const { FinanceHandover } = await import("../models/FinanceHandover.js");
    const { financeConfigured } = await import("./financeClient.js");

    if (!financeConfigured()) {
      return { queued: false, message: "The finance integration is not configured" };
    }

    const student = await Student.findById(studentId).lean();
    if (!student) return { queued: false, message: "Enrolment not found" };

    const existing = await FinanceHandover.findOne({ studentId }).lean();

    /*
     * Delivered once is usually the end of it — except when finance sent it
     * back.
     *
     * Then the counsellor has corrected something and this is the correction on
     * its way. It goes with a *fresh* payload, which is the whole point: the
     * queue row holds a snapshot of the sale as it was, and resending that
     * would deliver the very figures somebody has just been asked to fix. The
     * snapshot is right for a retry after a timeout and wrong for a
     * resubmission, and the two arrive at this function looking identical.
     *
     * Finance recognises the same externalId on a returned invoice and updates
     * it rather than raising a second one, so this corrects the invoice the
     * approver already has, keeping its number.
     */
    if (existing?.status === "sent" && existing.approvalState !== "returned") {
      return { queued: false, message: `Already invoiced as ${existing.invoiceNumber ?? "an invoice"}` };
    }

    if (existing?.status === "sent" && existing.approvalState === "returned") {
      const payload = await this.buildHandoverPayload(studentId);
      if (!payload) return { queued: false, message: "Enrolment not found" };
      await FinanceHandover.updateOne(
        { studentId },
        {
          $set: {
            payload,
            status: "pending",
            nextAttemptAt: new Date(),
            attempts: 0,
            lastError: "",
            // Pending again the moment it leaves, so the screen stops offering
            // "send again" for something already on its way back.
            approvalState: "pending",
            returnedReason: "",
          },
          // Cleared, so a second send-back is told about a second time.
          $unset: { returnedNotifiedAt: "", returnedAt: "" },
        },
      );
      return { queued: true, message: "Correction sent to finance" };
    }

    if (existing) {
      await FinanceHandover.updateOne(
        { studentId },
        { $set: { status: "pending", nextAttemptAt: new Date(), lastError: "" } },
      );
      return { queued: true, message: "Sending to finance again" };
    }

    await this.queueFinanceHandover(String(student._id), String(student.leadId ?? ""));
    return { queued: true, message: "Queued for finance" };
  }

}
