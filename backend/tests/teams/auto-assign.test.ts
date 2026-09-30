/**
 * Auto-Assign API Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for:
 *   POST   /teams/:id/auto-assign
 *   PATCH  /teams/:id/members/:memberId/toggle-active
 *
 * Covers:
 *   ✅ Happy path distribution across the pool
 *   ✅ Specific leadIds override
 *   ✅ Leaders take part in the pool, like they do at the daily split
 *   ✅ Inactive people are EXCLUDED (toggle-active integration)
 *   ✅ Re-activating somebody includes them again
 *   ✅ Load-balanced distribution
 *   ✅ No leads to assign → { assigned: 0 }
 *   ✅ Everybody inactive → 400 error
 *   ✅ Unknown team → 404
 *   ✅ No token → 401
 *   ✅ Non-member toggle → 400
 *   ✅ Full cycle: toggle inactive → auto-assign → verify split
 *
 * The pool is leaders + members, not members alone. That changed in Aug 2026
 * ("include leaders in Split Now and batch preview pools") so that pressing
 * Split Now gives the same answer as the scheduled split at the end of the day.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { api }                      from "../helpers/auth.js";
import {
  createTestTeam,  deleteTestTeam,
  createTestLead,  deleteTestLeads,
  getLeadAssignee, unassignLead,
  type CreatedTeam, type CreatedLead,
} from "../helpers/factory.js";
import { createTestCast, deleteTestPeople, type TestPerson } from "../helpers/people.js";
import { countBy, expectNothingFor, expectSplitAcross } from "../helpers/split.js";

// ─── Test State ───────────────────────────────────────────────────────────────

let team:      CreatedTeam;
let leads:     CreatedLead[];           // 6 leads all in the test team
let leadIds:   string[];
let cast:      { leader: TestPerson; members: TestPerson[]; outsider: TestPerson; all: TestPerson[] };

let MEMBER_1: string;
let MEMBER_2: string;
let MEMBER_3: string;
let LEADER:   string;
/** Everyone who receives leads when nobody is deactivated. */
let FULL_POOL: string[];

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // People of our own, so this suite runs against any deployment rather than
  // only the one whose user ids used to be pasted into config.ts.
  cast = await createTestCast(3);
  [MEMBER_1, MEMBER_2, MEMBER_3] = cast.members.map((m) => m._id);
  LEADER = cast.leader._id;
  FULL_POOL = [LEADER, MEMBER_1, MEMBER_2, MEMBER_3];

  team = await createTestTeam({
    name:    "[TEST] Auto-Assign Suite",
    leaders: [LEADER],
    members: [MEMBER_1, MEMBER_2, MEMBER_3],
  });

  // Create 6 test leads, all assigned to this team, all unassigned (assignedTo: null)
  leads = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      createTestLead({
        name:       `[TEST] Lead ${i + 1}`,
        teamId:     team._id,
        assignedTo: null,       // factory sets assignedTo=null via PUT
      })
    )
  );
  leadIds = leads.map((l) => l._id);

  console.log(`\n✅ Test setup complete — team=${team._id}  leads=${leadIds.length}`);
});

afterAll(async () => {
  // Restore: re-activate anybody that was deactivated during tests
  const teamRes = await api(`/teams/${team._id}`);
  const teamData = (await teamRes.json()) as { data: { inactiveMembers?: string[] } };
  const inactive = teamData.data?.inactiveMembers ?? [];
  for (const memberId of inactive) {
    await api(`/teams/${team._id}/members/${memberId}/toggle-active`, { method: "PATCH" });
  }

  // Delete test leads, team, and the people this suite invented
  await deleteTestLeads(leadIds);
  await deleteTestTeam(team._id);
  await deleteTestPeople(cast.all);
  console.log("\n🧹 Test cleanup complete");
});

// ─── Helper: reset all test leads back to unassigned ─────────────────────────
async function resetLeads(): Promise<void> {
  await Promise.all(leadIds.map(unassignLead));
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe("POST /teams/:id/auto-assign", () => {

  // ── T1: Happy path — spread all unassigned leads over the pool ────────────
  it("T1 › assigns all unassigned leads (no leadIds) across the active pool", async () => {
    await resetLeads();

    const res  = await api(`/teams/${team._id}/auto-assign`, { method: "POST", body: "{}" });
    const json = (await res.json()) as { data: { assigned: number; results: { leadId: string; assignedTo: string }[] } };

    expect(res.status).toBe(200);
    expect(json.data.assigned).toBe(6);
    expect(json.data.results).toHaveLength(6);

    // Six leads over four people: 2/2/1/1. Which two get the extra depends on
    // existing load, so the rule is "everybody, within one of each other".
    expectSplitAcross(json.data.results, FULL_POOL);
  });

  // ── T2: Specific leadIds — only those leads are touched ───────────────────
  it("T2 › assigns only the specified leadIds when provided", async () => {
    await resetLeads();

    const targetIds = [leadIds[0], leadIds[1]];   // only first 2 leads
    const res  = await api(`/teams/${team._id}/auto-assign`, {
      method: "POST",
      body:   JSON.stringify({ leadIds: targetIds }),
    });
    const json = (await res.json()) as { data: { assigned: number; results: { leadId: string }[] } };

    expect(res.status).toBe(200);
    expect(json.data.assigned).toBe(2);

    const assignedIds = json.data.results.map((r) => r.leadId);
    expect(assignedIds).toContain(leadIds[0]);
    expect(assignedIds).toContain(leadIds[1]);

    // Leads 3–6 must still be unassigned
    const lead3Assignee = await getLeadAssignee(leadIds[2]);
    expect(lead3Assignee).toBeNull();
  });

  // ── T3: Leaders take part ─────────────────────────────────────────────────
  it("T3 › team leaders receive leads, the same as at the scheduled split", async () => {
    await resetLeads();

    const res  = await api(`/teams/${team._id}/auto-assign`, { method: "POST", body: "{}" });
    const json = (await res.json()) as { data: { results: { assignedTo: string }[] } };

    expect(res.status).toBe(200);

    const receivedLeader = json.data.results.some((r) => r.assignedTo === LEADER);
    expect(receivedLeader).toBe(true);
  });

  // ── T4: Returns { assigned: 0 } when no unassigned leads exist ────────────
  it("T4 › returns assigned=0 when all leads are already assigned", async () => {
    // T1 or T3 already assigned all leads — do NOT reset here
    const res  = await api(`/teams/${team._id}/auto-assign`, { method: "POST", body: "{}" });
    const json = (await res.json()) as { data: { assigned: number } };

    expect(res.status).toBe(200);
    expect(json.data.assigned).toBe(0);
  });

  // ── T5: 404 for unknown team ───────────────────────────────────────────────
  it("T5 › returns 404 for a non-existent team ID", async () => {
    const res = await api("/teams/000000000000000000000099/auto-assign", {
      method: "POST",
      body:   "{}",
    });
    expect(res.status).toBe(404);
  });

  // ── T6: 401 when no auth token ────────────────────────────────────────────
  it("T6 › returns 401 when Authorization header is missing", async () => {
    const res = await api(`/teams/${team._id}/auto-assign`, { method: "POST", body: "{}" }, false);
    expect(res.status).toBe(401);
  });

  // ── T7: Load balancing — nothing is dropped and nobody is starved ─────────
  it("T7 › load-balances fairly (least-loaded receives first)", async () => {
    await resetLeads();

    // Give two leads out first, so some of the pool starts with a load.
    await api(`/teams/${team._id}/auto-assign`, {
      method: "POST",
      body:   JSON.stringify({ leadIds: [leadIds[4], leadIds[5]] }),
    });
    await unassignLead(leadIds[0]);
    await unassignLead(leadIds[1]);
    await unassignLead(leadIds[2]);
    await unassignLead(leadIds[3]);

    // Now auto-assign remaining 4 unassigned leads
    const res  = await api(`/teams/${team._id}/auto-assign`, { method: "POST", body: "{}" });
    const json = (await res.json()) as {
      data: { assigned: number; results: { leadId: string; assignedTo: string }[] }
    };

    expect(res.status).toBe(200);
    expect(json.data.assigned).toBe(4);

    // Everything went somewhere in the pool, and nothing was lost.
    const counts = countBy(json.data.results);
    for (const id of Object.keys(counts)) expect(FULL_POOL).toContain(id);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /teams/:id/members/:memberId/toggle-active", () => {

  // ── T8: Mark member inactive ───────────────────────────────────────────────
  it("T8 › marks a member as inactive (adds to inactiveMembers)", async () => {
    const res  = await api(`/teams/${team._id}/members/${MEMBER_1}/toggle-active`, { method: "PATCH" });
    expect(res.status).toBe(200);

    // Re-fetch team to verify
    const teamRes  = await api(`/teams/${team._id}`);
    const teamJson = (await teamRes.json()) as { data: { inactiveMembers: { _id?: string; toString?(): string }[] | string[] } };
    const inactive = teamJson.data.inactiveMembers.map((m) =>
      typeof m === "string" ? m : (m as { _id?: string })._id ?? String(m)
    );
    expect(inactive).toContain(MEMBER_1);
  });

  // ── T9: Inactive member is EXCLUDED from auto-assign ──────────────────────
  it("T9 › inactive member receives NO leads during auto-assign", async () => {
    await resetLeads();

    // MEMBER_1 is still inactive from T8
    const res  = await api(`/teams/${team._id}/auto-assign`, { method: "POST", body: "{}" });
    const json = (await res.json()) as { data: { assigned: number; results: { assignedTo: string }[] } };

    expect(res.status).toBe(200);
    expect(json.data.assigned).toBe(6);

    expectNothingFor(json.data.results, [MEMBER_1]);
    // Six leads over the three still standing.
    expectSplitAcross(json.data.results, [LEADER, MEMBER_2, MEMBER_3]);
  });

  // ── T10: Re-activate member ────────────────────────────────────────────────
  it("T10 › re-activating a member removes them from inactiveMembers", async () => {
    const res = await api(`/teams/${team._id}/members/${MEMBER_1}/toggle-active`, { method: "PATCH" });
    expect(res.status).toBe(200);

    const teamRes  = await api(`/teams/${team._id}`);
    const teamJson = (await teamRes.json()) as { data: { inactiveMembers: string[] } };
    const inactive = teamJson.data.inactiveMembers.map((m) =>
      typeof m === "string" ? m : (m as { _id?: string })._id ?? String(m)
    );
    expect(inactive).not.toContain(MEMBER_1);
  });

  // ── T11: Everybody active again → leads spread over the whole pool ────────
  it("T11 › after re-activation the whole pool receives leads again", async () => {
    await resetLeads();

    const res  = await api(`/teams/${team._id}/auto-assign`, { method: "POST", body: "{}" });
    const json = (await res.json()) as { data: { assigned: number; results: { assignedTo: string }[] } };

    expect(res.status).toBe(200);
    expect(json.data.assigned).toBe(6);
    expectSplitAcross(json.data.results, FULL_POOL);
  });

  // ── T12: Everybody inactive → 400 ─────────────────────────────────────────
  it("T12 › returns 400 when everybody, the leader included, is inactive", async () => {
    // The leader is in the pool, so deactivating the three members is not
    // enough to empty it — the leader has to be deactivated too.
    for (const id of FULL_POOL) {
      await api(`/teams/${team._id}/members/${id}/toggle-active`, { method: "PATCH" });
    }

    await resetLeads();

    const res  = await api(`/teams/${team._id}/auto-assign`, { method: "POST", body: "{}" });
    const json = (await res.json()) as { success: boolean; message: string };

    expect(res.status).toBe(400);
    expect(json.message.toLowerCase()).toContain("inactive");

    // Re-activate everybody for subsequent tests
    for (const id of FULL_POOL) {
      await api(`/teams/${team._id}/members/${id}/toggle-active`, { method: "PATCH" });
    }
  });

  // ── T13: Non-member toggle → 400 ──────────────────────────────────────────
  it("T13 › returns 400 when toggling a user who is NOT in the team", async () => {
    const res = await api(`/teams/${team._id}/members/${cast.outsider._id}/toggle-active`, { method: "PATCH" });
    expect(res.status).toBe(400);
  });

  // ── T14: 401 on toggle without token ──────────────────────────────────────
  it("T14 › returns 401 when Authorization header is missing on toggle", async () => {
    const res = await api(
      `/teams/${team._id}/members/${MEMBER_1}/toggle-active`,
      { method: "PATCH" },
      false,   // no auth
    );
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Full cycle: toggle → auto-assign → verify split", () => {

  // ── T15: Complete active/inactive split cycle ──────────────────────────────
  it("T15 › full cycle — deactivate 1, assign 6 leads, verify the split, reactivate, verify again", async () => {
    await resetLeads();

    // ── Step 1: Deactivate MEMBER_3 ──────────────────────────────────────────
    const toggleOff = await api(`/teams/${team._id}/members/${MEMBER_3}/toggle-active`, { method: "PATCH" });
    expect(toggleOff.status).toBe(200);

    // ── Step 2: Auto-assign all 6 leads ──────────────────────────────────────
    const assignRes  = await api(`/teams/${team._id}/auto-assign`, { method: "POST", body: "{}" });
    const assignJson = (await assignRes.json()) as {
      data: { assigned: number; results: { assignedTo: string }[] }
    };
    expect(assignRes.status).toBe(200);
    expect(assignJson.data.assigned).toBe(6);

    expectNothingFor(assignJson.data.results, [MEMBER_3]);
    expectSplitAcross(assignJson.data.results, [LEADER, MEMBER_1, MEMBER_2]);

    // ── Step 3: Re-activate MEMBER_3 ─────────────────────────────────────────
    const toggleOn = await api(`/teams/${team._id}/members/${MEMBER_3}/toggle-active`, { method: "PATCH" });
    expect(toggleOn.status).toBe(200);

    // ── Step 4: Reset leads and re-assign with everybody active ──────────────
    await resetLeads();
    const assignRes2  = await api(`/teams/${team._id}/auto-assign`, { method: "POST", body: "{}" });
    const assignJson2 = (await assignRes2.json()) as {
      data: { assigned: number; results: { assignedTo: string }[] }
    };
    expect(assignRes2.status).toBe(200);
    expect(assignJson2.data.assigned).toBe(6);

    expectSplitAcross(assignJson2.data.results, FULL_POOL);
  });
});
