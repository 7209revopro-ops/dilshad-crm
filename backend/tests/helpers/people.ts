/**
 * The cast of people a test needs, created through the API and taken away again.
 *
 * This replaces a list of five hardcoded ObjectIds copied out of the production
 * database. Those tied the suite to one deployment's data: it could not run
 * anywhere else, and it silently stopped meaning anything the moment somebody
 * renamed or removed one of them.
 */
import { api } from "./auth.js";
import { TEST_PREFIX } from "../config.js";

export interface TestPerson {
  _id: string;
  name: string;
  email: string;
}

let roleIdPromise: Promise<string> | null = null;

/**
 * Any role will do — the suite never signs in as these people, it only needs
 * ids that can be put in a team. The first role the server reports is taken
 * rather than one created here, so the suite adds nothing it cannot remove.
 */
async function someRoleId(): Promise<string> {
  roleIdPromise ??= (async () => {
    const res = await api("/roles/all");
    if (!res.ok) throw new Error(`Could not list roles: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data: { _id: string }[] };
    const first = json.data?.[0];
    if (!first) throw new Error("The server reports no roles, so no user can be created");
    return first._id;
  })();
  return roleIdPromise;
}

let counter = 0;

export async function createTestPerson(label: string): Promise<TestPerson> {
  counter += 1;
  const stamp = `${Date.now().toString(36)}${counter}`;
  const email = `test.${label.toLowerCase().replace(/[^a-z0-9]/g, "")}.${stamp}@crm-test.invalid`;

  const res = await api("/users", {
    method: "POST",
    body: JSON.stringify({
      name: `${TEST_PREFIX} ${label}`,
      email,
      // Long, mixed, and thrown away at the end of the run. Nobody signs in as
      // these; the password exists because the endpoint requires one.
      password: `Tp${stamp}!aA9`,
      role: await someRoleId(),
      status: "active",
    }),
  });

  if (!res.ok) throw new Error(`createTestPerson(${label}) failed ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: TestPerson };
  return json.data;
}

/** A leader and `memberCount` members, in one go. */
export async function createTestCast(memberCount: number): Promise<{
  leader: TestPerson;
  members: TestPerson[];
  outsider: TestPerson;
  all: TestPerson[];
}> {
  const leader = await createTestPerson("Leader");
  const members: TestPerson[] = [];
  for (let i = 1; i <= memberCount; i++) members.push(await createTestPerson(`Member ${i}`));
  // Somebody who is in no team, for the "not a member of this team" cases.
  const outsider = await createTestPerson("Outsider");
  return { leader, members, outsider, all: [leader, ...members, outsider] };
}

export async function deleteTestPeople(people: TestPerson[]): Promise<void> {
  await Promise.allSettled(people.map((p) => api(`/users/${p._id}`, { method: "DELETE" })));
}
