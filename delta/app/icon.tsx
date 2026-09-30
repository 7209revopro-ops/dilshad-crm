import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * The Delta "d" on Remote CRM's purple (violet-600, the light-mode --primary).
 *
 * The mark is drawn as SVG with the same geometry as the wordmark's `d`: a
 * full-height stem, a ring for the bowl, and the accent dot on the bowl's left.
 * An earlier version built it from positioned divs and satori's box model put a
 * gap between the stem and the bowl — it read as "ol", not a d.
 *
 * The dot is a flat teal rather than the wordmark's gradient. At 32 pixels a
 * gradient is one colour anyway, and `defs` is the part of SVG satori is least
 * reliable about.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 7,
          background: "#7c3aed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 100 100">
          <rect x="70" y="6" width="16" height="88" rx="3" fill="#fff" />
          <circle cx="48" cy="62" r="30" fill="none" stroke="#fff" strokeWidth="16" />
          <circle cx="16" cy="62" r="15" fill="#45d6bd" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
