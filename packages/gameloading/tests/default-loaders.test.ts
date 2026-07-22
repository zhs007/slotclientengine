import {
  inferGameLoadingResourceKind,
  loadDefaultGameLoadingResource,
  loadGameLoadingResource,
} from "../src/index.js";

describe("game loading default loaders", () => {
  it("infers kinds from extensions after stripping query and hash", () => {
    expect(
      inferGameLoadingResourceKind({
        id: "image",
        url: "./asset.PNG?hash=1#view",
      }),
    ).toBe("image");
    expect(inferGameLoadingResourceKind({ id: "json", url: "/a/b.json" })).toBe(
      "json",
    );
    expect(inferGameLoadingResourceKind({ id: "text", url: "/a/b.yaml" })).toBe(
      "text",
    );
    expect(inferGameLoadingResourceKind({ id: "bin", url: "/a/b.atlas" })).toBe(
      "binary",
    );
    expect(inferGameLoadingResourceKind({ id: "wasm", url: "/a/b.wasm" })).toBe(
      "wasm",
    );
    expect(
      inferGameLoadingResourceKind({ id: "module", url: "/a/b.mjs" }),
    ).toBe("module");
    expect(inferGameLoadingResourceKind({ id: "style", url: "/a/b.css" })).toBe(
      "style",
    );
  });

  it("loads fetch-backed json, text, binary and wasm resources", async () => {
    const wasmBytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ]);
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes("missing")) {
        return new Response("missing", { status: 404 });
      }
      if (value.endsWith(".json")) {
        return new Response(JSON.stringify({ ok: true }));
      }
      if (value.endsWith(".txt")) {
        return new Response("hello");
      }
      if (value.endsWith(".bin")) {
        return new Response(new Uint8Array([1, 2, 3]));
      }
      if (value.endsWith(".wasm")) {
        return new Response(wasmBytes);
      }
      return new Response("missing", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loadDefaultGameLoadingResource({ id: "json", url: "/config.json" }),
    ).resolves.toEqual({ ok: true });
    await expect(
      loadDefaultGameLoadingResource({ id: "text", url: "/copy.txt" }),
    ).resolves.toBe("hello");
    await expect(
      loadDefaultGameLoadingResource({ id: "bin", url: "/mesh.bin" }),
    ).resolves.toBeInstanceOf(ArrayBuffer);
    await expect(
      loadDefaultGameLoadingResource({ id: "wasm", url: "/core.wasm" }),
    ).resolves.toBeInstanceOf(WebAssembly.Module);
    await expect(
      loadDefaultGameLoadingResource({ id: "missing", url: "/missing.json" }),
    ).rejects.toThrow(/status 404/);
  });

  it("loads image, style and module resources", async () => {
    vi.stubGlobal("Image", TestImage);
    await expect(
      loadDefaultGameLoadingResource({ id: "image", url: "/symbol.png" }),
    ).resolves.toBeInstanceOf(TestImage);

    vi.stubGlobal("Image", LoadEventImage);
    await expect(
      loadDefaultGameLoadingResource({ id: "image-load", url: "/symbol.png" }),
    ).resolves.toBeInstanceOf(LoadEventImage);

    vi.stubGlobal("Image", ErrorImage);
    await expect(
      loadDefaultGameLoadingResource({ id: "image-error", url: "/bad.png" }),
    ).rejects.toThrow(/Image loading failed/);

    const style = loadDefaultGameLoadingResource({
      id: "style",
      kind: "style",
      url: "data:text/css,body{}",
    });
    const link = document.head.querySelector("link") as HTMLLinkElement | null;
    expect(link?.href).toContain("data:text/css");
    link?.dispatchEvent(new Event("load"));
    await expect(style).resolves.toBe(link);

    await expect(
      loadDefaultGameLoadingResource({
        id: "module",
        kind: "module",
        url: "data:text/javascript,export%20const%20loaded%20%3D%207%3B",
      }),
    ).resolves.toMatchObject({ loaded: 7 });

    const badStyle = loadDefaultGameLoadingResource({
      id: "style-error",
      kind: "style",
      url: "data:text/css,bad{}",
    });
    const badLink = document.head.querySelector(
      'link[href^="data:text/css,bad"]',
    );
    badLink?.dispatchEvent(new Event("error"));
    await expect(badStyle).rejects.toThrow(/Stylesheet loading failed/);
  });

  it("fails fast for missing URLs, unknown extensions and custom loaders", async () => {
    expect(() =>
      inferGameLoadingResourceKind({ id: "bad", url: "/asset.unknown" }),
    ).toThrow(/Cannot infer/);
    await expect(loadDefaultGameLoadingResource({ id: "bad" })).rejects.toThrow(
      /requires a URL/,
    );
    await expect(
      loadGameLoadingResource(
        { id: "custom", load: () => undefined },
        {
          resource: { id: "custom" },
          loadedResources: new Map(),
          signal: new AbortController().signal,
        },
      ),
    ).resolves.toBeUndefined();
    await expect(
      loadDefaultGameLoadingResource({
        id: "bad-kind",
        kind: "bad" as never,
        url: "/asset.bad",
      }),
    ).rejects.toThrow(/Unsupported loading resource kind/);
  });

  it("passes abort signals to fetch and cancels pending image/style loaders", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const fetchAbort = new AbortController();
    void loadDefaultGameLoadingResource(
      { id: "json", url: "/config.json" },
      fetchAbort.signal,
    );
    expect(fetchMock).toHaveBeenCalledWith("/config.json", {
      signal: fetchAbort.signal,
    });

    vi.stubGlobal("Image", PendingImage);
    const imageAbort = new AbortController();
    const image = loadDefaultGameLoadingResource(
      { id: "image", url: "/image.png" },
      imageAbort.signal,
    );
    imageAbort.abort();
    await expect(image).rejects.toMatchObject({ name: "AbortError" });

    const styleAbort = new AbortController();
    const style = loadDefaultGameLoadingResource(
      { id: "style", kind: "style", url: "data:text/css,abort{}" },
      styleAbort.signal,
    );
    const link = document.head.querySelector(
      'link[href^="data:text/css,abort"]',
    );
    styleAbort.abort();
    await expect(style).rejects.toMatchObject({ name: "AbortError" });
    expect(link?.isConnected).toBe(false);
  });
});

class TestImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";

  decode(): Promise<void> {
    return Promise.resolve();
  }
}

class LoadEventImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = "";

  get src(): string {
    return this.#src;
  }

  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onload?.());
  }
}

class ErrorImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = "";

  get src(): string {
    return this.#src;
  }

  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onerror?.());
  }
}

class PendingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
}
