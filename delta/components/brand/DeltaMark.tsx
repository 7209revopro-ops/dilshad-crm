/**
 * The Delta mark: the lowercase "d" with its accent dot.
 *
 * Drawn rather than shipped as an image. The mark appears at 20px in a sidebar
 * and 512px in an installed-app icon, and one PNG cannot be sharp at both —
 * this is the same geometry at any size, and it takes its colour from wherever
 * it is placed instead of needing a file per background.
 *
 * The geometry follows the wordmark: a full-height stem on the right, a ring
 * for the bowl at the bottom, and the dot overlapping the bowl's left edge. The
 * dot is the one part that keeps its own colour — it is what makes the mark
 * Delta's rather than any other lowercase d.
 */
export function DeltaMark({
  className,
  /** The stem and bowl. Inherits the surrounding text colour by default. */
  color = "currentColor",
  /** The accent dot. Delta's teal→green, kept even on another brand's colour. */
  dotFrom = "#2ed3c6",
  dotTo = "#7ee7a4",
  title,
}: {
  className?: string;
  color?: string;
  dotFrom?: string;
  dotTo?: string;
  title?: string;
}) {
  // A stable id per render is not needed: the gradient is identical wherever it
  // is used, so two marks on one page may share it.
  return (
    <svg viewBox="0 0 100 100" className={className} role={title ? "img" : "presentation"} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id="delta-dot" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={dotFrom} />
          <stop offset="100%" stopColor={dotTo} />
        </linearGradient>
      </defs>

      {/* The stem, full height on the right. */}
      <rect x="70" y="6" width="16" height="88" rx="3" fill={color} />

      {/* The bowl: a ring, so the counter shows the background through it. */}
      <circle cx="48" cy="62" r="30" fill="none" stroke={color} strokeWidth="16" />

      {/* The dot, overlapping the bowl's left edge as it does in the wordmark. */}
      <circle cx="16" cy="62" r="15" fill="url(#delta-dot)" />
    </svg>
  );
}
