"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, X, User2, Phone, Mail, BookOpen,
  Calendar, DollarSign, StickyNote, CheckCircle2, Paperclip, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fmtFull } from "@/lib/currency";
import { useCreateStudent, useUpdateStudent, uploadReceipt } from "@/hooks/useStudents";
import { useAllCourses } from "@/hooks/useCourses";
import { useAddPayment } from "@/hooks/usePayments";
import type { Lead } from "@/types/lead";
import type { Course } from "@/types/course";
import type { FeeStatus, Student, StoredReceipt } from "@/types/student";
import {
  ENROLMENT_LANGUAGES,
  ENROLMENT_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/types/student";

interface Props {
  open: boolean;
  lead: Lead;
  /**
   * The enrolment this lead already has, when it has one.
   *
   * Closing a lead that was closed before is not a mistake — somebody moved it
   * to follow-up and back, and wants to see the enrolment again. This used to
   * skip the dialog entirely and update the status behind their back, so the
   * second close looked like nothing happened at all.
   */
  existingStudent?: Student | null;
  /** Dismissing still closes the lead: the status was already chosen. */
  onClose: () => void;
  onCreated: () => void;
}

export function CreateStudentModal({ open, lead, existingStudent, onClose, onCreated }: Props) {
  const editing = Boolean(existingStudent);

  /** The course the lead already carries, if it was picked during the sale. */
  const leadCourse = lead.course && typeof lead.course === "object" ? lead.course as Course : null;
  const studentCourse =
    existingStudent?.course && typeof existingStudent.course === "object"
      ? existingStudent.course as Course
      : null;
  const knownCourse = studentCourse ?? leadCourse;

  // Only fetched when there is nothing to show, which is the only time it is
  // needed — a lead that already names its course does not need the list.
  const { data: courses = [], isLoading: coursesLoading } = useAllCourses();

  const [courseId, setCourseId] = useState(knownCourse?._id ?? "");
  const pickedCourse = knownCourse ?? courses.find((c) => c._id === courseId) ?? null;

  /*
   * The fee follows the course, and can be argued with.
   *
   * Seeded from what the enrolment already stores, or the course's price when
   * it stores nothing — an enrolment created before a course was picked has a
   * fee of zero, and showing that beside a course priced at 5,200 makes every
   * figure under it wrong. Editable because the price on the brochure is not
   * always the price that was agreed.
   */
  const [feeInput, setFeeInput] = useState(
    String(existingStudent?.totalFee || knownCourse?.amount || ""),
  );
  const totalFee = Number(feeInput) || 0;

  /** What was collected before today, from the payments already on the lead. */
  const alreadyPaid = (lead.payments ?? []).reduce((s, p) => s + p.amount, 0);
  const [paidNowInput, setPaidNowInput] = useState("");
  const paidNow = Math.max(0, Number(paidNowInput) || 0);
  const paidAmount = alreadyPaid + paidNow;
  const pending = Math.max(0, totalFee - paidAmount);

  const computedFeeStatus: FeeStatus =
    totalFee <= 0 || paidAmount <= 0 ? "pending"
    : paidAmount >= totalFee         ? "paid"
    :                                  "partial";

  const [notes, setNotes] = useState(existingStudent?.notes ?? "");
  const [enrollmentDate, setEnrollmentDate] = useState(
    (existingStudent?.enrollmentDate ?? new Date().toISOString()).slice(0, 10),
  );
  const [feeStatus, setFeeStatus] = useState<FeeStatus>(existingStudent?.feeStatus ?? computedFeeStatus);
  const [feeStatusTouched, setFeeStatusTouched] = useState(false);
  // Follows the numbers until somebody sets it by hand, then stays put.
  const effectiveFeeStatus = feeStatusTouched ? feeStatus : computedFeeStatus;

  const createMut = useCreateStudent();
  const updateMut = useUpdateStudent();
  const addPayment = useAddPayment(lead._id);
  const saving = createMut.isPending || updateMut.isPending || addPayment.isPending;

  // An enrolment with no course bills nothing. Where the lead never named one
  // it has to be chosen here, rather than quietly producing a zero invoice.
  const courseMissing = !pickedCourse;

  /*
   * Three things a close cannot be made without.
   *
   * They exist because finance needs them and had nothing behind them: every
   * enrolment handed over from here recorded its language as "Not specified",
   * and none carried how the money was taken or any proof that it had been.
   * An approver was deciding on an invoice with none of that in front of them.
   *
   * Only for a new close. Editing an enrolment made before these existed must
   * not be blocked on filling in what nobody was asked for at the time.
   */
  const [language, setLanguage] = useState<string>(existingStudent?.language ?? "");
  const [paymentMethod, setPaymentMethod] = useState<string>(existingStudent?.paymentMethod ?? "");
  const [receipt, setReceipt] = useState<StoredReceipt | null>(
    (existingStudent?.paymentReceipt as StoredReceipt | undefined) ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const missing = editing
    ? []
    : [
        !language && "language",
        !paymentMethod && "payment method",
        !receipt && "payment receipt",
      ].filter(Boolean) as string[];

  async function handleReceipt(file: File) {
    setUploadError("");
    setUploading(true);
    try {
      setReceipt(await uploadReceipt(lead._id, file));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Could not upload that file");
    } finally {
      setUploading(false);
    }
  }

  function toIST(iso?: string | null) {
    if (!iso) return null;
    return new Date(iso).toLocaleString("en-AE", {
      timeZone: "Asia/Dubai", day: "2-digit", month: "short",
      year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
    }) + " GST";
  }

  async function handleCreate() {
    /*
     * The money is recorded on the lead, not just on the enrolment.
     *
     * The lead's payment list is where the CRM already counts what a client
     * has handed over, and it is what the fee summary above reads. Writing the
     * figure only onto the student would leave two records of the same money
     * that drift apart the moment anybody adds a payment the ordinary way.
     *
     * Done before the enrolment is saved: a payment that failed to record is
     * worth stopping for, whereas one recorded against an enrolment that then
     * failed can be finished by hand.
     */
    if (paidNow > 0) {
      await addPayment.mutateAsync({
        amount: paidNow,
        note: `Collected at enrolment${pickedCourse ? ` — ${pickedCourse.name}` : ""}`,
        paidAt: new Date(enrollmentDate).toISOString(),
      });
    }

    if (editing && existingStudent) {
      // The enrolment exists; this is the second visit to it. Only the fields
      // this dialog actually owns are sent, so nothing recorded elsewhere is
      // overwritten by a stale copy of the lead.
      await updateMut.mutateAsync({
        id: existingStudent._id,
        data: {
          course: pickedCourse?._id ?? null,
          enrollmentDate: new Date(enrollmentDate).toISOString(),
          feeStatus: effectiveFeeStatus,
          totalFee,
          paidAmount,
          notes: notes || undefined,
        },
      });
      onCreated();
      return;
    }

    await createMut.mutateAsync({
      leadId: lead._id,
      name:   lead.name,
      phone:  lead.phone ?? undefined,
      email:  lead.email ?? undefined,
      course: pickedCourse?._id ?? null,
      team:   lead.team
        ? typeof lead.team === "object" ? (lead.team as { _id: string })._id : lead.team
        : null,
      assignedTo: lead.assignedTo
        ? typeof lead.assignedTo === "object" ? (lead.assignedTo as { _id: string })._id : lead.assignedTo
        : null,
      initialLeadResponse:  lead.initialLeadResponse  ?? null,
      primaryConcern:       lead.primaryConcern        ?? null,
      followupStrategyType: lead.followupStrategyType  ?? null,
      demoScheduled:    lead.demoScheduled  ?? false,
      demoAttended:     lead.demoAttended   ?? false,
      firstContactTime: lead.firstContactTime  ?? null,
      lastFollowupDate: lead.lastFollowupDate  ?? null,
      enrollmentDate: new Date(enrollmentDate).toISOString(),
      feeStatus: effectiveFeeStatus,
      totalFee,
      paidAmount,
      notes: notes || undefined,
      language,
      paymentMethod,
      paymentReceipt: receipt,
    });
    onCreated();
  }

  const assignedName = lead.assignedTo
    ? typeof lead.assignedTo === "object"
      ? (lead.assignedTo as { name: string }).name
      : lead.assignedTo
    : null;

  return (
    <AnimatePresence>
      {open && (
        <Dialog open={open} onOpenChange={onClose}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/50 bg-card px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <GraduationCap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogHeader>
                    <DialogTitle className="text-base font-bold">{editing ? "Enrolment" : "Create Student Profile"}</DialogTitle>
                  </DialogHeader>
                  <p className="text-xs text-muted-foreground">
                    {lead.name} · {editing ? `Enrolled ${existingStudent?.enrollmentNumber ?? ""}`.trim() : "Lead closed"}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </motion.div>

            <div className="px-5 py-4 space-y-5">
              {/* Personal details strip */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Personal Details</p>
                <div className="rounded-xl border border-border/50 bg-muted/20 divide-y divide-border/30">
                  {[
                    { icon: User2, label: "Name",    value: lead.name },
                    { icon: Phone, label: "Phone",   value: lead.phone },
                    { icon: Mail,  label: "Email",   value: lead.email },
                    { icon: BookOpen, label: "Course", value: knownCourse ? `${knownCourse.name}${knownCourse.amount ? ` · ${fmtFull(knownCourse.amount)}` : ""}` : null },
                    { icon: User2, label: "Counsellor", value: assignedName },
                  ].filter((r) => r.value).map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3 px-3 py-2.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground w-20 shrink-0">{label}</span>
                      <span className="text-xs font-medium text-foreground truncate">{value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Lead insight badges */}
              {(lead.initialLeadResponse || lead.primaryConcern || lead.followupStrategyType ||
                lead.demoScheduled || lead.firstContactTime || lead.lastFollowupDate) && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Lead Insights</p>
                  <div className="flex flex-wrap gap-2 rounded-xl border border-border/50 bg-muted/20 p-3">
                    {lead.initialLeadResponse && (
                      <span className="inline-flex items-center rounded-full bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 text-[10px] font-medium text-violet-400">
                        {lead.initialLeadResponse.replace(/_/g, " ")}
                      </span>
                    )}
                    {lead.primaryConcern && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[10px] font-medium text-amber-400">
                        Concern: {lead.primaryConcern.replace(/_/g, " ")}
                      </span>
                    )}
                    {lead.followupStrategyType && (
                      <span className="inline-flex items-center rounded-full bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 text-[10px] font-medium text-sky-400">
                        {lead.followupStrategyType.replace(/_/g, " ")}
                      </span>
                    )}
                    {lead.demoScheduled && (
                      <span className="inline-flex items-center rounded-full bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 text-[10px] font-medium text-violet-400">
                        Demo {lead.demoAttended ? "Attended" : "Scheduled"}
                      </span>
                    )}
                    {lead.firstContactTime && (
                      <span className="text-[10px] text-muted-foreground">1st contact: {toIST(lead.firstContactTime)}</span>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Fee section */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Fee Summary</p>
                <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-card p-2 border border-border/30">
                      <p className="text-sm font-bold text-foreground">{fmtFull(totalFee)}</p>
                      <p className="text-[10px] text-muted-foreground">Total Fee</p>
                    </div>
                    <div className="rounded-lg bg-card p-2 border border-border/30">
                      <p className="text-sm font-bold text-green-400">{fmtFull(paidAmount)}</p>
                      <p className="text-[10px] text-muted-foreground">Paid</p>
                    </div>
                    <div className="rounded-lg bg-card p-2 border border-border/30">
                      <p className={cn("text-sm font-bold", pending > 0 ? "text-amber-400" : "text-green-400")}>{fmtFull(pending)}</p>
                      <p className="text-[10px] text-muted-foreground">Pending</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Total fee</p>
                      <Input
                        type="number" min="0" step="0.01" value={feeInput}
                        onChange={(e) => setFeeInput(e.target.value)}
                        placeholder="0" className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">
                        Collected now{alreadyPaid > 0 ? ` · ${fmtFull(alreadyPaid)} already` : ""}
                      </p>
                      <Input
                        type="number" min="0" step="0.01" value={paidNowInput}
                        onChange={(e) => setPaidNowInput(e.target.value)}
                        placeholder="0" className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  {/* What is typed here becomes a payment on the lead, so the
                      money is recorded in one place rather than two that can
                      disagree. */}
                  {paidNow > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      {fmtFull(paidNow)} will be added to this lead&apos;s payments.
                    </p>
                  )}
                  {totalFee > 0 && (
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-green-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (paidAmount / totalFee) * 100)}%` }}
                        transition={{ delay: 0.3, duration: 0.6 }}
                      />
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Editable fields */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Enrollment</p>

                {/* Only when the lead never named a course. One that did shows
                    it in the details strip above; asking again there would be
                    two answers to the same question. */}
                {!knownCourse && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <BookOpen className="h-3 w-3" /> Course
                    </p>
                    <Select
                      value={courseId}
                      onValueChange={(v) => {
                        setCourseId(v);
                        // The fee follows the course that was just chosen,
                        // rather than leaving the old number under a new name.
                        const c = courses.find((x) => x._id === v);
                        if (c?.amount) setFeeInput(String(c.amount));
                      }}
                      disabled={coursesLoading}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={coursesLoading ? "Loading courses…" : "Select a course"} />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((c) => (
                          <SelectItem key={c._id} value={c._id} className="text-xs">
                            {c.name}{c.amount ? ` · ${fmtFull(c.amount)}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {courseMissing && !coursesLoading && (
                      <p className="text-[10px] text-amber-400">
                        This lead has no course. Pick one — the fee and the invoice come from it.
                      </p>
                    )}
                  </div>
                )}

                {/* What finance is given about the sale. Side by side because
                    they are two halves of one question: what was sold, and how
                    it was paid for. */}
                {!editing && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Language *</p>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Taught in…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ENROLMENT_LANGUAGES.map((l) => (
                            <SelectItem key={l} value={l} className="text-xs">{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Payment method *</p>
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Paid by…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ENROLMENT_PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m} value={m} className="text-xs">
                              {PAYMENT_METHOD_LABELS[m]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {!editing && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Payment receipt *</p>
                    {receipt ? (
                      <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <a
                          href={receipt.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 truncate text-xs hover:underline"
                        >
                          {receipt.name}
                        </a>
                        <button
                          type="button"
                          onClick={() => setReceipt(null)}
                          className="text-[10px] text-muted-foreground hover:text-red-400"
                        >
                          Replace
                        </button>
                      </div>
                    ) : (
                      <label
                        className={cn(
                          "flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-3 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground",
                          uploading && "pointer-events-none opacity-60",
                        )}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {uploading ? "Uploading…" : "Attach the receipt — photo or PDF"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleReceipt(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                    {uploadError && <p className="text-[10px] text-red-400">{uploadError}</p>}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Enrollment Date
                    </p>
                    <Input
                      type="date"
                      value={enrollmentDate}
                      onChange={(e) => setEnrollmentDate(e.target.value)}
                      className="h-8 text-xs [color-scheme:dark]"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Fee Status
                    </p>
                    <Select value={effectiveFeeStatus} onValueChange={(v) => { setFeeStatus(v as FeeStatus); setFeeStatusTouched(true); }}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid"    className="text-xs"><span className="text-green-400">Paid</span></SelectItem>
                        <SelectItem value="partial" className="text-xs"><span className="text-amber-400">Partial</span></SelectItem>
                        <SelectItem value="pending" className="text-xs"><span className="text-muted-foreground">Pending</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <StickyNote className="h-3 w-3" /> Notes (optional)
                  </p>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional notes about the student…"
                    className="resize-none text-xs min-h-[64px]"
                    rows={2}
                  />
                </div>
              </motion.div>
            </div>

            {/* Footer */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/50 bg-card px-5 py-3"
            >
              {/* Named rather than left to a greyed-out button: a control that
                  will not respond and does not say why is the worst of both. */}
              <span className="text-[11px] text-muted-foreground">
                {missing.length
                  ? `Still needed: ${missing.join(", ")}.`
                  : editing
                    ? "Changes apply to this enrolment."
                    : "The lead is closed either way."}
              </span>
              <Button
                size="sm"
                className="gap-2"
                onClick={handleCreate}
                disabled={saving || courseMissing || missing.length > 0 || uploading}
              >
                {saving ? (
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> {editing ? "Saving…" : "Creating…"}</span>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" /> {editing ? "Save enrolment" : "Create Student"}</>
                )}
              </Button>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
