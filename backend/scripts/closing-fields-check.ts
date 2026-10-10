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
 * And one email, one client (2026-10-10): a close with an email another client
 * here holds — a student, or a lead that is a different person (the phone's
 * last nine digits, else the name) — is refused, naming them; the same person
 * closing a second course is not. As in the Remote CRM that day: 23 leads on
 * one email and 4 students closed with it, so closing any of the others is
 * refused until the client's own email is given. The check the dialog asks
 * (checkClientEmail), and the read-only report of shared emails
 * (scripts/shared-emails-report.ts), run against the same data.
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
  const name = String(over.name ?? "Closed Client");
  return svc.createStudent({
    leadId: String(new Types.ObjectId()),
    name,
    // Finance refuses an enrolment without the client's email (2026-10-10) — and
    // each client has their own (one email, one client), so it follows the name.
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
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

{
  const m = await refused({ email: undefined });
  check("no client email is refused, naming it", /the client's email/i.test(m ?? ""), `"${m}"`);
}
{
  const m = await refused({ email: "closed.client@example" });
  check("an email finance cannot take is refused", /the client's email/i.test(m ?? ""), `"${m}"`);
}
{
  // Finance's own check (zod's email) refuses what only looks like an address.
  const m = await refused({ email: "a@b.c" });
  check("...nor one that only looks like one (a@b.c)", /the client's email/i.test(m ?? ""), `"${m}"`);
}
{
  const before = await Student.countDocuments();
  await refused({ email: "", language: undefined });
  check("...and nothing is saved for a refused close", (await Student.countDocuments()) === before);
}

step("Accepting a complete one, and keeping what it said");
{
  const s = await close({});
  check("a complete close succeeds", Boolean(s), "nothing returned");

  const doc = await Student.findOne({ name: "Closed Client" }).lean();
  check("the client's email is stored", doc?.email === "closed.client@example.com", `got ${doc?.email}`);
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
  // Collecting more than the fee is taken (the owner, 2026-10-06) …
  const overpaid = await close({ name: "Overpaid Client", totalFee: 1000, paidAmount: 1200 }).then(() => null, (e: { statusCode?: number; message?: string }) => e);
  check("Case 2 — collecting more than the fee is taken", overpaid === null, String(overpaid?.message));
  // … and an enrolment over its fee, from then or before: its balance is zero, never negative.
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

step("One email, one client (2026-10-10): an email another client here holds is refused at the close");
const { Lead } = await import("../src/models/Lead.js");
const reporter = new Types.ObjectId();
/** A lead as it is stored, written straight in — as older ones were, untouched by the schema. */
async function lead(name: string | null, phone: string | null, email: string | null) {
  const _id = new Types.ObjectId();
  await Lead.collection.insertOne({
    _id, ...(name === null ? {} : { name }), ...(phone === null ? {} : { phone }), ...(email === null ? {} : { email }),
    status: "assigned", reporter, payments: [], activityLogs: [], createdAt: new Date(), updatedAt: new Date(),
  });
  return String(_id);
}
type Outcome = { s: { _id?: unknown; enrollmentNumber?: string; email?: string } | null; e: (Error & { statusCode?: number }) | null };
/** That lead closed as the dialog closes it — its name and phone — with this email. */
const closeLead = (leadId: string, name: string, phone: string | null, email: string): Promise<Outcome> =>
  close({ leadId, name, ...(phone === null ? {} : { phone }), email }).then(
    (s) => ({ s: s as Outcome["s"], e: null }),
    (e: Error & { statusCode?: number }) => ({ s: null, e }),
  );
const leadEmail = async (id: string) => (await Lead.findById(id).lean())?.email;

// As in the Remote CRM on 2026-10-10: one email on 23 leads, and 4 different
// students closed with it before this rule (finance filed all four under the first).
const SHARED = "shared.client@gmail.com";
const sharedNames = ["najad ahmed", "yfscghs", "mohammed lebbie", "Halif", ...Array.from({ length: 19 }, (_, i) => `Shared Lead ${i + 5}`)];
/** A different phone for each: +97150400000i, its last nine digits 50400000i. */
const sharedPhone = (i: number) => `+97150${String(4_000_000 + i)}`;
const sharedLeads: string[] = [];
for (let i = 0; i < 23; i++) sharedLeads.push(await lead(sharedNames[i]!, sharedPhone(i), SHARED));
for (let i = 0; i < 4; i++) {
  await Student.collection.insertOne({
    enrollmentNumber: `STU-900${i + 1}`, name: sharedNames[i], phone: sharedPhone(i), email: SHARED, leadId: new Types.ObjectId(sharedLeads[i]),
    enrollmentDate: new Date(), totalFee: 1000, paidAmount: 1000, pendingAmount: 0, feeStatus: "paid", status: "active",
    createdAt: new Date(Date.now() - (10 - i) * 86_400_000), updatedAt: new Date(),
  });
}
{
  const before = await Student.countDocuments();
  const r = await closeLead(sharedLeads[4]!, sharedNames[4]!, sharedPhone(4), SHARED);
  check("Case 3 — closing another of the 23 leads with the email they share: 409", r.e?.statusCode === 409, `${r.e?.statusCode} ${r.e?.message}`);
  check("...naming who it belongs to — the first student closed with it, by code — and asking for this client's own",
    r.e?.message === "This email is already used by najad ahmed (STU-9001), a different client — enter Shared Lead 5's own email.", r.e?.message);
  check("...with no phone number in it", !Array.from({ length: 23 }, (_, i) => sharedPhone(i).slice(-9)).some((p) => r.e?.message.includes(p)) && !/\d{7,}/.test(r.e?.message ?? ""), r.e?.message);
  check("...nothing saved, and the lead's email left as it is", (await Student.countDocuments()) === before && (await leadEmail(sharedLeads[4]!)) === SHARED);

  const own = await closeLead(sharedLeads[4]!, sharedNames[4]!, sharedPhone(4), "Shared.Lead5@Example.com");
  check("Case 1 — given the client's own email instead, the close goes through", Boolean(own.s) && !own.e, own.e?.message);
  check("...the enrolment has it; the lead keeps the email it carried — nothing is cleaned",
    own.s?.email === "shared.lead5@example.com" && (await leadEmail(sharedLeads[4]!)) === SHARED, `${own.s?.email} / ${await leadEmail(sharedLeads[4]!)}`);

  // The check the close dialog asks before anything is saved.
  const c1 = await svc.checkClientEmail(SHARED, { leadId: sharedLeads[5] });
  check("Case 1 — the dialog's check for another of them: taken, by najad ahmed, a student, STU-9001 — in the words of the refusal",
    c1.ok === false && c1.takenBy?.name === "najad ahmed" && c1.takenBy?.code === "STU-9001" && c1.takenBy?.kind === "student"
      && c1.message === "This email is already used by najad ahmed (STU-9001), a different client — enter Shared Lead 6's own email.", JSON.stringify(c1));
  const c2 = await svc.checkClientEmail("  SHARED.LEAD5@example.com ", { leadId: sharedLeads[6] });
  check("...an email given at a close is that client's from then on: taken for the next lead (any case, any spaces)",
    c2.ok === false && c2.takenBy?.name === "Shared Lead 5" && c2.takenBy?.kind === "student" && c2.takenBy?.code === own.s?.enrollmentNumber, JSON.stringify(c2));
  const c3 = await svc.checkClientEmail("brand.new@example.com", { leadId: sharedLeads[6] });
  check("...one nobody here holds: free", c3.ok === true && !c3.takenBy && !c3.message, JSON.stringify(c3));
  const c4 = await svc.checkClientEmail("shared.lead5@example.com", { studentId: String(own.s?._id) });
  check("...a client's own email, asked for their own enrolment: free", c4.ok === true, JSON.stringify(c4));
  const c5 = await svc.checkClientEmail(SHARED, { studentId: String((await Student.findOne({ enrollmentNumber: "STU-9004" }).lean())?._id) });
  check("...the shared one, asked for Halif's enrolment: taken by najad ahmed — enter Halif's own",
    c5.ok === false && c5.message === "This email is already used by najad ahmed (STU-9001), a different client — enter Halif's own email.", JSON.stringify(c5));
  for (const [label, ask, status] of [
    ["an email finance won't take (a@b.c): 422", () => svc.checkClientEmail("a@b.c", { leadId: sharedLeads[6] }), 422],
    ["no lead or enrolment said: 422", () => svc.checkClientEmail(SHARED, {}), 422],
    ["a lead that doesn't exist: 404", () => svc.checkClientEmail(SHARED, { leadId: String(new Types.ObjectId()) }), 404],
    ["an enrolment that doesn't exist: 404", () => svc.checkClientEmail(SHARED, { studentId: "not-an-id" }), 404],
  ] as const) {
    const e = await ask().then(() => null, (x: Error & { statusCode?: number }) => x);
    check(`Case 3 — the check: ${label}`, e?.statusCode === status, `${e?.statusCode} ${e?.message}`);
  }
}
{
  // Another lead holds it — nobody closed with it yet.
  await lead("Rahul K", "+971501230001", "rahul.k@example.com");
  const sameer = await lead("Sameer", "+971501230002", "rahul.k@example.com");
  const r = await closeLead(sameer, "Sameer", "+971501230002", "rahul.k@example.com");
  check("Case 3 — an email another lead holds, a different person (another phone): 409, naming the lead as one",
    r.e?.statusCode === 409 && r.e.message === "This email is already used by Rahul K (a lead), a different client — enter Sameer's own email.", `${r.e?.statusCode} ${r.e?.message}`);
  const c = await svc.checkClientEmail("rahul.k@example.com", { leadId: sameer });
  check("...and the dialog's check says so: a lead, no code", c.ok === false && c.takenBy?.kind === "lead" && c.takenBy?.name === "Rahul K" && c.takenBy?.code === undefined, JSON.stringify(c));
  await lead(null, "+971501230003", "nameless@example.com");
  const r2 = await closeLead(await lead("Priya", "+971501230004", null), "Priya", "+971501230004", "nameless@example.com");
  check("...a lead with no name is \"another lead\"", r2.e?.statusCode === 409 && /already used by another lead, a different client — enter Priya's own email\.$/.test(r2.e.message), r2.e?.message);

  // Held as typed long ago: another case, spaces round it — the same email.
  await lead("Mixed Case", "+971501240001", "  Case.Mixed@Example.COM ");
  const other = await lead("Other Person", "+971501240002", "case.mixed@example.com");
  const r3 = await closeLead(other, "Other Person", "+971501240002", "case.mixed@example.com");
  check("Case 2 — one stored in another case with spaces round it is the same email: 409", r3.e?.statusCode === 409 && /by Mixed Case \(a lead\)/.test(r3.e.message), r3.e?.message);
}
{
  // The same client, a second course: the same phone, written another way.
  const a1 = await closeLead(await lead("Anil Kumar", "+971 50 777 8888", "anil@example.com"), "Anil Kumar", "+971 50 777 8888", "anil@example.com");
  const a2 = await closeLead(await lead("Anil K", "0507778888", "anil@example.com"), "Anil K", "0507778888", "anil@example.com");
  check("Case 1 — the same client (the same phone, written another way, another spelling of the name) closing a second course with their email: goes through",
    Boolean(a1.s) && Boolean(a2.s), `${a1.e?.message} / ${a2.e?.message}`);
}
{
  // No phone to go on: the names decide.
  const f1 = await closeLead(await lead("Fatima Noor", null, "fatima@example.com"), "Fatima Noor", null, "fatima@example.com");
  check("Case 2 — a client with no phone closes with an email nobody else holds", Boolean(f1.s), f1.e?.message);
  const f2 = await closeLead(await lead("  FATIMA   noor ", "+971509990002", null), "  FATIMA   noor ", "+971509990002", "fatima@example.com");
  check("Case 2 — no phone on the student holding it: the names decide — the same name (case and spaces aside) is the same client", Boolean(f2.s), f2.e?.message);
  const f3 = await closeLead(await lead("Zainab Ali", "+971509990001", null), "Zainab Ali", "+971509990001", "fatima@example.com");
  check("...another name is another client: 409, naming her",
    f3.e?.statusCode === 409 && f3.e.message === `This email is already used by Fatima Noor (${f1.s?.enrollmentNumber}), a different client — enter Zainab Ali's own email.`, f3.e?.message);
  await lead("Omar", "0", "omar@example.com");
  const o1 = await closeLead(await lead("omar", "+971501250002", null), "  OMAR ", "+971501250002", "omar@example.com");
  check("Case 2 — a phone that is no phone (\"0\") counts as none: the names decide, and the same name goes through", Boolean(o1.s), o1.e?.message);
  await lead(null, null, "ghost@example.com");
  const g1 = await closeLead(await lead("Ghost Hunter", "+971501260001", null), "Ghost Hunter", "+971501260001", "ghost@example.com");
  check("Case 2 — a lead with neither a name nor a phone isn't known to be anyone else: it goes through", Boolean(g1.s), g1.e?.message);
}

step("The report of shared emails (scripts/shared-emails-report.ts) — read only");
{
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const backend = fileURLToPath(new URL("..", import.meta.url));
  const run = (env: Record<string, string>, ...args: string[]) =>
    spawnSync(process.execPath, ["--no-env-file", "run", "scripts/shared-emails-report.ts", ...args], {
      cwd: backend, env: { ...process.env, ...env }, encoding: "utf8", timeout: 120_000,
    });
  // Every index this script's own models build, settled first — so whatever changes now is the report's
  // doing. (One model's index clashes with another's on a fresh database; that is not this check's business.)
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init().catch(() => undefined)));
  const snapshot = async () => {
    const db = mongoose.connection.db!;
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith("system.")).sort();
    return JSON.stringify(await Promise.all(names.map(async (n) => ({
      n, docs: await db.collection(n).find().sort({ _id: 1 }).toArray(), indexes: (await db.collection(n).indexes()).map((i) => i.name).sort(),
    }))));
  };
  const before = await snapshot();

  const j = run({ MONGODB_URI: uri }, "--json");
  check("--json runs (exit 0)", j.status === 0, `${j.status} ${j.stderr}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let report: any = null;
  try { report = JSON.parse(j.stdout); } catch { /* checked below */ }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const group = (masked: string) => (report?.groups as any[] | undefined)?.find((g) => g.email === masked);
  const g = group("sh***@gmail.com");
  check("the email the 23 leads and 4 students share: one group — 27 records, 4 students, 23 leads, 23 people (each student its own lead's)",
    g?.records === 27 && g?.students === 4 && g?.leads === 23 && g?.people === 23, JSON.stringify(g && { ...g, items: g.items.length }));
  check("...each record: student or lead, its name, the student's code or the lead's id, its status — students first, the earliest first",
    g?.items?.[0]?.kind === "student" && g.items[0].name === "najad ahmed" && g.items[0].code === "STU-9001" && g.items[0].status === "active"
      && g.items.slice(4).every((x: { kind: string; leadId?: string; status: string }) => x.kind === "lead" && /^[0-9a-f]{24}$/.test(x.leadId ?? "") && x.status === "assigned"),
    JSON.stringify(g?.items?.slice(0, 5)));
  check("...the lead sharing it with others but closed with its own email is listed among them; that own email isn't shared",
    g?.items?.some((x: { leadId?: string }) => x.leadId === sharedLeads[4]) && !group("sh***@example.com"));
  check("an email another lead holds, and one stored in another case with spaces: listed, grouped as one",
    group("ra***@example.com")?.leads === 2 && group("ca***@example.com")?.leads === 2, JSON.stringify([group("ra***@example.com"), group("ca***@example.com")]));
  check("an email one client uses twice — Anil's two courses; Fatima, her lead and her second close — isn't listed",
    !group("an***@example.com") && !group("fa***@example.com") && !group("om***@example.com"), JSON.stringify(report?.groups?.map((x: { email: string }) => x.email)));
  check("every address masked: two characters, ***, the domain",
    Array.isArray(report?.groups) && report.groups.length >= 3 && report.groups.every((x: { email: string }) => /^[^@*]{1,2}\*\*\*@[^@]+$/.test(x.email)), JSON.stringify(report?.groups?.map((x: { email: string }) => x.email)));
  const phones = [...Array.from({ length: 23 }, (_, i) => sharedPhone(i).slice(-9)), "501230001", "501230002", "501240001", "501240002"];
  check("...and no phone number anywhere in it, nor a whole address", !phones.some((p) => j.stdout.includes(p)) && !j.stdout.includes(SHARED) && !j.stdout.includes("rahul.k@"));

  const t = run({ MONGODB_URI: uri });
  check("as text: runs, lists the shared email masked, says it is read only, prints no phone or whole address",
    t.status === 0 && t.stdout.includes("sh***@gmail.com — 27 records: 4 students, 23 leads · 23 people") && /read only/.test(t.stdout)
      && t.stdout.includes("STU-9001") && t.stdout.includes(sharedLeads[22]!)
      && !phones.some((p) => t.stdout.includes(p)) && !t.stdout.includes(SHARED), `${t.status} ${t.stderr}\n${t.stdout.slice(0, 600)}`);
  const w = run({ MONGODB_URI: uri }, "--write");
  check("refuses anything but --json (--write: exit 2, nothing read or printed)", w.status === 2 && !w.stdout && /only reads/.test(w.stderr), `${w.status} ${w.stderr}`);
  const n = run({ MONGODB_URI: "" }, "--json");
  check("refuses to run without MONGODB_URI given (exit 2)", n.status === 2 && /MONGODB_URI/.test(n.stderr), `${n.status} ${n.stderr}`);
  check("...and the database is exactly as it was: no document, collection or index changed", (await snapshot()) === before);
}

await mongoose.disconnect();
console.log("");
if (failures) { console.log(`\x1b[31m${failures} of ${checks} checks failed\x1b[0m`); process.exit(1); }
console.log(`\x1b[32mAll ${checks} checks passed\x1b[0m`);
