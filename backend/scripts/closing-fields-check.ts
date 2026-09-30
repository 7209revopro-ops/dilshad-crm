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

await mongoose.disconnect();
console.log("");
if (failures) { console.log(`\x1b[31m${failures} of ${checks} checks failed\x1b[0m`); process.exit(1); }
console.log(`\x1b[32mAll ${checks} checks passed\x1b[0m`);
