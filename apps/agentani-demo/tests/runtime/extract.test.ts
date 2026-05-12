import { describe, expect, it } from "vitest";

const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL.");
  }
  const buffer = Buffer.from(match[2], "base64");
  const extension =
    match[1] === "image/png" || buffer.subarray(0, 8).equals(pngMagic)
      ? "png"
      : "bin";
  return { mime: match[1], extension, buffer };
}

describe("base64 asset extraction", () => {
  it("resolves MIME and extension from data URL content", () => {
    const dataUrl = `data:application/octet-stream;base64,${pngMagic.toString("base64")}`;
    const parsed = parseDataUrl(dataUrl);

    expect(parsed.mime).toBe("application/octet-stream");
    expect(parsed.extension).toBe("png");
    expect(parsed.buffer).toEqual(pngMagic);
  });
});
