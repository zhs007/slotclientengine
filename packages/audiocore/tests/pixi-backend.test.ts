import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPixiSoundBackend } from "../src/core/pixi-backend.js";

const soundMocks = vi.hoisted(() => ({
  from: vi.fn(),
  library: {
    disableAutoPause: false,
    context: { audioContext: { resume: vi.fn() } },
  },
}));

const fetchMock = vi.fn();

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
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("fetches the selected playable source once and decodes a complete byte copy", async () => {
    const backend = createPixiSoundBackend();

    const prepared = await backend.prepare([
      { url: "blob:unsupported", mediaType: "audio/ogg" },
      { url: "blob:mp3", mediaType: "audio/mpeg" },
    ]);

    expect(fetchMock).toHaveBeenCalledWith("blob:mp3");
    expect(soundMocks.from).toHaveBeenCalledWith({
      source: expect.any(ArrayBuffer),
      preload: false,
    });
    expect(
      new Uint8Array(soundMocks.from.mock.calls[0]![0].source as ArrayBuffer),
    ).toEqual(new Uint8Array([1, 2, 3]));
    expect(soundMocks.library.disableAutoPause).toBe(true);
    prepared.destroy();
    expect(soundMocks.library.disableAutoPause).toBe(false);
  });

  it("fails explicitly when the browser supports none of the declared sources", async () => {
    const backend = createPixiSoundBackend();

    await expect(
      backend.prepare([{ url: "blob:unsupported", mediaType: "audio/ogg" }]),
    ).rejects.toThrow("No supported file type found");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(soundMocks.from).not.toHaveBeenCalled();
    expect(soundMocks.library.disableAutoPause).toBe(false);
  });

  it("retries one transient decode failure from a fresh byte copy", async () => {
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    soundMocks.from
      .mockReturnValueOnce({
        isLoaded: false,
        media: {
          load: (callback: (error?: Error) => void) =>
            callback(new Error("Unable to decode audio data")),
        },
        play: vi.fn(),
        stop: vi.fn(),
        destroy: firstDestroy,
      })
      .mockReturnValueOnce({
        isLoaded: false,
        media: {
          load: (callback: (error?: Error) => void) => callback(),
        },
        play: vi.fn(),
        stop: vi.fn(),
        destroy: secondDestroy,
      });
    const backend = createPixiSoundBackend();

    const prepared = await backend.prepare([
      { url: "blob:mp3", mediaType: "audio/mpeg" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(soundMocks.from).toHaveBeenCalledTimes(2);
    const firstBytes = soundMocks.from.mock.calls[0]![0].source as ArrayBuffer;
    const secondBytes = soundMocks.from.mock.calls[1]![0].source as ArrayBuffer;
    expect(firstBytes).not.toBe(secondBytes);
    expect(new Uint8Array(firstBytes)).toEqual(new Uint8Array(secondBytes));
    expect(firstDestroy).toHaveBeenCalledTimes(1);
    prepared.destroy();
    expect(secondDestroy).toHaveBeenCalledTimes(1);
    expect(soundMocks.library.disableAutoPause).toBe(false);
  });

  it("fails after two deterministic decode failures and releases both attempts", async () => {
    const destroys = [vi.fn(), vi.fn()];
    for (const destroy of destroys)
      soundMocks.from.mockReturnValueOnce({
        isLoaded: false,
        media: {
          load: (callback: (error?: Error) => void) =>
            callback(new Error("Unable to decode audio data")),
        },
        play: vi.fn(),
        stop: vi.fn(),
        destroy,
      });
    const backend = createPixiSoundBackend();

    await expect(
      backend.prepare([{ url: "blob:mp3", mediaType: "audio/mpeg" }]),
    ).rejects.toThrow(
      'Failed to decode audio source "blob:mp3" after 2 attempts: Unable to decode audio data',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(destroys[0]).toHaveBeenCalledTimes(1);
    expect(destroys[1]).toHaveBeenCalledTimes(1);
    expect(soundMocks.library.disableAutoPause).toBe(false);
  });

  it("rejects an incomplete HTTP load before asking Pixi to decode", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      arrayBuffer: vi.fn(),
    } as unknown as Response);
    const backend = createPixiSoundBackend();

    await expect(
      backend.prepare([
        { url: "https://assets.test/bgm.mp3", mediaType: "audio/mpeg" },
      ]),
    ).rejects.toThrow(
      'Failed to fetch audio source "https://assets.test/bgm.mp3": HTTP 503.',
    );

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
