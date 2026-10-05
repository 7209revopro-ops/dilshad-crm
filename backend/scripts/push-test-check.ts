/**
 * Checks "Send a test notification to my devices" (POST /push/test) and the alerts a sheet lead given to somebody
 * sends (ported from the Sales CRM, the user, 2026-10-05), on a
 * scratch database, with a stand-in for the push services: web-push's one send
 * call is replaced, so nothing leaves this machine — the route's own work
 * (whose devices, how many took it, dropping the gone ones, the gap between
 * tests, who may ask) is what is checked.
 *
 *   - Case 1: a test reaches every device the person enabled, and says how many;
 *   - Case 2: a device whose subscription is gone (410) is dropped and not counted;
 *     nobody else's devices are touched;
 *   - Case 3: no device yet: 409, telling them to press Enable; a second test
 *     straight after: 429;
 *   - Case 4: not signed in: 401;
 *   - Case 5: a device registered with another VAPID key (403) is dropped; the rest still get it;
 *   - Case 6: a sheet lead given straight to somebody (as Root's split names one person) tells them at once — on the
 *     website (the live connection) and on their devices — once per batch, and nobody else.
 *
 * Run by push-test-check.sh. Scratch database only.
 */
import crypto from "node:crypto";
import { Types } from "mongoose";

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
const section = (s: string) => console.log(`\n${s}`);

// ── A stand-in for the push services: answers each device as told, and remembers what was sent ──
const pushed: string[] = [];
const payloads: string[] = [];
const answer = new Map<string, number>();
const webpush = (await import("web-push")).default;
webpush.sendNotification = (async (sub: { endpoint: string }, payload?: string | Buffer | null) => {
  const device = sub.endpoint.split("/").pop()!;
  pushed.push(device);
  payloads.push(String(payload ?? ""));
  const status = answer.get(device) ?? 201;
  if (status >= 400) throw Object.assign(new Error(`push service answered ${status}`), { statusCode: status });
  return { statusCode: status, body: "", headers: {} };
}) as typeof webpush.sendNotification;

const vapid = webpush.generateVAPIDKeys();
Object.assign(process.env, {
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  JWT_SECRET: "push-test-check-jwt",
  JWT_REFRESH_SECRET: "push-test-check-refresh",
  NODE_ENV: "test",
  RUN_SCHEDULERS: "false",
  SHEETS_API_KEY: "push-test-sheets-key",
  SUPER_ADMIN_EMAIL: "superadmin@test.local",
});

const mongoose = (await import("mongoose")).default;
await mongoose.connect(uri);
await mongoose.connection.dropDatabase();
const db = mongoose.connection.db!;
const { PushSubscription } = await import("../src/models/PushSubscription.js");
const { signAccessToken } = await import("../src/utils/jwt.js");

const role = new Types.ObjectId();
await db.collection("roles").insertOne({ _id: role, roleName: "BDE", isSystemRole: false, permissions: {} });
const people: Record<string, Types.ObjectId> = {};
for (const name of ["Theertha", "Neethu", "Newbie"]) {
  const id = new Types.ObjectId();
  await db.collection("users").insertOne({ _id: id, name, email: `${name.toLowerCase()}@test.local`, password: "x", role, status: "active" });
  people[name] = id;
}
// The sheet intake's reporter: the Super Admin.
await db.collection("users").insertOne({ _id: new Types.ObjectId(), name: "Super Admin", email: "superadmin@test.local", password: "x", role, status: "active" });
/** A device as a browser would register it: a real P-256 key, a random secret, an endpoint at the stand-in. */
async function device(owner: string, name: string) {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  await PushSubscription.create({
    userId: people[owner],
    endpoint: `https://push.example.test/push/${name}`,
    keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") },
  });
}
await device("Theertha", "theertha-laptop");
await device("Theertha", "theertha-phone-app");
await device("Theertha", "theertha-old-browser");
await device("Neethu", "neethu-phone-app");
answer.set("theertha-old-browser", 410);

// ── The API ─────────────────────────────────────────────────────────────────
const express = (await import("express")).default;
const routes = (await import("../src/routes/index.js")).default;
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const app = express();
app.use(express.json());
app.use("/api/v1", routes);
app.use(errorHandler);
const server = app.listen(0);
const port = (server.address() as { port: number }).port;
// The live connection, as on the server: the website listens on it for "notification".
const { initSocket } = await import("../src/socket.js");
initSocket(server);
const token = (name: string) => signAccessToken({ userId: String(people[name]), email: `${name.toLowerCase()}@test.local`, roleId: String(role) });
async function test(who?: string) {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/push/test`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(who ? { authorization: `Bearer ${token(who)}` } : {}) },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as { data?: { devices?: number; delivered?: number }; message?: string } };
}

section("Case 1 — a test reaches every device the person enabled");
let r = await test("Theertha");
check("sent: 200", r.status === 200, `${r.status} ${r.body.message}`);
check("…to her laptop and her phone's app", pushed.includes("theertha-laptop") && pushed.includes("theertha-phone-app"), pushed.join(","));
check("…saying it's a test", payloads.length > 0 && payloads.every((p) => JSON.parse(p).title === "Test notification" && JSON.parse(p).data?.type === "test"));
check("…and says how many: 2 of 3 devices", r.body.data?.devices === 3 && r.body.data?.delivered === 2 && /2 of 3 devices/.test(r.body.message ?? ""), JSON.stringify(r.body));

section("Case 2 — a device that's gone, and nobody else's devices");
check("the gone device (410) is dropped", !(await PushSubscription.exists({ endpoint: { $regex: "theertha-old-browser$" } })));
check("Neethu's phone wasn't pushed", !pushed.includes("neethu-phone-app"));

section("Case 3 — no device yet, and too soon after the last test");
r = await test("Newbie");
check("no device enabled: 409, telling them to press Enable", r.status === 409 && /Enable/.test(r.body.message ?? ""), `${r.status} ${r.body.message}`);
r = await test("Theertha");
check("a second test straight after: 429", r.status === 429, `${r.status} ${r.body.message}`);

section("Case 4 — who may send one");
r = await test();
check("not signed in: 401", r.status === 401, `${r.status}`);

section("Case 5 — a device registered with another VAPID key (the keys were changed)");
await device("Neethu", "neethu-old-key");
answer.set("neethu-old-key", 403);
r = await test("Neethu");
check("the rest still get it: 1 of 2 devices", r.status === 200 && r.body.data?.devices === 2 && r.body.data?.delivered === 1, JSON.stringify(r.body));
check("the old-key device (403) is dropped — the website registers it again with the new key", !(await PushSubscription.exists({ endpoint: { $regex: "neethu-old-key$" } })));
check("…and her working device is kept", !!(await PushSubscription.exists({ endpoint: { $regex: "neethu-phone-app$" } })));

section("Case 6 — a sheet lead given straight to somebody (as Root's split names one person) tells them");
// socket.io's client comes with the website, beside this backend.
const sockIo = (await import(new URL("../../delta/node_modules/socket.io-client/build/cjs/index.js", import.meta.url).pathname)) as {
  io: (url: string, opts: object) => { connected: boolean; on: (e: string, f: (p: never) => void) => void; disconnect: () => void };
};
type Heard = { title?: string; body?: string; data?: { type?: string; count?: number } };
const live = sockIo.io(`http://127.0.0.1:${port}`, { auth: { token: token("Neethu") }, transports: ["websocket"] });
const heard: Heard[] = [];
live.on("notification", (p: Heard) => heard.push(p));
const until = async (ok: () => boolean) => { for (let i = 0; i < 50 && !ok(); i++) await new Promise((res) => setTimeout(res, 100)); };
await until(() => live.connected);
check("Neethu has the website open (its live connection)", live.connected);
pushed.length = 0;
payloads.length = 0;
const sheet = (path: string, body: unknown) => fetch(`http://127.0.0.1:${port}/api/v1/sheets/${path}`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": "push-test-sheets-key" },
  body: JSON.stringify(body),
});
const one = await sheet("sync", { full_name: "Sheet One", phone_number: "+971500000601", assigned_to: String(people.Neethu) });
check("one row, given to Neethu: taken", one.ok, `${one.status} ${await one.text()}`);
await until(() => heard.length > 0 && pushed.includes("neethu-phone-app"));
check("she is told at once on the website", heard.some((n) => n.data?.type === "lead_assigned" && /Sheet One/.test(n.body ?? "")), JSON.stringify(heard));
check("…and on her phone", pushed.includes("neethu-phone-app") && payloads.some((p) => JSON.parse(p).data?.type === "lead_assigned"), pushed.join(","));
heard.length = 0;
pushed.length = 0;
payloads.length = 0;
const batch = await sheet("sync/batch", { rows: [
  { full_name: "Sheet Two", phone_number: "+971500000602", assigned_to: String(people.Neethu) },
  { full_name: "Sheet Three", phone_number: "+971500000603", assigned_to: String(people.Neethu) },
  { full_name: "Sheet Four", phone_number: "+971500000604" },
] });
check("a batch: taken", batch.ok, `${batch.status} ${await batch.text()}`);
await until(() => heard.length > 0 && pushed.length > 0);
await new Promise((res) => setTimeout(res, 300));
check("two for her in one batch: one alert saying 2 leads, not two", heard.length === 1 && heard[0]?.data?.count === 2 && /2 Leads Assigned/.test(heard[0]?.title ?? ""), JSON.stringify(heard));
check("…on her phone too, once", pushed.filter((d) => d === "neethu-phone-app").length === 1, pushed.join(","));
check("nobody else is told about them", !pushed.some((d) => d.startsWith("theertha")), pushed.join(","));
live.disconnect();

server.close();
await mongoose.disconnect();
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
