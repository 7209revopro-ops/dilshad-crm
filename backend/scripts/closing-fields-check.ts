/**
 * Checks that a close cannot be made without what finance needs from it.
 *
 * Language, how the money was taken and proof that it was. The first was sent
 * as an empty string on every enrolment this system ever handed over — finance
 * recorded them all as "Not specified" — and the other two did not exist at
 * all, so an approver decided on invoices with none of it in front of them.
 *
 * Required at the close rather than on the model: enrolments predating these
 * fields have to keep loading, and the only moment anybody can answer is the
 * moment of closing. That split is what this checks — old records readable,
 * new ones impossible without all three.
 *
 * Scratch database only.
 */
import mongoose, { Types } from "mongoose";

const uri = process.env.MONGODB_URI ?? "";
if (!/127\.0\.0\.1|localhost/.test(uri) || !/e2e|test|scratch/i.test(uri)) {
  console.error(`Refusing to run: MONGODB_URI must be a scratch database, got "${uri}"`);
  process.exit(1);
}

let failures = 0, checks = 0;
function check(label: string, ok: boolean, detail = "") {
  checks++;
  if (ok) console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  else { failures++; console.log(`  \x1b[31m✗ ${label}${detail ? ` — ${detail}` : ""}\x1b[0m`); }
}
function step(n: string) { console.log(`\n\x1b[1m${n}\x1b[0m`); }

await mongoose.connect(uri);
await mongoose.connection.dropDatabase();

const { StudentService } = await import("../src/services/studentService.js");
const { Student } = await import("../src/models/Student.js");
// Registered so a successful close can populate them on the way back out.
await import("../src/models/Team.js");
await import("../src/models/Course.js");
await import("../src/models/User.js");
await import("../src/models/Lead.js");
const svc = new StudentService();

const receipt = {
  name: "receipt.jpg",
  url: "https://files.example.com/enrolment-receipts/l1/1-receipt.jpg",
  key: "enrolment-receipts/l1/1-receipt.jpg",
  size: 1234,
  mimeType: "image/jpeg",
};

/** A close, with whatever is passed layered over a complete one. */
async function close(over: Record<string, unknown>) {
  return svc.createStudent({
    leadId: String(new Types.ObjectId()),
    name: "Closed Client",
    language: "Malayalam",
    paymentMethod: "tabby",
    paymentReceipt: receipt,
    totalFee: 1000,
    paidAmount: 500,
    // A complete close answers the bonus question too; "no" is an answer.
    hasBonus: false,
    ...over,
  } as Parameters<typeof svc.createStudent>[0]);
}

const refused = async (over: Record<string, unknown>) => {
  try { await close(over); return null; } catch (e) { return (e as Error).message; }
};

step("Refusing a close that finance could not act on");
{
  const m = await refused({ language: undefined });
  check("no language is refused", Boolean(m), "it was accepted");
  check("...saying which is missing", /language/i.test(m ?? ""), `"${m}"`);
}
{
  const m = await refused({ paymentMethod: undefined });
  check("no payment method is refused", /payment method/i.test(m ?? ""), `"${m}"`);
}
{
  const m = await refused({ paymentReceipt: null });
  check("no receipt is refused", /receipt/i.test(m ?? ""), `"${m}"`);
}
{
  // A receipt with no key is a form that looks filled in and points nowhere.
  const m = await refused({ paymentReceipt: { name: "x.jpg", url: "", key: "" } });
  check("a receipt pointing at nothing is refused", /receipt/i.test(m ?? ""), `"${m}"`);
}
{
  const m = await refused({ language: "Klingon" });
  check("a language outside the list is refused", /language/i.test(m ?? ""), `"${m}"`);
}
{
  const m = await refused({ paymentMethod: "barter" });
  check("a payment method finance does not know is refused", /payment method/i.test(m ?? ""), `"${m}"`);
}
{
  // All three at once, named together rather than one round trip each.
  const m = await refused({ language: undefined, paymentMethod: undefined, paymentReceipt: null });
  check(
    "all three missing are named in one refusal",
    /language/i.test(m ?? "") && /payment method/i.test(m ?? "") && /receipt/i.test(m ?? ""),
    `"${m}"`,
  );
}

step("Accepting a complete one, and keeping what it said");
{
  const s = await close({});
  check("a complete close succeeds", Boolean(s), "nothing returned");

  const doc = await Student.findOne({ name: "Closed Client" }).lean();
  check("the language is stored", doc?.language === "Malayalam", `got ${doc?.language}`);
  check("the payment method is stored", doc?.paymentMethod === "tabby", `got ${doc?.paymentMethod}`);
  check("the receipt is stored", doc?.paymentReceipt?.key === receipt.key, `got ${JSON.stringify(doc?.paymentReceipt)}`);
  check("...with the time it was taken", Boolean(doc?.paymentReceipt?.uploadedAt));
}

step("Leaving older enrolments alone");
{
  // Written straight to the collection, as an enrolment made before these
  // fields existed looks. It must still load rather than failing validation.
  const raw = await Student.collection.insertOne({
    enrollmentNumber: "EN-OLD-1",
    name: "Older Client",
    leadId: new Types.ObjectId(),
    enrollmentDate: new Date(),
    totalFee: 500, paidAmount: 500, pendingAmount: 0,
    feeStatus: "paid", status: "active",
  });
  const doc = await Student.findById(raw.insertedId).lean();
  check("an enrolment made before these fields still loads", Boolean(doc), "it did not");
  check("...with nothing invented for it", !doc?.language && !doc?.paymentMethod && !doc?.paymentReceipt);
}

step("The bonus: asked at every close, beside the money and never in it");
{
  const m = await refused({ hasBonus: undefined });
  check("Case 3 — a close that does not say whether a bonus was given is refused", /bonus/i.test(m ?? ""), `"${m}"`);
}
for (const amount of [undefined, 0, -50, "abc", ""]) {
  const m = await refused({ hasBonus: true, bonusAmount: amount });
  check(`Case 3 — a bonus given with amount ${JSON.stringify(amount)} is refused, naming the amount`, /bonus amount/i.test(m ?? ""), `"${m}"`);
}
{
  const m = await refused({ hasBonus: undefined, language: undefined });
  check("...and named together with anything else missing", /bonus/i.test(m ?? "") && /language/i.test(m ?? ""), `"${m}"`);
}
let withBonusId = "";
{
  const s = await close({ name: "Bonus Client", hasBonus: true, bonusAmount: 250 });
  withBonusId = String((s as { _id: unknown })._id);
  const doc = await Student.findById(withBonusId).lean();
  check("Case 1 — a bonus given is stored with its amount", doc?.hasBonus === true && doc?.bonusAmount === 250, JSON.stringify({ h: doc?.hasBonus, a: doc?.bonusAmount }));
  check("...and is not in the balance: fee − paid", doc?.pendingAmount === 500, `pending=${doc?.pendingAmount}`);

  const payload = await svc.buildHandoverPayload(withBonusId) as Record<string, any>;
  check("Case 1 — finance is told the bonus, in minor units", payload?.bonus?.given === true && payload?.bonus?.amountMinor === 25_000, JSON.stringify(payload?.bonus));
  check("Case 1 — and which sales CRM sold it: the Remote CRM, under the source it always had",
    payload?.crm === "remote" && payload?.source === "crm", JSON.stringify({ crm: payload?.crm, source: payload?.source }));
  check("...and the balance, exactly the fee less what was paid", payload?.balanceMinor === 50_000 && payload?.course?.amountMinor - payload?.declaredPaidMinor === payload?.balanceMinor,
    `balance=${payload?.balanceMinor} fee=${payload?.course?.amountMinor} paid=${payload?.declaredPaidMinor}`);
}
{
  const s = await close({ name: "No Bonus Client", hasBonus: false, bonusAmount: 99 });
  const doc = await Student.findById((s as { _id: unknown })._id).lean();
  check("Case 2 — no bonus is stored as no, with no amount whatever was sent", doc?.hasBonus === false && doc?.bonusAmount === 0, JSON.stringify({ h: doc?.hasBonus, a: doc?.bonusAmount }));
  const payload = await svc.buildHandoverPayload(String(doc?._id)) as Record<string, any>;
  check("...and finance is told \"no\"", payload?.bonus?.given === false && payload?.bonus?.amountMinor === 0, JSON.stringify(payload?.bonus));
}
{
  // Collecting more than the fee is refused at the close now (the user, 2026-10-05: "block") …
  const overpaid = await close({ name: "Overpaid Client", totalFee: 1000, paidAmount: 1200 }).then(() => null, (e: { statusCode?: number; message?: string }) => e);
  check("Case 2 — collecting more than the fee is refused: 422", overpaid?.statusCode === 422 && /more than the fee/.test(overpaid.message ?? ""), String(overpaid?.message));
  // … but an enrolment from before that rule may still be over it: its balance is zero, never negative.
  const legacy = await Student.collection.insertOne({
    enrollmentNumber: "EN-OVER-1", name: "Overpaid Client", leadId: new Types.ObjectId(),
    enrollmentDate: new Date(), totalFee: 1000, paidAmount: 1200, pendingAmount: 0, feeStatus: "paid", status: "active",
  });
  const payload = await svc.buildHandoverPayload(String(legacy.insertedId)) as Record<string, any>;
  check("Case 2 — paid in full or more: the balance is zero, never negative", payload?.balanceMinor === 0, `balance=${payload?.balanceMinor}`);
  const odd = await close({ name: "Odd Fee Client", totalFee: 1000.1, paidAmount: 0.3 });
  const p2 = await svc.buildHandoverPayload(String((odd as { _id: unknown })._id)) as Record<string, any>;
  check("Case 2 — fractions: the balance is the exact difference of the minor units sent", p2?.balanceMinor === 100_010 - 30 && p2?.course?.amountMinor - p2?.declaredPaidMinor === p2?.balanceMinor,
    `balance=${p2?.balanceMinor}`);
}
{
  // An enrolment from before the question: unknown is not "no", so nothing is sent.
  const raw = await Student.collection.insertOne({
    enrollmentNumber: "EN-OLD-2", name: "Unasked Client", leadId: new Types.ObjectId(),
    enrollmentDate: new Date(), totalFee: 800, paidAmount: 200, pendingAmount: 600, feeStatus: "partial", status: "active",
  });
  const payload = await svc.buildHandoverPayload(String(raw.insertedId)) as Record<string, any>;
  check("Case 2 — an enrolment from before the question sends no bonus at all", payload && !("bonus" in payload) && payload.balanceMinor === 60_000,
    JSON.stringify({ bonus: payload?.bonus, balance: payload?.balanceMinor }));
}

step("Correcting the bonus after the close — kept in the CRM");
{
  const { FinanceHandover } = await import("../src/models/FinanceHandover.js");
  const before = await FinanceHandover.countDocuments({});
  const bad = await svc.updateStudent(withBonusId, { hasBonus: true, bonusAmount: 0 } as never).then(() => null, (e: Error & { statusCode?: number }) => e);
  check("Case 3 — a bonus changed to no amount is refused", bad?.statusCode === 422 && /bonus/i.test(bad.message), `${bad?.statusCode} ${bad?.message}`);
  const kept = await Student.findById(withBonusId).lean();
  check("...and the stored bonus is unchanged", kept?.bonusAmount === 250);

  await svc.updateStudent(withBonusId, { bonusAmount: 300 } as never);
  check("Case 1 — the amount can be corrected", (await Student.findById(withBonusId).lean())?.bonusAmount === 300);
  await svc.updateStudent(withBonusId, { hasBonus: false } as never);
  const off = await Student.findById(withBonusId).lean();
  check("Case 1 — changed to no bonus, the amount goes with it", off?.hasBonus === false && off?.bonusAmount === 0, JSON.stringify({ h: off?.hasBonus, a: off?.bonusAmount }));
  const unasked = await Student.findOne({ enrollmentNumber: "EN-OLD-2" }).lean();
  await svc.updateStudent(String(unasked?._id), { notes: "touched" } as never);
  check("Case 2 — editing an older enrolment does not answer the bonus for it", (await Student.findById(unasked?._id).lean())?.hasBonus == null);
  check("...and no edit sends anything to finance — corrections go only when finance sends one back",
    (await FinanceHandover.countDocuments({})) === before, `${before} → ${await FinanceHandover.countDocuments({})}`);
}

await mongoose.disconnect();
console.log("");
if (failures) { console.log(`\x1b[31m${failures} of ${checks} checks failed\x1b[0m`); process.exit(1); }
console.log(`\x1b[32mAll ${checks} checks passed\x1b[0m`);
