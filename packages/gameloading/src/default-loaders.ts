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
  return loadDefaultGameLoadingResource(resource);
}

export async function loadDefaultGameLoadingResource(
  resource: GameLoadingResource,
): Promise<unknown> {
  const url = requireResourceUrl(resource);
  const kind = resource.kind ?? inferGameLoadingResourceKind(resource);
  switch (kind) {
    case "image":
      return loadImage(url);
    case "json":
      return (await fetchOk(resource, url)).json();
    case "text":
      return (await fetchOk(resource, url)).text();
    case "binary":
      return (await fetchOk(resource, url)).arrayBuffer();
    case "wasm":
      return WebAssembly.compile(
        await (await fetchOk(resource, url)).arrayBuffer(),
      );
    case "module":
      return import(/* @vite-ignore */ url);
    case "style":
      return loadStyle(url);
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
): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Loading resource "${resource.id}" failed to fetch "${url}" with status ${response.status}.`,
    );
  }
  return response;
}

function loadImage(url: string): Promise<HTMLImageElement> {
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
      callback();
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

function loadStyle(url: string): Promise<HTMLLinkElement> {
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
      callback();
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
    document.head.append(link);
  });
}

function assertNever(value: never): never {
  throw new Error(`Unsupported loading resource kind: ${String(value)}`);
}
