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
      "upload-1",
    );
    expect(result).toMatchObject({
      id: "upload-1",
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
});
