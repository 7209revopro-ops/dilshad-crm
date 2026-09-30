/**
 * Give each CRM course the LMS course it corresponds to.
 *
 * The slug travels with every enrolment and is what finance maps its catalogue
 * item to, so a course without one produces an approved enrolment, no student,
 * and a provisioning row reading "No LMS course is mapped". Nothing in the CRM
 * can set it — there is no field for it on any screen — so it is this or a
 * mongo shell.
 *
 * The matching is the dangerous part, not the writing. This database holds
 * several spellings of the same programme, and enrolling somebody on the wrong
 * course is worse than not enrolling them at all. So only an exact match is
 * ever applied: names normalised to lowercase letters and digits, and equal
 * after that. Everything else is printed as a suggestion for a person to
 * confirm with --set, and a course that already has a slug is never touched
 * without --force.
 *
 * The LMS list is read from its public course endpoint, so this always maps
 * against the slugs that actually exist rather than a list copied out weeks ago.
 *
 *   bun src/scripts/mapLmsCourseSlugs.ts                     # what it would do
 *   bun src/scripts/mapLmsCourseSlugs.ts --apply             # exact matches only
 *   bun src/scripts/mapLmsCourseSlugs.ts --set "DIGITAL MARKETING=digital-marketing" --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Course } from "../models/Course.js";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const SETS = process.argv
  .filter((a) => a.startsWith("--set="))
  .map((a) => a.slice("--set=".length))
  .concat(
    process.argv.reduce<string[]>((acc, a, i) => (a === "--set" && process.argv[i + 1] ? [...acc, process.argv[i + 1]!] : acc), []),
  );

const LMS = (process.env.LMS_API_URL ?? "https://api-lms.deltainstitutions.com").replace(/\/+$/, "").replace(/\/api\/v1$/, "");

/** Letters and digits only: "MMC (MARKET MAKING CYCLE)" and "mmc market making cycle" are the same name. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

async function lmsCourses(): Promise<{ slug: string; title: string }[]> {
  const res = await fetch(`${LMS}/api/v1/courses`);
  if (!res.ok) throw new Error(`The LMS answered ${res.status} for its course list`);
  const body = (await res.json()) as unknown;
  const unwrap = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return unwrap(o.courses ?? o.data ?? []);
    }
    return [];
  };
  return unwrap(body)
    .map((c) => c as Record<string, unknown>)
    .filter((c) => typeof c.slug === "string" && c.slug)
    .map((c) => ({ slug: String(c.slug), title: String(c.title ?? c.name ?? "") }));
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error("MONGODB_URI is not set."); process.exit(1); }
  await mongoose.connect(uri);

  const remote = await lmsCourses();
  console.log(`LMS courses: ${remote.length}`);
  const byName = new Map(remote.map((c) => [norm(c.title), c]));

  const courses = await Course.find({}).select("name lmsCourseSlug financeItemId").lean();
  console.log(`CRM courses: ${courses.length}\n`);

  const exact: { id: string; name: string; slug: string }[] = [];
  const manual: { name: string; near: { slug: string; title: string }[] }[] = [];
  const done: string[] = [];

  for (const c of courses) {
    const name = String(c.name ?? "");
    const current = String((c as { lmsCourseSlug?: string }).lmsCourseSlug ?? "").trim();
    if (current && !FORCE) { done.push(`${name} → ${current}`); continue; }

    const hit = byName.get(norm(name));
    if (hit) { exact.push({ id: String(c._id), name, slug: hit.slug }); continue; }

    /* Not applied, only offered. A name that merely contains another is how a
       foundation course gets mapped to the advanced one. */
    const n = norm(name);
    const near = remote.filter((r) => n && (norm(r.title).includes(n) || n.includes(norm(r.title))));
    manual.push({ name, near });
  }

  if (done.length) {
    console.log(`already mapped (${done.length}):`);
    for (const d of done) console.log(`  ${d}`);
    console.log("");
  }

  console.log(`exact name match (${exact.length}):`);
  for (const e of exact) console.log(`  ${e.name.slice(0, 44).padEnd(46)} → ${e.slug}`);

  console.log(`\nneeds a person (${manual.length}):`);
  for (const m of manual) {
    console.log(`  ${m.name.slice(0, 44).padEnd(46)} → ?`);
    for (const n of m.near.slice(0, 3)) console.log(`      perhaps: ${n.slug}  (${n.title.slice(0, 40)})`);
  }

  // Explicit pairs always win, and are the only way anything inexact is set.
  const explicit: { name: string; slug: string }[] = [];
  for (const pair of SETS) {
    const at = pair.lastIndexOf("=");
    if (at < 1) { console.error(`\n--set "${pair}" is not NAME=slug`); process.exit(1); }
    const name = pair.slice(0, at).trim();
    const given = pair.slice(at + 1).trim();

    /*
     * A slug, or the title it belongs to.
     *
     * The listing above prints both, and the title is the larger, more
     * readable half — so that is what gets copied, and the script refused it.
     * Being strict about which of two things on the same line you meant is
     * pedantry when the answer is unambiguous either way.
     */
    const hit =
      remote.find((r) => r.slug === given) ??
      remote.find((r) => norm(r.title) === norm(given));
    if (!hit) {
      console.error(`\nThe LMS has no course "${given}" — neither a slug nor a title. Nothing was changed.`);
      console.error("Its courses are:");
      for (const r of remote) console.error(`  ${r.slug.padEnd(42)} ${r.title}`);
      process.exit(1);
    }
    if (hit.slug !== given) console.log(`  read "${given}" as ${hit.slug}`);
    explicit.push({ name, slug: hit.slug });
  }

  if (!APPLY) {
    console.log(`\nNothing was changed. --apply would set ${exact.length + explicit.length}.`);
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  for (const e of exact) {
    await Course.updateOne({ _id: e.id }, { $set: { lmsCourseSlug: e.slug } });
    written++;
  }
  for (const e of explicit) {
    const r = await Course.updateOne({ name: e.name }, { $set: { lmsCourseSlug: e.slug } });
    if (r.matchedCount === 0) {
      console.error(`  no CRM course is named "${e.name}". They are:`);
      for (const c of courses) console.error(`    ${String(c.name)}`);
    }
    else written++;
  }
  console.log(`\nset ${written}.`);
  console.log("New enrolments carry the slug from now on. Ones already approved need finance's");
  console.log("backfill-lms-provisions --requeue-unmapped --apply, once the catalogue item is mapped too.");

  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
