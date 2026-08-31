import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPixiSoundBackend } from "../src/core/pixi-backend.js";

const soundMocks = vi.hoisted(() => ({
  from: vi.fn(),
  library: {
    disableAutoPause: false,
    context: { audioContext: { resume: vi.fn() } },
  },
}));

vi.mock("@pixi/sound", () => ({
  Sound: { from: soundMocks.from },
  sound: soundMocks.library,
}));

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  focused = true;
  readonly createElement = vi.fn(() => ({
    canPlayType: (mediaType: string) =>
      mediaType === "audio/mpeg" ? "probably" : "",
  }));
  hasFocus(): boolean {
    return this.focused;
  }
}

describe("Pixi sound backend", () => {
  let browserWindow: EventTarget;
  let browserDocument: FakeDocument;

  beforeEach(() => {
    soundMocks.from.mockReset();
    soundMocks.library.disableAutoPause = false;
    soundMocks.library.context.audioContext.resume.mockReset();
    soundMocks.from.mockReturnValue({
      isLoaded: true,
      play: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    });
    browserWindow = new EventTarget();
    browserDocument = new FakeDocument();
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("document", browserDocument);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("selects a playable typed source and passes its extensionless URL directly", async () => {
    const backend = createPixiSoundBackend();

    const prepared = await backend.prepare([
      { url: "blob:unsupported", mediaType: "audio/ogg" },
      { url: "blob:mp3", mediaType: "audio/mpeg" },
    ]);

    expect(soundMocks.from).toHaveBeenCalledWith({
      url: "blob:mp3",
      preload: false,
    });
    expect(soundMocks.library.disableAutoPause).toBe(true);
    prepared.destroy();
    expect(soundMocks.library.disableAutoPause).toBe(false);
  });

  it("fails explicitly when the browser supports none of the declared sources", async () => {
    const backend = createPixiSoundBackend();

    await expect(
      backend.prepare([{ url: "blob:unsupported", mediaType: "audio/ogg" }]),
    ).rejects.toThrow("No supported file type found");
    expect(soundMocks.from).not.toHaveBeenCalled();
    expect(soundMocks.library.disableAutoPause).toBe(false);
  });

  it("publishes one composed activity state from focus, visibility, and page lifecycle", () => {
    const backend = createPixiSoundBackend();
    const states: string[] = [];
    const dispose = backend.observeActivity((state) => states.push(state));
    expect(backend.getActivityState()).toBe("active");

    browserWindow.dispatchEvent(new Event("blur"));
    browserDocument.visibilityState = "hidden";
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    browserWindow.dispatchEvent(new Event("focus"));
    expect(states).toEqual(["suspended"]);

    browserDocument.visibilityState = "visible";
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    browserWindow.dispatchEvent(new Event("pagehide"));
    browserWindow.dispatchEvent(new Event("pageshow"));
    expect(states).toEqual(["suspended", "active", "suspended", "active"]);

    dispose();
    browserWindow.dispatchEvent(new Event("blur"));
    expect(states).toEqual(["suspended", "active", "suspended", "active"]);
  });

  it("restores Pixi auto-pause only after the final prepared sound releases it", async () => {
    const firstBackend = createPixiSoundBackend();
    const secondBackend = createPixiSoundBackend();
    const source = [{ url: "blob:mp3", mediaType: "audio/mpeg" }] as const;
    const first = await firstBackend.prepare(source);
    const second = await secondBackend.prepare(source);
    expect(soundMocks.library.disableAutoPause).toBe(true);

    first.destroy();
    expect(soundMocks.library.disableAutoPause).toBe(true);
    second.destroy();
    expect(soundMocks.library.disableAutoPause).toBe(false);
  });
});
