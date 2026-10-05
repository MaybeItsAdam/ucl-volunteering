"use client";

import dynamic from "next/dynamic";

/**
 * The three.js flag, loaded only in the browser: three and R3F reach for
 * `window` at import, so the server renders nothing here and the sky gradient
 * behind it carries the first paint.
 */
export const FlagCanvas = dynamic(() => import("./UclFlag"), {
  ssr: false,
  loading: () => null,
});
