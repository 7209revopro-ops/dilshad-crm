/**
 * Writes today's access into every role for the modules that got a row on the
 * Roles screen on 2026-10-07 — Mentors, Commission, Leaderboard and the rest of
 * OPEN_BY_DEFAULT. Those screens were open to everyone; the schema already
 * hands a role that default while it holds no value, and this makes it a real,
 * stored value so the boxes show ticked and stay that way.
 *
 * Only roles with no stored value for a module are touched; a value someone has
 * already set is left alone. The Super Admin passes every check and is skipped.
 *
 *   bun src/scripts/grantOpenModules.ts            # dry run: lists what would change
 *   bun src/scripts/grantOpenModules.ts --write    # applies it, saves an undo file
 *   bun src/scripts/grantOpenModules.ts --undo <file>
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { OPEN_BY_DEFAULT, type ModulePermissions } from "../types/index.js";

const NONE: ModulePermissions = { view: false, create: false, edit: false, delete: false, approve: false, export: false };

/** Modules this CRM sets on every role, whatever is stored (beyond OPEN_BY_DEFAULT, which only fills gaps). */
const ALWAYS: Record<string, Partial<ModulePermissions>> = {};

type Change = { roleId: string; roleName: string; module: string; before: unknown; after: ModulePermissions };

const run = async () => {
  const args = process.argv.slice(2);
  await mongoose.connect(process.env.MONGODB_URI!, { authSource: "admin" });
  const roles = mongoose.connection.db!.collection("roles");

  const undoAt = args.indexOf("--undo");
  if (undoAt >= 0) {
    const file = args[undoAt + 1];
    if (!file) throw new Error("--undo needs the undo file");
    const changes = JSON.parse(fs.readFileSync(file, "utf8")) as Change[];
    for (const c of changes) {
      const key = `permissions.${c.module}`;
      await roles.updateOne(
        { _id: new mongoose.Types.ObjectId(c.roleId) },
        c.before === undefined ? { $unset: { [key]: "" } } : { $set: { [key]: c.before } },
      );
      console.log(`  restored ${c.roleName} · ${c.module}`);
    }
    console.log(`\n${changes.length} values restored.`);
    await mongoose.disconnect();
    return;
  }

  const write = args.includes("--write");
  const changes: Change[] = [];
  for (const role of await roles.find({}).toArray()) {
    if (role.isSystemRole && role.roleName === "Super Admin") continue;
    const perms = (role.permissions ?? {}) as Record<string, ModulePermissions | undefined>;
    for (const [module, grant] of Object.entries(OPEN_BY_DEFAULT)) {
      if (perms[module] !== undefined) continue;
      changes.push({ roleId: String(role._id), roleName: role.roleName, module, before: undefined, after: { ...NONE, ...grant } });
    }
    for (const [module, grant] of Object.entries(ALWAYS)) {
      if (changes.some((c) => c.roleId === String(role._id) && c.module === module)) continue;
      const before = perms[module];
      const after = { ...NONE, ...before, ...grant };
      if (before && Object.entries(grant).every(([a, v]) => before[a as keyof ModulePermissions] === v)) continue;
      changes.push({ roleId: String(role._id), roleName: role.roleName, module, before, after });
    }
  }

  for (const c of changes) {
    const on = Object.entries(c.after).filter(([, v]) => v).map(([a]) => a).join(", ") || "nothing";
    console.log(`  ${c.roleName.padEnd(24)} ${c.module.padEnd(14)} → ${on}`);
  }

  if (!write) {
    console.log(`\nDry run: ${changes.length} values would be set. Run again with --write to apply.`);
  } else if (changes.length) {
    const dir = path.resolve("backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `open-modules-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(file, JSON.stringify(changes, null, 2));
    for (const c of changes) {
      await roles.updateOne({ _id: new mongoose.Types.ObjectId(c.roleId) }, { $set: { [`permissions.${c.module}`]: c.after } });
    }
    console.log(`\n${changes.length} values set. Undo: bun src/scripts/grantOpenModules.ts --undo "${file}"`);
  } else {
    console.log("\nNothing to change.");
  }
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
