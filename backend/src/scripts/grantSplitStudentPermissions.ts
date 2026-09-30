/**
 * Gives every existing role the three modules "students" split into.
 *
 * The student list, My Enrolments and Daily Closings all checked one
 * permission — "students" — which the permission-matrix screen never listed,
 * so no role but Super Admin could ever be granted it. Splitting it into
 * three modules on its own fixes nothing for a role created before today:
 * defaulting a brand-new module to false is exactly how "students" ended up
 * silently unreachable in the first place, and doing that three times over
 * would just be the same mistake three times.
 *
 * So every role gets sensible defaults — view/create/edit for its own
 * students, view for its own enrolments and closings, matching what a
 * counsellor role needs day to day — and admins are free to narrow any of it
 * per role afterwards, same as grantTrackerPermission.ts before it.
 *
 * Only touches a role that has nothing set for a given module, so running
 * this again after somebody has adjusted things by hand changes nothing.
 *
 *   bun src/scripts/grantSplitStudentPermissions.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Role } from "../models/Role.js";

const DEFAULTS: Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean; approve: boolean; export: boolean }> = {
  students:   { view: true, create: true, edit: true, delete: false, approve: false, export: false },
  enrolments: { view: true, create: false, edit: true, delete: false, approve: false, export: false },
  closings:   { view: true, create: false, edit: false, delete: false, approve: false, export: false },
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { authSource: "admin" });

  const roles = await Role.find({});
  let changed = 0;

  for (const role of roles) {
    const perms = (role.permissions ?? {}) as Record<string, { view?: boolean } | undefined>;
    let touched = false;

    for (const [mod, fallback] of Object.entries(DEFAULTS)) {
      /*
       * Checked on view, not on the object's existence.
       *
       * The schema gives every module a subdocument by default — {view:
       * false, create: false, ...} — for every role, whether or not anybody
       * ever set it. So permissions.students already "exists" on a role that
       * has never been granted it, all false, and a presence check here would
       * see that object, call it "already set", and skip the very role this
       * script exists to fix. grantTrackerPermission.ts checked view for
       * exactly this reason; this had drifted from that and checked existence
       * instead, which is why a first run reported "0 of 2 roles updated"
       * against a role that could reach none of the three.
       */
      if (perms[mod]?.view) continue; // already granted — theirs to keep
      role.set(`permissions.${mod}`, fallback);
      touched = true;
    }

    if (touched) {
      await role.save();
      changed += 1;
      console.log(`  updated: ${role.roleName}`);
    }
  }

  console.log(`\n${changed} of ${roles.length} roles updated.`);
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
