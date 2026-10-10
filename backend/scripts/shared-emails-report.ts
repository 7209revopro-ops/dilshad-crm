/**
 * Which emails in this CRM are shared by different people — a report, read
 * only (one email, one client — the user, 2026-10-10).
 *
 * Finance knows a customer by the email alone, so an address carried by two
 * different clients here is one finance files both under: four students were
 * closed with one address, and finance put all four invoices under the first.
 * This lists every such address across the leads and the students, grouped by
 * the address (trimmed, lower-cased), where two or more of its records are
 * different people by the CRM's rule (src/utils/clientEmail.ts): both phones
 * known and their last nine digits differ, else the names differ — a student
 * and its own lead being one person. Only addresses finance would take are
 * looked at; an invalid one never reaches it.
 *
 * For each: the address masked (its first two characters, ***, the domain),
 * how many records and people, and each record — student or lead, name, the
 * student's code or the lead's id, status. Never a phone number, never a whole
 * address.
 *
 * Reads only: no write in it, no model loaded (so no index is built), and it
 * takes nothing but --json. Nothing is changed or cleaned up — the leads keep
 * their emails; the close, the correction and the add-email refuse a shared
 * one from now on.
 *
 * Run it from backend/, with .env left unread and the database given
 * explicitly:
 *
 *   MONGODB_URI='mongodb+srv://USER:PASS@HOST/DB' bun --no-env-file run scripts/shared-emails-report.ts
 *   MONGODB_URI='mongodb+srv://USER:PASS@HOST/DB' bun --no-env-file run scripts/shared-emails-report.ts --json > shared-emails.json
 */
import mongoose from "mongoose";
import { differentPeople, emailKey, isFinanceEmail, maskEmail } from "../src/utils/clientEmail.js";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const other = args.filter((a) => a !== "--json");
if (other.length) {
  console.error(`This report only reads, and takes nothing but --json (given: ${other.join(" ")}). It changes nothing.`);
  process.exit(2);
}
const uri = process.env.MONGODB_URI ?? "";
if (!uri) {
  console.error("Set MONGODB_URI to the database to read, explicitly — run with bun --no-env-file (see the top of this file).");
  process.exit(2);
}

type Rec = {
  kind: "student" | "lead";
  id: string;
  name: string;
  /** The student's code. */
  code?: string;
  /** A student's own lead — the same person. */
  leadId?: string;
  status: string;
  phone?: unknown;
  createdAt?: Date;
};

try {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, readPreference: "secondaryPreferred", serverSelectionTimeoutMS: 20_000 });
} catch (err) {
  // The URI carries credentials: only the reason is printed.
  console.error(`Could not reach the database: ${(err as Error).message.replace(/mongodb(\+srv)?:\/\/\S+/g, "<uri>")}`);
  process.exit(1);
}
const db = mongoose.connection.db!;

const byEmail = new Map<string, Rec[]>();
function add(email: unknown, rec: Rec) {
  const key = emailKey(email);
  if (!isFinanceEmail(key)) return;
  const list = byEmail.get(key);
  if (list) list.push(rec);
  else byEmail.set(key, [rec]);
}

const withEmail = { email: { $type: "string", $ne: "" } };
for await (const s of db.collection("students").find(withEmail, {
  projection: { name: 1, phone: 1, email: 1, enrollmentNumber: 1, leadId: 1, status: 1, createdAt: 1 },
})) {
  add(s.email, {
    kind: "student", id: String(s._id), name: String(s.name ?? ""), code: s.enrollmentNumber ? String(s.enrollmentNumber) : undefined,
    leadId: s.leadId ? String(s.leadId) : undefined, status: String(s.status ?? ""), phone: s.phone, createdAt: s.createdAt,
  });
}
for await (const l of db.collection("leads").find(withEmail, { projection: { name: 1, phone: 1, email: 1, status: 1, createdAt: 1 } })) {
  add(l.email, { kind: "lead", id: String(l._id), name: String(l.name ?? ""), status: String(l.status ?? ""), phone: l.phone, createdAt: l.createdAt });
}
const dbName = db.databaseName;
await mongoose.disconnect();

/** The same person: a student and its own lead, or two records the rule can't tell apart. */
const samePerson = (a: Rec, b: Rec) =>
  (a.kind === "student" && b.kind === "lead" && a.leadId === b.id)
  || (b.kind === "student" && a.kind === "lead" && b.leadId === a.id)
  || !differentPeople(a, b);

/** How many people, by joining every pair that is the same person. */
function peopleIn(recs: Rec[]): number {
  const parent = recs.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) if (samePerson(recs[i]!, recs[j]!)) parent[root(i)] = root(j);
  }
  return new Set(recs.map((_, i) => root(i))).size;
}

const order = (a: Rec, b: Rec) =>
  (a.kind === b.kind ? 0 : a.kind === "student" ? -1 : 1)
  || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  || a.id.localeCompare(b.id);

const groups = [...byEmail.entries()]
  .filter(([, recs]) => recs.length > 1 && recs.some((a, i) => recs.slice(i + 1).some((b) => !samePerson(a, b))))
  .map(([key, recs]) => {
    const sorted = [...recs].sort(order);
    return {
      email: maskEmail(key),
      records: recs.length,
      students: recs.filter((r) => r.kind === "student").length,
      leads: recs.filter((r) => r.kind === "lead").length,
      // At least two: some pair is different people, even where a chain of same names joins them.
      people: Math.max(2, peopleIn(recs)),
      items: sorted.map((r) => ({
        kind: r.kind,
        name: r.name,
        ...(r.kind === "student" ? { code: r.code ?? "" } : { leadId: r.id }),
        status: r.status,
      })),
    };
  })
  .sort((a, b) => b.records - a.records || a.email.localeCompare(b.email));

const generatedAt = new Date().toISOString();
const total = groups.reduce((s, g) => s + g.records, 0);

if (asJson) {
  console.log(JSON.stringify({
    database: dbName,
    generatedAt,
    rule: "different people: both phones known and their last 9 digits differ, else names differ (case and spaces aside); a student and its own lead are one person",
    emails: groups.length,
    records: total,
    groups,
  }, null, 2));
} else {
  const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}… ` : s.padEnd(n + 1));
  console.log(`Shared emails — database "${dbName}", ${generatedAt} — read only, nothing changed`);
  console.log("Emails held by two or more different people (the phone's last 9 digits, else the name; a student and its own lead are one).");
  console.log(groups.length ? `${groups.length} ${groups.length === 1 ? "email" : "emails"} · ${total} records\n` : "\nNone.");
  groups.forEach((g, i) => {
    console.log(`${i + 1}. ${g.email} — ${g.records} records: ${g.students} ${g.students === 1 ? "student" : "students"}, ${g.leads} ${g.leads === 1 ? "lead" : "leads"} · ${g.people} people`);
    for (const r of g.items) {
      console.log(`   ${pad(r.kind, 7)} ${pad("code" in r ? r.code ?? "" : r.leadId ?? "", 24)} ${pad(r.name || "(no name)", 32)} ${r.status}`);
    }
    console.log("");
  });
}
process.exit(0);
