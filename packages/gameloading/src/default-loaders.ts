import type {
  GameLoadingResource,
  GameLoadingResourceContext,
  GameLoadingResourceKind,
} from "./types.js";

const EXTENSION_KIND_MAP = Object.freeze({
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".svg": "image",
  ".avif": "image",
  ".json": "json",
  ".txt": "text",
  ".csv": "text",
  ".xml": "text",
  ".yaml": "text",
  ".yml": "text",
  ".bin": "binary",
  ".dat": "binary",
  ".atlas": "binary",
  ".wasm": "wasm",
  ".js": "module",
  ".mjs": "module",
  ".css": "style",
} satisfies Record<string, GameLoadingResourceKind>);

export async function loadGameLoadingResource(
  resource: GameLoadingResource,
  context: GameLoadingResourceContext,
): Promise<unknown> {
  if (resource.load) {
    return resource.load(context);
  }
  return loadDefaultGameLoadingResource(resource, context.signal);
}

export async function loadDefaultGameLoadingResource(
  resource: GameLoadingResource,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = requireResourceUrl(resource);
  const kind = resource.kind ?? inferGameLoadingResourceKind(resource);
  switch (kind) {
    case "image":
      return loadImage(url, signal);
    case "json":
      return (await fetchOk(resource, url, signal)).json();
    case "text":
      return (await fetchOk(resource, url, signal)).text();
    case "binary":
      return (await fetchOk(resource, url, signal)).arrayBuffer();
    case "wasm":
      return WebAssembly.compile(
        await (await fetchOk(resource, url, signal)).arrayBuffer(),
      );
    case "module":
      throwIfAborted(signal);
      return import(/* @vite-ignore */ url);
    case "style":
      return loadStyle(url, signal);
    default:
      return assertNever(kind);
  }
}

export function inferGameLoadingResourceKind(
  resource: Pick<GameLoadingResource, "id" | "url">,
): GameLoadingResourceKind {
  const url = requireResourceUrl(resource);
  const path = url.split(/[?#]/, 1)[0].toLowerCase();
  const extension = (
    Object.keys(EXTENSION_KIND_MAP) as Array<keyof typeof EXTENSION_KIND_MAP>
  ).find((candidate) => path.endsWith(candidate));
  if (!extension) {
    throw new Error(
      `Cannot infer loading resource kind for "${resource.id}" from URL "${url}".`,
    );
  }
  return EXTENSION_KIND_MAP[extension];
}

function requireResourceUrl(
  resource: Pick<GameLoadingResource, "id" | "url">,
): string {
  if (typeof resource.url !== "string" || resource.url.length === 0) {
    throw new Error(`Loading resource "${resource.id}" requires a URL.`);
  }
  return resource.url;
}

async function fetchOk(
  resource: Pick<GameLoadingResource, "id">,
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Loading resource "${resource.id}" failed to fetch "${url}" with status ${response.status}.`,
    );
  }
  return response;
}

function loadImage(
  url: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", handleAbort);
      callback();
    };
    const handleAbort = () => {
      finish(() => {
        image.src = "";
        reject(createAbortError());
      });
    };
    image.onload = () => {
      if (typeof image.decode === "function") {
        return;
      }
      finish(() => resolve(image));
    };
    image.onerror = () => {
      finish(() => reject(new Error(`Image loading failed: ${url}`)));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    image.src = url;
    if (typeof image.decode === "function") {
      void image.decode().then(
        () => finish(() => resolve(image)),
        (error) =>
          finish(() =>
            reject(
              error instanceof Error
                ? error
                : new Error(`Image decoding failed: ${url}`),
            ),
          ),
      );
    }
  });
}

function loadStyle(
  url: string,
  signal?: AbortSignal,
): Promise<HTMLLinkElement> {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      link.onload = null;
      link.onerror = null;
      signal?.removeEventListener("abort", handleAbort);
      callback();
    };
    const handleAbort = () => {
      finish(() => {
        link.remove();
        reject(createAbortError());
      });
    };
    link.rel = "stylesheet";
    link.href = url;
    link.onload = () => finish(() => resolve(link));
    link.onerror = () => {
      finish(() => {
        link.remove();
        reject(new Error(`Stylesheet loading failed: ${url}`));
      });
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    document.head.append(link);
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createAbortError(): Error {
  return new DOMException("Game loading was aborted.", "AbortError");
}

function assertNever(value: never): never {
  throw new Error(`Unsupported loading resource kind: ${String(value)}`);
}
