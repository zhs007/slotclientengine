import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPixiSoundBackend } from "../src/core/pixi-backend.js";

const soundMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@pixi/sound", () => ({
  Sound: { from: soundMocks.from },
  sound: {},
}));

describe("Pixi sound backend", () => {
  beforeEach(() => {
    soundMocks.from.mockReset();
    soundMocks.from.mockReturnValue({
      isLoaded: true,
      play: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        canPlayType: (mediaType: string) =>
          mediaType === "audio/mpeg" ? "probably" : "",
      })),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("selects a playable typed source and passes its extensionless URL directly", async () => {
    const backend = createPixiSoundBackend();

    await backend.prepare([
      { url: "blob:unsupported", mediaType: "audio/ogg" },
      { url: "blob:mp3", mediaType: "audio/mpeg" },
    ]);

    expect(soundMocks.from).toHaveBeenCalledWith({
      url: "blob:mp3",
      preload: false,
    });
  });

  it("fails explicitly when the browser supports none of the declared sources", async () => {
    const backend = createPixiSoundBackend();

    await expect(
      backend.prepare([{ url: "blob:unsupported", mediaType: "audio/ogg" }]),
    ).rejects.toThrow("No supported file type found");
    expect(soundMocks.from).not.toHaveBeenCalled();
  });
});
