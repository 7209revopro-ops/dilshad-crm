import type { Response } from "express";
import { z } from "zod";
import { SheetSource } from "../models/SheetSource.js";
import { Lead } from "../models/Lead.js";
import { Team } from "../models/Team.js";
import { sendSuccess, sendError } from "../utils/response.js";
import type { AuthenticatedRequest } from "../types/index.js";

const createSchema = z.object({
  name:        z.string().min(1).max(100),
  sources:     z.array(z.string().min(1).max(100)).min(1, "At least one source key is required"),
  link:        z.string().url("Must be a valid URL").max(500).optional().or(z.literal("")),
  platform:    z.enum(["google", "facebook", "instagram", "meta", "whatsapp", "other"]).default("other"),
  description: z.string().max(300).optional(),
  isActive:    z.boolean().default(true),
});

const updateSchema = createSchema.partial();

async function canSeeLink(userId: string, role?: import("../types/index.js").IRole): Promise<boolean> {
  if (role?.isSystemRole && role.roleName === "Super Admin") return true;
  const team = await Team.findOne({ leaders: userId }).select("_id").lean();
  return !!team;
}

export async function listSheetSources(req: AuthenticatedRequest, res: Response) {
  try {
    const sources = await SheetSource.find().sort({ createdAt: -1 }).lean();
    const counts  = await Promise.all(
      sources.map((s) =>
        Lead.countDocuments({ source: { $in: s.sources } }),
      ),
    );

    const showLink = await canSeeLink(req.user!.userId, req.user!.role);

    const data = sources.map((s, i) => ({
      ...s,
      link: showLink ? s.link : undefined,
      totalLeads: counts[i],
    }));

    return sendSuccess(res, "Sheet sources fetched", data);
  } catch {
    return sendError(res, "Failed to fetch sheet sources", 500);
  }
}

export async function createSheetSource(req: AuthenticatedRequest, res: Response) {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 400);

    // Normalise empty link string to undefined
    const payload = { ...parsed.data, link: parsed.data.link || undefined };
    const doc = await SheetSource.create(payload);
    return sendSuccess(res, "Sheet source created", doc, 201);
  } catch (err: unknown) {
    return sendError(res, (err as Error).message ?? "Failed to create sheet source", 500);
  }
}

export async function updateSheetSource(req: AuthenticatedRequest, res: Response) {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, parsed.error.issues[0].message, 400);

    const payload = { ...parsed.data, link: parsed.data.link || undefined };
    const doc = await SheetSource.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true },
    ).lean();

    if (!doc) return sendError(res, "Sheet source not found", 404);
    return sendSuccess(res, "Sheet source updated", doc);
  } catch (err: unknown) {
    return sendError(res, (err as Error).message ?? "Failed to update sheet source", 500);
  }
}

export async function deleteSheetSource(req: AuthenticatedRequest, res: Response) {
  try {
    const doc = await SheetSource.findByIdAndDelete(req.params.id).lean();
    if (!doc) return sendError(res, "Sheet source not found", 404);
    return sendSuccess(res, "Sheet source deleted");
  } catch {
    return sendError(res, "Failed to delete sheet source", 500);
  }
}
