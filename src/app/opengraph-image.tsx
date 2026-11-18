import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "The VolSoc flag: a handshake in a heart";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The share card: the society's flag (public/volsoc-flag.png) cropped to 1200×630. */
export default async function Image() {
  const flag = await readFile(join(process.cwd(), "public/volsoc-flag.png"));
  const src = `data:image/png;base64,${flag.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#13c4c1" }}>
        <img src={src} width={1200} height={800} alt="" style={{ marginTop: -85 }} />
      </div>
    ),
    { ...size },
  );
}
