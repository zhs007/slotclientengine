import { sha256Hex } from "@slotclientengine/browserartifactio";

export type PopupFontFormat = "woff2" | "woff" | "ttf" | "otf";

export interface PopupFontHandle {
  readonly family: string;
  release(): void;
}

export type PopupFontLoader = (options: {
  readonly family: string;
  readonly bytes: Uint8Array;
  readonly format: PopupFontFormat;
}) => Promise<() => void>;

interface RegistryEntry {
  readonly promise: Promise<{
    readonly family: string;
    readonly dispose: () => void;
  }>;
  references: number;
}

const registry = new Map<string, RegistryEntry>();

export async function acquirePopupFont(options: {
  readonly bytes: Uint8Array;
  readonly path: string;
  readonly loader?: PopupFontLoader;
}): Promise<PopupFontHandle> {
  const format = validatePopupFontBytes(options.bytes, options.path);
  const digest = await sha256Hex(options.bytes);
  const key = `${digest}.${format}`;
  let entry = registry.get(key);
  if (!entry) {
    const family = `slot-popup-${digest}`;
    entry = {
      references: 0,
      promise: (options.loader ?? loadBrowserFont)({
        family,
        bytes: options.bytes.slice(),
        format,
      }).then((dispose) => ({ family, dispose })),
    };
    registry.set(key, entry);
  }
  entry.references += 1;
  try {
    const loaded = await entry.promise;
    let released = false;
    return Object.freeze({
      family: loaded.family,
      release() {
        if (released) return;
        released = true;
        releaseEntry(key, entry!, loaded.dispose);
      },
    });
  } catch (error) {
    entry.references -= 1;
    if (entry.references === 0 && registry.get(key) === entry)
      registry.delete(key);
    throw error;
  }
}

export function validatePopupFontBytes(
  bytes: Uint8Array,
  path: string,
): PopupFontFormat {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (!["woff2", "woff", "ttf", "otf"].includes(extension))
    throw new Error(`popup font extension unsupported: ${path}`);
  const signature = String.fromCharCode(...bytes.slice(0, 4));
  const valid =
    (extension === "woff2" && signature === "wOF2") ||
    (extension === "woff" && signature === "wOFF") ||
    (extension === "otf" && signature === "OTTO") ||
    (extension === "ttf" &&
      ((bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) ||
        signature === "true"));
  if (!valid) throw new Error(`popup font signature mismatch: ${path}`);
  return extension as PopupFontFormat;
}

async function loadBrowserFont(options: {
  readonly family: string;
  readonly bytes: Uint8Array;
}): Promise<() => void> {
  if (typeof FontFace !== "function" || typeof document === "undefined")
    throw new Error("Popup font loading requires browser FontFace support.");
  const source = options.bytes.slice().buffer;
  const face = await new FontFace(options.family, source).load();
  document.fonts.add(face);
  return () => document.fonts.delete(face);
}

function releaseEntry(key: string, entry: RegistryEntry, dispose: () => void) {
  entry.references -= 1;
  if (entry.references !== 0 || registry.get(key) !== entry) return;
  registry.delete(key);
  void entry.promise.then(() => dispose());
}
