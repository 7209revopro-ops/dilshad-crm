/**
 * Reset every user's password to the pattern 123#<FirstName>.
 *
 *   "Neethu"        → 123#Neethu
 *   "Abrar Ahamed"  → 123#Abrar
 *
 * - Goes through the Mongoose User model so the bcrypt pre-save hook hashes
 *   each password properly.
 * - superadmin@crm.com is skipped (admin password stays unchanged).
 * - Inactive users are included.
 *
 * Usage:
 *   Dry run (prints what would change, writes nothing):
 *     MONGODB_URI="<uri>" bun run scripts/resetAllPasswords.ts
 *   Apply:
 *     MONGODB_URI="<uri>" bun run scripts/resetAllPasswords.ts --apply
 */

import mongoose from "mongoose";
import { User } from "../src/models/User.js";

const SKIP_EMAILS = new Set(["superadmin@crm.com","absharameen625@gmail.com"]);

function newPasswordFor(name: string): string {
  const first = String(name || "").trim().split(/\s+/)[0] || "user";
  const pw = `123#${first}`;
  // Model requires ≥ 8 chars — short names get the longer 12345# prefix
  return pw.length >= 8 ? pw : `12345#${first}`;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");

  await mongoose.connect(uri);
  console.log(`Connected. Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);

  const users = await User.find({}).select("name email status");
  let changed = 0;
  let skipped = 0;

  for (const user of users) {
    if (SKIP_EMAILS.has(user.email.toLowerCase())) {
      console.log(`skip   ${user.name} <${user.email}> (protected)`);
      skipped++;
      continue;
    }
    const pw = newPasswordFor(user.name);
    try {
      if (apply) {
        user.password = pw; // pre-save hook bcrypt-hashes it
        await user.save();
      }
      console.log(`${apply ? "reset " : "would "} ${user.name} <${user.email}> [${user.status}] → ${pw}`);
      changed++;
    } catch (err) {
      console.error(`FAILED ${user.name} <${user.email}>: ${(err as Error).message}`);
    }
  }

  console.log(`\n${apply ? "Reset" : "Would reset"}: ${changed} user(s), skipped: ${skipped}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
