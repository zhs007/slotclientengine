import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

// The extraction helper is a development-time Node script, not runtime TS.
// @ts-expect-error TS cannot infer declarations for the local .mjs tool.
const tool = await import("../tools/extract-editor2-assets.mjs");

describe("extract editor2 assets tool", () => {
  it("parses base64 data URLs and infers png extensions from headers", () => {
    const bytes = Buffer.from("89504e470d0a1a0a0000", "hex");
    const dataUrl = `data:application/octet-stream;base64,${bytes.toString("base64")}`;
    const parsed = tool.parseDataUrl(dataUrl);

    expect(parsed.mime).toBe("application/octet-stream");
    expect(Buffer.from(parsed.bytes).equals(bytes)).toBe(true);
    expect(tool.extensionForImage(parsed.mime, parsed.bytes)).toBe(".png");
  });
});
