import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Holdsight";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  // next/og can't use next/font, so the wordmark font ships as a repo asset.
  const anta = await readFile(
    join(process.cwd(), "src/app/_fonts/Anta-Regular.ttf"),
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          color: "#ffffff",
          fontFamily: "Anta",
          fontSize: 140,
          letterSpacing: "-0.02em",
        }}
      >
        Holdsight
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Anta", data: anta, style: "normal", weight: 400 }],
    },
  );
}
