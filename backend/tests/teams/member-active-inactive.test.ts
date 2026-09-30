/**
 * Team Member Active / Inactive — Auto-Assign Flow
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests every scenario involving the toggle-active flag and how it affects
 * the auto-assign lead distribution engine.
 *
 * The pool is leaders + members, not members alone. That changed in Aug 2026
 * ("include leaders in Split Now and batch preview pools") so that pressing
 * Split Now gives the same answer as the scheduled split at the end of the day.
 * A leader can be deactivated like anybody else, which is what emptying the
 * pool now takes.
 *
 * Endpoint coverage:
 *   PATCH  /teams/:id/members/:memberId/toggle-active   (activate / deactivate)
 *   POST   /teams/:id/auto-assign                       (distribute leads)
 *   GET    /teams/:id                                   (verify inactiveMembers)
 *   GET    /leads/:id                                   (verify assignee)
 *
 * Test Matrix
 * ────────────────────────────────────────────────────────────────────────────
 *  #   Scenario                                                     Expected
 *  ─   ─────────────────────────────────────────────────────────────────────
 *  1   Toggle member → inactive                                     200, in inactiveMembers
 *  2   Inactive member excluded from auto-assign                    200, 0 leads to inactive
 *  3   Re-activate member                                           200, NOT in inactiveMembers
 *  4   Re-activated member included again                           200, receives leads
 *  5   Toggle idempotency (toggle twice = back to original)         200, state restored
 *  6   Everybody deactivated, leader included → auto-assign fails   400
 *  7   Deactivate 2 members → leads split between leader and the 1  200
 *  8   Leader still receives when every regular member is off       200, all to the leader
 *  9   Non-member toggle → 400                                      400
 * 10   Toggle without token → 401                                   401
 * 11   Full cycle: inactive → assign → reactivate → reassign        split matches pool size
 * 12   Toggle already-inactive member re-activates (idempotent)     200, removed from list
 * 13   Multiple simultaneous inactive toggles work correctly        200
 * 14   Load-balance: inactive excluded, active get even split       equal distribution
 * 15   inactiveMembers list reflects correct count after toggles    count === deactivated
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { api }                  from "../helpers/auth.js";
import {
  createTestTeam,  deleteTestTeam,
  createTestLead,  deleteTestLeads,
  getLeadAssignee, unassignLead,
  type CreatedTeam, type CreatedLead,
} from "../helpers/factory.js";
import { createTestCast, deleteTestPeople, type TestPerson } from "../helpers/people.js";
import { expectNothingFor, expectSplitAcross } from "../helpers/split.js";

// ─── Shared state ─────────────────────────────────────────────────────────────

let team:    CreatedTeam;
let leads:   CreatedLead[];
let leadIds: string[];

let cast: { leader: TestPerson; members: TestPerson[]; outsider: TestPerson; all: TestPerson[] };

let M1:       string;   // active member 1
let M2:       string;   // active member 2
let M3:       string;   // active member 3
let LEADER:   string;   // team leader — receives leads like everybody else
let OUTSIDER: string;   // not in this team at all
/** Everyone who receives leads when nobody is deactivated. */
let POOL:     string[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function toggle(memberId: string): Promise<Response> {
  return api(`/teams/${team._id}/members/${memberId}/toggle-active`, { method: "PATCH" });
}

async function autoAssign(leadIdsOverride?: string[]): Promise<Response> {
  return api(`/teams/${team._id}/auto-assign`, {
    method: "POST",
    body:   JSON.stringify(leadIdsOverride ? { leadIds: leadIdsOverride } : {}),
  });
}

async function getInactiveMembers(): Promise<string[]> {
  const res  = await api(`/teams/${team._id}`);
  const json = (await res.json()) as {
    data: { inactiveMembers: ({ _id?: string } | string)[] }
  };
  return (json.data.inactiveMembers ?? []).map((m) =>
    typeof m === "string" ? m : ((m as { _id?: string })._id ?? String(m))
  );
}

/** Ensure everybody in the pool is active (called in afterEach to isolate tests) */
async function reactivateAll(): Promise<void> {
  const inactive = await getInactiveMembers();
  await Promise.all(inactive.map((id) => toggle(id)));
}

async function resetLeads(): Promise<void> {
  await Promise.all(leadIds.map(unassignLead));
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // People of our own, so this suite runs against any deployment rather than
  // only the one whose user ids used to be pasted into config.ts.
  cast = await createTestCast(3);
  [M1, M2, M3] = cast.members.map((m) => m._id);
  LEADER   = cast.leader._id;
  OUTSIDER = cast.outsider._id;
  POOL     = [LEADER, M1, M2, M3];

  team = await createTestTeam({
    name:    "[TEST] ActiveInactive Suite",
    leaders: [LEADER],
    members: [M1, M2, M3],
  });

  // 6 leads — 2 per member when all 3 are active
  leads = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      createTestLead({ name: `[TEST] AI-Lead ${i + 1}`, teamId: team._id, assignedTo: null })
    )
  );
  leadIds = leads.map((l) => l._id);

  console.log(`\n✅ Setup: team=${team._id}  leads=${leadIds.length}`);
});

afterAll(async () => {
  await reactivateAll();
  await deleteTestLeads(leadIds);
  await deleteTestTeam(team._id);
  await deleteTestPeople(cast.all);
  console.log("\n🧹 Cleanup complete");
});

afterEach(async () => {
  // Isolate each test: restore member state + unassign all leads
  await reactivateAll();
  await resetLeads();
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP 1 — Toggle Active / Inactive
// ═════════════════════════════════════════════════════════════════════════════

describe("PATCH /teams/:id/members/:memberId/toggle-active", () => {

  it("T01 › deactivating a member adds them to inactiveMembers list", async () => {
    const res = await toggle(M1);
    expect(res.status).toBe(200);

    const inactive = await getInactiveMembers();
    expect(inactive).toContain(M1);
  });

  it("T02 › re-activating a member removes them from inactiveMembers list", async () => {
    await toggle(M1);            // deactivate
    const res = await toggle(M1); // re-activate
    expect(res.status).toBe(200);

    const inactive = await getInactiveMembers();
    expect(inactive).not.toContain(M1);
  });

  it("T03 › toggle is idempotent — toggle twice = back to original state", async () => {
    const before = await getInactiveMembers();

    await toggle(M2);   // deactivate
    await toggle(M2);   // re-activate

    const after = await getInactiveMembers();
    expect(after).toEqual(before);
  });

  it("T04 › deactivating multiple members lists all in inactiveMembers", async () => {
    await toggle(M1);
    await toggle(M2);

    const inactive = await getInactiveMembers();
    expect(inactive).toContain(M1);
    expect(inactive).toContain(M2);
    expect(inactive).not.toContain(M3);
    expect(inactive.length).toBe(2);
  });

  it("T05 › inactiveMembers count is accurate after partial deactivation", async () => {
    await toggle(M3);
    const inactive = await getInactiveMembers();
    expect(inactive.length).toBe(1);
    expect(inactive[0]).toBe(M3);
  });

  it("T06 › cannot toggle a user who is not a member of the team → 400", async () => {
    const res = await toggle(OUTSIDER);
    expect(res.status).toBe(400);
  });

  it("T07 › returns 401 when request has no auth token", async () => {
    const res = await api(
      `/teams/${team._id}/members/${M1}/toggle-active`,
      { method: "PATCH" },
      false,
    );
    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP 2 — Auto-Assign Respects Inactive Members
// ═════════════════════════════════════════════════════════════════════════════

describe("POST /teams/:id/auto-assign — inactive member exclusion", () => {

  it("T08 › inactive member receives ZERO leads during auto-assign", async () => {
    await toggle(M1);  // deactivate M1

    const res  = await autoAssign();
    const json = (await res.json()) as {
      data: { assigned: number; results: { assignedTo: string }[] }
    };

    expect(res.status).toBe(200);
    expect(json.data.assigned).toBe(6);

    const receivedM1 = json.data.results.some((r) => r.assignedTo === M1);
    expect(receivedM1).toBe(false);
  });

  it("T09 › with 1 member inactive: the leader and the other 2 split the leads", async () => {
    await toggle(M1);  // deactivate M1 — the leader, M2 and M3 remain

    const res  = await autoAssign();
    const json = (await res.json()) as {
      data: { results: { assignedTo: string }[] }
    };
    expect(res.status).toBe(200);

    expectNothingFor(json.data.results, [M1]);
    expectSplitAcross(json.data.results, [LEADER, M2, M3]);
  });

  it("T10 › with 2 members inactive: the leader and the remaining member share them", async () => {
    await toggle(M1);
    await toggle(M2);
    // The leader and M3 remain

    const res  = await autoAssign();
    const json = (await res.json()) as {
      data: { assigned: number; results: { assignedTo: string }[] }
    };
    expect(res.status).toBe(200);
    expect(json.data.assigned).toBe(6);

    expectNothingFor(json.data.results, [M1, M2]);
    expectSplitAcross(json.data.results, [LEADER, M3]);
  });

  it("T11 › everybody inactive, the leader included → auto-assign returns 400", async () => {
    // Deactivating the three members is no longer enough to empty the pool:
    // the leader is in it, and has to be deactivated too.
    for (const id of POOL) await toggle(id);

    const res  = await autoAssign();
    const json = (await res.json()) as { success: boolean; message: string };

    expect(res.status).toBe(400);
    expect(json.message.toLowerCase()).toContain("inactive");
  });

  it("T12 › with every regular member inactive, the leader takes the lot", async () => {
    // The leader is a member of the pool, so a team whose regular members are
    // all off still has somebody to give work to — rather than failing, which
    // would leave the leads sitting unassigned overnight.
    await toggle(M1);
    await toggle(M2);
    await toggle(M3);

    const res  = await autoAssign();
    const json = (await res.json()) as {
      data: { assigned: number; results: { assignedTo: string }[] }
    };

    expect(res.status).toBe(200);
    expect(json.data.assigned).toBe(6);
    expectNothingFor(json.data.results, [M1, M2, M3]);
    expectSplitAcross(json.data.results, [LEADER]);
  });

  it("T13 › re-activating a member includes them in next auto-assign", async () => {
    await toggle(M1);  // deactivate

    // First assign — M1 excluded
    await autoAssign();
    await resetLeads();

    await toggle(M1);  // re-activate

    // Second assign — M1 should get leads now
    const res  = await autoAssign();
    const json = (await res.json()) as {
      data: { assigned: number; results: { assignedTo: string }[] }
    };
    expect(res.status).toBe(200);

    const receivedM1 = json.data.results.some((r) => r.assignedTo === M1);
    expect(receivedM1).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GROUP 3 — Full Cycle Integration Tests
// ═════════════════════════════════════════════════════════════════════════════

describe("Full cycle: toggle → assign → reactivate → reassign", () => {

  it("T14 › full cycle: deactivate one, assign, reactivate, assign again", async () => {
    // ── Round 1: deactivate M3, assign 6 leads ────────────────────────────────
    await toggle(M3);

    const r1 = await autoAssign();
    const j1 = (await r1.json()) as { data: { assigned: number; results: { assignedTo: string }[] } };

    expect(r1.status).toBe(200);
    expect(j1.data.assigned).toBe(6);

    expectNothingFor(j1.data.results, [M3]);
    expectSplitAcross(j1.data.results, [LEADER, M1, M2]);

    // ── Round 2: reactivate M3, reset, assign 6 leads ─────────────────────────
    await toggle(M3);   // reactivate
    await resetLeads();

    const r2 = await autoAssign();
    const j2 = (await r2.json()) as { data: { assigned: number; results: { assignedTo: string }[] } };

    expect(r2.status).toBe(200);
    expect(j2.data.assigned).toBe(6);

    expectSplitAcross(j2.data.results, POOL);
  });

  it("T15 › toggling same member rapidly produces correct final state", async () => {
    // Toggle M2 ON-OFF-ON-OFF → should end up inactive
    await toggle(M2);  // → inactive
    await toggle(M2);  // → active
    await toggle(M2);  // → inactive
    await toggle(M2);  // → active (final: active)

    const inactive = await getInactiveMembers();
    expect(inactive).not.toContain(M2);

    // Auto-assign should include M2
    const res  = await autoAssign();
    const json = (await res.json()) as { data: { results: { assignedTo: string }[] } };
    expect(res.status).toBe(200);

    const receivedM2 = json.data.results.some((r) => r.assignedTo === M2);
    expect(receivedM2).toBe(true);
  });

  it("T16 › sequential partial deactivations accumulate correctly", async () => {
    // Deactivate M1 then M2 sequentially
    await toggle(M1);
    let inactive = await getInactiveMembers();
    expect(inactive).toContain(M1);
    expect(inactive).not.toContain(M2);

    await toggle(M2);
    inactive = await getInactiveMembers();
    expect(inactive).toContain(M1);
    expect(inactive).toContain(M2);
    expect(inactive).not.toContain(M3);

    // Auto-assign — only M3 active
    const res  = await autoAssign();
    const json = (await res.json()) as { data: { assigned: number; results: { assignedTo: string }[] } };
    expect(res.status).toBe(200);

    expectNothingFor(json.data.results, [M1, M2]);
    expectSplitAcross(json.data.results, [LEADER, M3]);
  });

  it("T17 › specific leadIds auto-assign still respects inactive exclusion", async () => {
    await toggle(M1);  // deactivate M1

    // Only assign 2 specific leads
    const targetIds = [leadIds[0], leadIds[1]];
    const res  = await autoAssign(targetIds);
    const json = (await res.json()) as {
      data: { assigned: number; results: { leadId: string; assignedTo: string }[] }
    };

    expect(res.status).toBe(200);
    expect(json.data.assigned).toBe(2);

    // Neither lead should be assigned to M1
    const receivedM1 = json.data.results.some((r) => r.assignedTo === M1);
    expect(receivedM1).toBe(false);

    // Both leads go to somebody still standing
    json.data.results.forEach((r) => {
      expect([LEADER, M2, M3]).toContain(r.assignedTo);
    });
  });
});
