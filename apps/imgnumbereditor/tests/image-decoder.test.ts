import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeImageBlob,
  decodeUploadedImage,
} from "../src/io/image-decoder.js";
import { NEUTRAL_PNG_BYTES } from "./fixtures/neutral-images.js";

describe("image decoder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes a PNG and keeps filename suggestion separate", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 8, height: 10, close })),
    );
    const result = await decodeUploadedImage(
      new File([NEUTRAL_PNG_BYTES], "0-1.png", { type: "image/png" }),
    );
    expect(result).toMatchObject({
      key: "0-1.png",
      width: 8,
      height: 10,
      suggestedCharacter: "0",
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects unsupported extensions, MIME mismatches and decode errors", async () => {
    await expect(
      decodeUploadedImage(new File([], "x.jpg", { type: "image/jpeg" })),
    ).rejects.toThrow("PNG/WebP");
    await expect(
      decodeUploadedImage(new File([], "x.png", { type: "image/webp" })),
    ).rejects.toThrow("MIME");
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("broken");
      }),
    );
    await expect(decodeImageBlob(new Blob(), "broken.png")).rejects.toThrow(
      "broken",
    );
  });

  it("accepts an omitted browser MIME and formats non-Error decode failures", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4, height: 5, close })),
    );
    await expect(
      decodeUploadedImage(new File([NEUTRAL_PNG_BYTES], "plain.png")),
    ).resolves.toMatchObject({ key: "plain.png", width: 4, height: 5 });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => Promise.reject("bitmap rejected")),
    );
    await expect(decodeImageBlob(new Blob(), "plain.png")).rejects.toThrow(
      "bitmap rejected",
    );
  });
});
