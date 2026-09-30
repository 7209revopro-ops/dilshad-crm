import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
/** Query strings arrive as "" when a filter is cleared — that means "no filter". */
const optionalQuery = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? undefined : v), schema.optional());
const paging = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

// POST /activity/heartbeat — sent every minute by the web app
export const heartbeatSchema = z.object({ active: z.boolean() }).strict();

// GET /activity/people
export const peopleQuery = z.object({
  search: optionalQuery(z.string().trim().max(100)),
  teamId: optionalQuery(objectId),
});

// GET /activity/logins
export const loginEventsQuery = z
  .object({
    ...paging,
    userId: optionalQuery(objectId),
    kind: optionalQuery(z.enum(["login", "login_failed", "logout"])),
    from: optionalQuery(z.coerce.date()),
    to: optionalQuery(z.coerce.date()),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: "'from' must be before 'to'", path: ["from"] });

// GET /activity/idle
export const idleStretchesQuery = z.object({
  ...paging,
  userId: optionalQuery(objectId),
});
