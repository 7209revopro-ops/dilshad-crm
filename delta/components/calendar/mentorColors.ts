/**
 * A colour per chosen mentor, written out in full: Tailwind only builds the
 * classes it can read in the source, so they cannot be pieced together.
 */
export const MENTOR_COLORS = ["emerald", "sky", "fuchsia", "orange", "teal"] as const;
export type MentorColor = (typeof MENTOR_COLORS)[number];

/** Free time in the LMS. */
export const MENTOR_FREE_CLASS: Record<MentorColor, string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/15",
  sky: "border-sky-500/30 bg-sky-500/15",
  fuchsia: "border-fuchsia-500/30 bg-fuchsia-500/15",
  orange: "border-orange-500/30 bg-orange-500/15",
  teal: "border-teal-500/30 bg-teal-500/15",
};

/** The dot in the legend. */
export const MENTOR_DOT_CLASS: Record<MentorColor, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  fuchsia: "bg-fuchsia-500",
  orange: "bg-orange-500",
  teal: "bg-teal-500",
};

export const mentorColor = (index: number): MentorColor => MENTOR_COLORS[index % MENTOR_COLORS.length];
