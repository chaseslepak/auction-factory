import { ImageResponse } from "next/og";

/*
 * OG image — composed per cowork/ASSET_SPEC.md > "Open Graph":
 *   Bone bg. Stacked uppercase wordmark centered (REAGAN / 14px Slate Navy
 *   rule / BROOKS), letter-spacing 0.28em, EB Garamond Medium 64pt. 1pt
 *   Antique Brass hairline rule 80px below the wordmark, 240px wide.
 *
 * Statically prerendered at build time. Next emits the PNG and wires it
 * into the page's <meta property="og:image"> automatically.
 */

export const alt = "Reagan Brooks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLOR = {
  bone: "#F5F1E8",
  slateNavy: "#1C2C3E",
  antiqueBrass: "#8B6F3F",
};

/**
 * Fetch EB Garamond Medium as a static woff from the @fontsource mirror
 * on unpkg. Satori (the engine inside next/og) does not support woff2
 * — but it does support woff and TTF/OTF. The Google Fonts variable
 * TTF triggers a glyph-table parsing error in Satori, so a static
 * single-weight woff is the most reliable input.
 */
const EB_GARAMOND_500_WOFF_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/eb-garamond@latest/files/eb-garamond-latin-500-normal.woff";

async function loadEBGaramond500(): Promise<ArrayBuffer> {
  const res = await fetch(EB_GARAMOND_500_WOFF_URL);
  if (!res.ok) {
    throw new Error(`EB Garamond fetch failed: ${res.status}`);
  }
  return await res.arrayBuffer();
}

export default async function OpenGraphImage() {
  const fontData = await loadEBGaramond500();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: COLOR.bone,
          fontFamily: "EB Garamond",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            color: COLOR.slateNavy,
          }}
        >
          {/* REAGAN — line 1 of the wordmark */}
          <div
            style={{
              fontSize: 64,
              fontWeight: 500,
              letterSpacing: 18, // ~0.28em at 64px font; Satori needs absolute units
              lineHeight: 1,
              textTransform: "uppercase",
              // Compensate for trailing letter-spacing visual asymmetry.
              // 0.14em at 64px font; Satori only accepts absolute units.
              transform: "translateX(9px)",
            }}
          >
            Reagan
          </div>

          {/* Hairline rule between the two lines.
              Both words are six glyphs at the same size; width: 100% of
              the flex column makes the rule span exactly the wider line. */}
          <div
            style={{
              width: "100%",
              height: 1,
              marginTop: 22,
              marginBottom: 22,
              background: COLOR.slateNavy,
            }}
          />

          {/* BROOKS — line 2 of the wordmark */}
          <div
            style={{
              fontSize: 64,
              fontWeight: 500,
              letterSpacing: 18, // ~0.28em at 64px font; Satori needs absolute units
              lineHeight: 1,
              textTransform: "uppercase",
              // 0.14em at 64px font; Satori only accepts absolute units.
              transform: "translateX(9px)",
            }}
          >
            Brooks
          </div>
        </div>

        {/* Antique Brass hairline 80px below the wordmark, 240px wide. */}
        <div
          style={{
            width: 240,
            height: 1,
            marginTop: 80,
            background: COLOR.antiqueBrass,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "EB Garamond",
          data: fontData,
          style: "normal",
          weight: 500,
        },
      ],
    },
  );
}
