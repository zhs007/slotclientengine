import { describe, expect, it, vi } from "vitest";
import {
  acquirePopupFont,
  validatePopupFontBytes,
} from "../../src/popup/font-resource.js";

describe("popup font resource", () => {
  it("validates supported font signatures and rejects mismatches", () => {
    expect(validatePopupFontBytes(bytes("wOF2"), "font.woff2")).toBe("woff2");
    expect(validatePopupFontBytes(bytes("wOFF"), "font.woff")).toBe("woff");
    expect(validatePopupFontBytes(bytes("OTTO"), "font.otf")).toBe("otf");
    expect(
      validatePopupFontBytes(new Uint8Array([0, 1, 0, 0]), "font.ttf"),
    ).toBe("ttf");
    expect(validatePopupFontBytes(bytes("true"), "font.ttf")).toBe("ttf");
    expect(() => validatePopupFontBytes(bytes("wOFF"), "font.woff2")).toThrow(
      /signature/,
    );
    expect(() => validatePopupFontBytes(bytes("wOF2"), "font.ttc")).toThrow(
      /extension/,
    );
    expect(() => validatePopupFontBytes(bytes("nope"), "font.otf")).toThrow(
      /signature/,
    );
  });

  it("deduplicates concurrent loads by hash and releases the last owner", async () => {
    const dispose = vi.fn();
    const loader = vi.fn(async () => dispose);
    const payload = bytes("wOF2");
    const [first, second] = await Promise.all([
      acquirePopupFont({ bytes: payload, path: "a.woff2", loader }),
      acquirePopupFont({ bytes: payload, path: "b.woff2", loader }),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(first.family).toBe(second.family);
    first.release();
    first.release();
    expect(dispose).not.toHaveBeenCalled();
    second.release();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("rolls back a failed load", async () => {
    const loader = vi.fn(async () => {
      throw new Error("bad font");
    });
    await expect(
      acquirePopupFont({ bytes: bytes("wOFF"), path: "a.woff", loader }),
    ).rejects.toThrow(/bad font/);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("registers and unregisters a browser FontFace with the default loader", async () => {
    const add = vi.fn();
    const remove = vi.fn(() => true);
    const load = vi.fn(async function (this: unknown) {
      return this;
    });
    class TestFontFace {
      constructor(
        readonly family: string,
        readonly source: ArrayBuffer,
      ) {}

      load() {
        return load.call(this);
      }
    }
    vi.stubGlobal("FontFace", TestFontFace);
    vi.stubGlobal("document", { fonts: { add, delete: remove } });
    try {
      const handle = await acquirePopupFont({
        bytes: new Uint8Array([...bytes("OTTO"), 1]),
        path: "browser.otf",
      });
      expect(handle.family).toMatch(/^slot-popup-/);
      expect(load).toHaveBeenCalledOnce();
      expect(add).toHaveBeenCalledOnce();
      handle.release();
      await Promise.resolve();
      expect(remove).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails explicitly when browser FontFace support is unavailable", async () => {
    vi.stubGlobal("FontFace", undefined);
    try {
      await expect(
        acquirePopupFont({
          bytes: new Uint8Array([...bytes("wOF2"), 2]),
          path: "unsupported.woff2",
        }),
      ).rejects.toThrow(/FontFace support/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function bytes(signature: string) {
  return new Uint8Array([...signature].map((value) => value.charCodeAt(0)));
}
