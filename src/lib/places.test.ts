import { describe, expect, it } from "vitest";
import { extractPostcode, isPlaceless, knownPlace, lookUp, placeKey } from "./places";

describe("placeKey", () => {
  it("normalises, and ignores what's too short to mean anything", () => {
    expect(placeKey("  Cruciform   B404 ")).toBe("cruciform b404");
    expect(placeKey("x")).toBeNull();
    expect(placeKey(null)).toBeNull();
  });
});

describe("recognising places", () => {
  it("finds a postcode inside an address", () => {
    expect(extractPostcode("66 Commercial St, London e16lt")).toBe("E1 6LT");
    expect(extractPostcode("Main Quad")).toBeNull();
  });

  it("knows UCL's buildings, the specific name before plain UCL", () => {
    expect(knownPlace("Student Centre, room 3.01")).toEqual({ lat: 51.5253, lng: -0.1326 });
    expect(knownPlace("UCL Cruciform Building B404")).toEqual({ lat: 51.5242, lng: -0.135 });
    expect(knownPlace("Room 130 Foster Court")).toEqual({ lat: 51.5234, lng: -0.1328 });
    expect(knownPlace("Some hall in Hackney")).toBeNull();
  });

  it("doesn't pin online events", () => {
    expect(isPlaceless("Online (Zoom)")).toBe(true);
    expect(isPlaceless("Location TBC")).toBe(true);
    expect(isPlaceless("TBD")).toBe(true);
    expect(isPlaceless("Bloomsbury Theatre")).toBe(false);
  });
});

describe("lookUp", () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it("prefers the postcode, then a known building, and asks Nominatim last", async () => {
    const asked: string[] = [];
    const fetchImpl = (async (url: string) => {
      asked.push(new URL(url).hostname);
      if (url.includes("postcodes.io")) return json({ result: { latitude: 51.5, longitude: -0.07 } });
      return json([{ lat: "51.55", lon: "-0.1" }]);
    }) as unknown as typeof fetch;

    expect(await lookUp("Crisis Skylight, E1 6LT", fetchImpl)).toEqual({ lat: 51.5, lng: -0.07, source: "postcode" });
    expect(await lookUp("Cruciform B404", fetchImpl)).toMatchObject({ source: "known" });
    expect(await lookUp("Holloway Road Library", fetchImpl)).toEqual({ lat: 51.55, lng: -0.1, source: "nominatim" });
    expect(await lookUp("Online", fetchImpl)).toBeNull();
    expect(asked).toEqual(["api.postcodes.io", "nominatim.openstreetmap.org"]);
  });
});
