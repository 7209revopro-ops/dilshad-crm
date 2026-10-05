"use client";

import type { Dispatch, SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Paperclip, Plus, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { listItemVariants } from "@/lib/animations";
import { fmtFull } from "@/lib/currency";
import { CURRENCIES } from "@/lib/store/currencyStore";
import { uploadReceipt } from "@/hooks/useStudents";
import { BASE_CURRENCY, ENROLMENT_PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type StoredReceipt } from "@/types/student";

/*
 * The payments taken at a close, one row each (the user, 2026-10-05): a client
 * may pay part in cash and part by card, and each payment has its own method,
 * amount and receipt. The money already on the lead before the close is a row
 * of its own — its amount fixed, its method and receipt still asked, since
 * finance records every payment against the invoice with its proof.
 *
 * Each payment is in AED unless the client paid in another currency (the owner,
 * 2026-10-05): then the amount is typed in that currency with the rate — 1 of
 * it = so many AED — and the AED figure is worked out, or typed and the rate
 * worked out from it. The AED figure is what the payment counts as.
 */

export interface PaymentRow {
  id: string;
  method: string;
  /** In `currency`. */
  amountInput: string;
  receipt: StoredReceipt | null;
  /** What it was paid in — AED unless the client paid in another currency. */
  currency: string;
  /** Another currency: 1 of it = this many AED. */
  rateInput: string;
  /** Another currency: what it comes to in AED. */
  convertedInput: string;
  /** The money already on the lead before the close, as one payment. */
  collectedBefore?: boolean;
  /** Already added to the lead's payments, by an attempt that then failed — not added twice. */
  addedToLead?: boolean;
  uploading?: boolean;
  uploadError?: string;
}

export const MAX_PAYMENTS = 10;

/** AED first, then the app's other currencies. */
const PAYMENT_CURRENCIES = [BASE_CURRENCY, ...CURRENCIES.map((c) => c.code).filter((c) => c !== BASE_CURRENCY)];
const currencyLabel = (code: string) => CURRENCIES.find((c) => c.code === code)?.label ?? code;

let rowSeq = 0;
export const newPaymentRow = (over: Partial<PaymentRow> = {}): PaymentRow => ({
  id: `payment-${++rowSeq}`,
  method: "",
  amountInput: "",
  receipt: null,
  currency: BASE_CURRENCY,
  rateInput: "",
  convertedInput: "",
  ...over,
});

/** Paid in another currency than AED (the money already on the lead never is). */
export const isForeign = (r: PaymentRow) => !r.collectedBefore && r.currency !== BASE_CURRENCY;

const num = (s: string) => Math.max(0, Number(s) || 0);
/** Whole fils, as a plain number string. */
const toAedInput = (n: number) => String(Math.round(n * 100) / 100);
/** A rate worked out from two amounts, to ten significant figures. */
const toRateInput = (n: number) => String(Number(n.toPrecision(10)));

/** What the payment counts as, in AED — the converted figure when it was paid in another currency. */
export const rowAmount = (r: PaymentRow) => (isForeign(r) ? num(r.convertedInput) : num(r.amountInput));

/** For the close: what was handed over in another currency, and its rate — nothing for AED. */
export function rowForeignFields(r: PaymentRow): { currency?: string; amountInCurrency?: number; exchangeRate?: number } {
  if (!isForeign(r)) return {};
  return { currency: r.currency, amountInCurrency: num(r.amountInput), exchangeRate: num(r.rateInput) };
}

/** "INR 50,000 at 1 INR = 0.044 AED" — for the lead's payment note. Empty for AED. */
export function describeForeign(r: PaymentRow): string {
  if (!isForeign(r)) return "";
  const paid = num(r.amountInput).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const rate = Number(num(r.rateInput).toPrecision(6)).toLocaleString("en-US", { maximumFractionDigits: 10 });
  return `${r.currency} ${paid} at 1 ${r.currency} = ${rate} ${BASE_CURRENCY}`;
}

/** What each payment still needs, the way the close's "Still needed" line says it. */
export function missingInRows(rows: PaymentRow[]): string[] {
  const one = rows.length === 1;
  return rows.flatMap((r, i) => {
    const whose = `payment ${i + 1}'s`;
    return [
      !r.method && (one ? "payment method" : `${whose} method`),
      !r.collectedBefore && !(num(r.amountInput) > 0) && (one ? "the amount paid" : `${whose} amount`),
      isForeign(r) && num(r.amountInput) > 0 && !(num(r.rateInput) > 0 && num(r.convertedInput) > 0) &&
        (one ? `the ${r.currency} rate` : `${whose} ${r.currency} rate`),
      !r.receipt && (one ? "payment receipt" : `${whose} receipt`),
    ].filter(Boolean) as string[];
  });
}

interface PaymentRowsEditorProps {
  leadId: string;
  rows: PaymentRow[];
  onChange: Dispatch<SetStateAction<PaymentRow[]>>;
}

export function PaymentRowsEditor({ leadId, rows, onChange }: PaymentRowsEditorProps) {
  const update = (id: string, patch: Partial<PaymentRow>) =>
    onChange((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Another currency: the rate and the AED figure follow each other — whichever
  // was typed last works out the other; a new amount keeps the rate.
  function setAmount(r: PaymentRow, amountInput: string) {
    const paid = num(amountInput);
    if (!isForeign(r)) return update(r.id, { amountInput });
    if (num(r.rateInput) > 0) return update(r.id, { amountInput, convertedInput: paid > 0 ? toAedInput(paid * num(r.rateInput)) : "" });
    if (num(r.convertedInput) > 0 && paid > 0) return update(r.id, { amountInput, rateInput: toRateInput(num(r.convertedInput) / paid) });
    update(r.id, { amountInput });
  }
  function setRate(r: PaymentRow, rateInput: string) {
    const paid = num(r.amountInput);
    const rate = num(rateInput);
    update(r.id, { rateInput, convertedInput: paid > 0 && rate > 0 ? toAedInput(paid * rate) : "" });
  }
  function setConverted(r: PaymentRow, convertedInput: string) {
    const paid = num(r.amountInput);
    const aed = num(convertedInput);
    update(r.id, { convertedInput, rateInput: paid > 0 && aed > 0 ? toRateInput(aed / paid) : "" });
  }
  // A new currency starts its rate afresh: no feed is trusted for it, the seller enters it.
  const setCurrency = (r: PaymentRow, currency: string) => update(r.id, { currency, rateInput: "", convertedInput: "" });

  async function attach(id: string, file: File) {
    update(id, { uploading: true, uploadError: "" });
    try {
      const receipt = await uploadReceipt(leadId, file);
      update(id, { receipt, uploading: false });
    } catch (e) {
      update(id, { uploading: false, uploadError: e instanceof Error ? e.message : "Could not upload that file" });
    }
  }

  const removable = rows.filter((r) => !r.collectedBefore).length > 1 || rows.some((r) => r.collectedBefore);

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {rows.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-1.5 rounded-lg border border-border/50 bg-muted/20 p-2"
          >
            <div className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-[10px] font-semibold text-muted-foreground">{i + 1}.</span>
              <Select value={r.method} onValueChange={(v) => update(r.id, { method: v })}>
                <SelectTrigger className="h-8 w-[130px] shrink-0 text-xs" aria-label={`Payment ${i + 1} method`}>
                  <SelectValue placeholder="Paid by…" />
                </SelectTrigger>
                <SelectContent>
                  {ENROLMENT_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {r.collectedBefore ? (
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-foreground">{fmtFull(rowAmount(r))}</span>
                  <span className="ml-1.5 text-[10px] text-muted-foreground">already on the lead</span>
                </div>
              ) : (
                <>
                  <Select value={r.currency} onValueChange={(v) => setCurrency(r, v)}>
                    <SelectTrigger className="h-8 w-[76px] shrink-0 text-xs" aria-label={`Payment ${i + 1} currency`}>
                      <SelectValue>{r.currency}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c} className="text-xs">{currencyLabel(c)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" min="0" step="0.01" value={r.amountInput}
                    onChange={(e) => setAmount(r, e.target.value)}
                    placeholder={isForeign(r) ? `Amount in ${r.currency}` : "Amount"} className="h-8 min-w-0 flex-1 text-xs"
                    aria-label={`Payment ${i + 1} amount${isForeign(r) ? ` in ${r.currency}` : ""}`}
                  />
                </>
              )}
              {!r.collectedBefore && removable && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onChange((prev) => prev.filter((x) => x.id !== r.id))}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-red-400"
                  aria-label={`Remove payment ${i + 1}`}
                >
                  <X className="h-3.5 w-3.5" />
                </motion.button>
              )}
            </div>
            {/* Paid in another currency: the rate, and what it comes to in AED — the figure that counts. */}
            <AnimatePresence initial={false}>
              {isForeign(r) && (
                <motion.div
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  className="flex flex-wrap items-center gap-1.5 pl-7 text-[11px] text-muted-foreground"
                >
                  <span>1 {r.currency} =</span>
                  <Input
                    type="number" min="0" step="any" value={r.rateInput}
                    onChange={(e) => setRate(r, e.target.value)}
                    placeholder="rate" className="h-7 w-24 text-xs"
                    aria-label={`Payment ${i + 1}: 1 ${r.currency} in ${BASE_CURRENCY}`}
                  />
                  <span>{BASE_CURRENCY} →</span>
                  <Input
                    type="number" min="0" step="0.01" value={r.convertedInput}
                    onChange={(e) => setConverted(r, e.target.value)}
                    placeholder={`in ${BASE_CURRENCY}`} className="h-7 w-28 text-xs"
                    aria-label={`Payment ${i + 1} in ${BASE_CURRENCY}`}
                  />
                  <span>{BASE_CURRENCY}</span>
                </motion.div>
              )}
            </AnimatePresence>
            {r.receipt ? (
              <div className="flex items-center gap-2 rounded-md border border-border/50 bg-card px-2.5 py-1.5">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <a href={r.receipt.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-xs hover:underline">
                  {r.receipt.name}
                </a>
                <button
                  type="button"
                  onClick={() => update(r.id, { receipt: null })}
                  className="text-[10px] text-muted-foreground hover:text-red-400"
                >
                  Replace
                </button>
              </div>
            ) : (
              <label
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  r.uploading && "pointer-events-none opacity-60",
                )}
              >
                <Upload className="h-3.5 w-3.5" />
                {r.uploading ? "Uploading…" : "Attach this payment's receipt — photo or PDF"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void attach(r.id, f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            {r.uploadError && <p className="text-[10px] text-red-400">{r.uploadError}</p>}
          </motion.div>
        ))}
      </AnimatePresence>
      {rows.length < MAX_PAYMENTS && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => onChange((prev) => [...prev, newPaymentRow()])}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Add another payment
        </motion.button>
      )}
    </div>
  );
}
