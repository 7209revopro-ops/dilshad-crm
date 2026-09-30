/**
 * Point each CRM course at the finance catalogue item it bills against.
 *
 * `financeItemId` is what makes an enrolment arrive in finance as a line
 * against a real product rather than as typed words. Without it the invoice
 * carries plain text, finance flags "not mapped to a catalogue item", and the
 * line sits outside whatever the catalogue decides about tax, revenue account
 * and reporting by product.
 *
 * It is no longer what decides the LMS. The course slug travels with the
 * enrolment now and provisioning falls back to it, so an unmapped course still
 * produces a student. This is about the books.
 *
 * The catalogue is read from finance over the same signed link that carries
 * enrolments, so what you are offered is what actually exists there right now
 * rather than a list copied out last week.
 *
 * Matching is exact or it is yours. Names are compared as lowercase letters
 * and digits, so "MMC (Market Making Cycle)" and "mmc market making cycle" are
 * the same name — anything short of that is printed as a suggestion for a
 * person to confirm. Billing a course against the wrong product is a quiet
 * mistake that surfaces as a tax return.
 *
 *   bun src/scripts/mapFinanceItems.ts                      # what it would do
 *   bun src/scripts/mapFinanceItems.ts --apply              # exact matches only
 *   bun src/scripts/mapFinanceItems.ts --set "Delta Wave Theory=DWT-001" --apply
 *
 * --set takes the item's sku, its name or its id. A course that already has an
 * item keeps it unless you pass --force.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Course } from "../models/Course.js";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const SETS = process.argv.reduce<string[]>(
  (acc, a, i) => (a === "--set" && process.argv[i + 1] ? [...acc, process.argv[i + 1]!] : acc),
  [],
);

/** Letters and digits only, so punctuation and case stop being differences. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error("MONGODB_URI is not set."); process.exit(1); }
  await mongoose.connect(uri);

  const { listFinanceItems, financeConfigured } = await import("../services/financeClient.js");
  if (!financeConfigured()) {
    console.error("The finance integration is not configured — there is no catalogue to read.");
    process.exit(1);
  }

  const items = await listFinanceItems();
  console.log(`finance catalogue: ${items.length} item(s)`);
  if (items.length === 0) {
    console.log("\nNothing to map against. Create the items in finance first:");
    console.log("  Inventory → New item, one per course, with its price and sku.");
    console.log("Then run this again.");
    await mongoose.disconnect();
    return;
  }

  const byName = new Map(items.map((i) => [norm(i.name), i]));
  const courses = await Course.find({}).select("name financeItemId lmsCourseSlug").lean();
  console.log(`CRM courses:       ${courses.length}\n`);

  const exact: { id: string; name: string; item: (typeof items)[number] }[] = [];
  const manual: { name: string; near: typeof items }[] = [];
  const done: string[] = [];

  for (const c of courses) {
    const name = String(c.name ?? "");
    const current = String((c as { financeItemId?: string }).financeItemId ?? "").trim();
    if (current && !FORCE) {
      const known = items.find((i) => i.id === current);
      done.push(`${name} → ${known ? `${known.name} [${known.sku}]` : `${current} (no such item in finance any more)`}`);
      continue;
    }
    const hit = byName.get(norm(name));
    if (hit) { exact.push({ id: String(c._id), name, item: hit }); continue; }
    const n = norm(name);
    const near = items.filter((i) => n && (norm(i.name).includes(n) || n.includes(norm(i.name))));
    manual.push({ name, near });
  }

  if (done.length) {
    console.log(`already mapped (${done.length}):`);
    for (const d of done) console.log(`  ${d}`);
    console.log("");
  }

  console.log(`exact name match (${exact.length}):`);
  for (const e of exact) console.log(`  ${e.name.slice(0, 40).padEnd(42)} → ${e.item.name} [${e.item.sku}]`);

  console.log(`\nneeds a person (${manual.length}):`);
  for (const m of manual) {
    console.log(`  ${m.name.slice(0, 40).padEnd(42)} → ?`);
    for (const n of m.near.slice(0, 3)) console.log(`      perhaps: ${n.sku.padEnd(14)} ${n.name}`);
    if (m.near.length === 0) {
      console.log(`      nothing in the catalogue resembles it — create the item in finance first`);
    }
  }

  // Explicit pairs are the only way anything inexact is set.
  const explicit: { name: string; item: (typeof items)[number] }[] = [];
  for (const pair of SETS) {
    const at = pair.lastIndexOf("=");
    if (at < 1) { console.error(`\n--set "${pair}" is not COURSE=item`); process.exit(1); }
    const course = pair.slice(0, at).trim();
    const given = pair.slice(at + 1).trim();
    const item =
      items.find((i) => i.sku === given) ??
      items.find((i) => i.id === given) ??
      items.find((i) => norm(i.name) === norm(given));
    if (!item) {
      console.error(`\nNo catalogue item matches "${given}" — not a sku, an id or a name. Nothing was changed.`);
      console.error("The catalogue holds:");
      for (const i of items) console.error(`  ${i.sku.padEnd(14)} ${i.name}`);
      process.exit(1);
    }
    explicit.push({ name: course, item });
  }

  if (!APPLY) {
    console.log(`\nNothing was changed. --apply would set ${exact.length + explicit.length}.`);
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  for (const e of exact) {
    await Course.updateOne({ _id: e.id }, { $set: { financeItemId: e.item.id } });
    written++;
  }
  for (const e of explicit) {
    const r = await Course.updateOne({ name: e.name }, { $set: { financeItemId: e.item.id } });
    if (r.matchedCount === 0) {
      console.error(`  no CRM course is named "${e.name}". They are:`);
      for (const c of courses) console.error(`    ${String(c.name)}`);
    } else {
      console.log(`  ${e.name} → ${e.item.name} [${e.item.sku}]`);
      written++;
    }
  }
  console.log(`\nset ${written}.`);
  console.log("Enrolments from now on bill against the catalogue item. Invoices already raised keep");
  console.log("the plain-text line they were created with — change those on the invoice in finance.");

  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
