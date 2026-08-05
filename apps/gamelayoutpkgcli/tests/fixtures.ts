import {
  allocateContentAddressedPath,
  createDeterministicZip,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import {
  canonicalExtensionOfEditorAssetKey,
  serializeEditorAssetsMap,
  type EditorAssetsMapEntry,
  type EditorAssetsMapV1,
} from "@slotclientengine/editorresource";
import {
  parseSceneLayoutManifest,
  type SceneLayoutManifestV1,
} from "@slotclientengine/rendercore/scene-layout";

export const text = (value: unknown): Uint8Array =>
  new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

export const fakeWebp = (seed = 0): Uint8Array =>
  new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    seed,
    0,
    0,
    0,
    0x57,
    0x45,
    0x42,
    0x50,
  ]);

export function layoutFixture(): SceneLayoutManifestV1 {
  return parseSceneLayoutManifest({
    version: 1,
    kind: "scene-layout",
    id: "fixture-layout",
    adaptation: {
      mode: "maximized-focus",
      artSize: { width: 100, height: 100 },
      focusRect: { x: 0, y: 0, width: 100, height: 100 },
      backgroundNode: "alpha-background",
    },
    nodes: [
      {
        id: "alpha-background",
        order: 0,
        resource: {
          kind: "image",
          path: "alpha.png",
          size: { width: 1, height: 1 },
        },
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
      {
        id: "beta-background",
        order: 1,
        resource: {
          kind: "image",
          path: "beta.jpg",
          size: { width: 1, height: 1 },
        },
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
      {
        id: "shared-overlay",
        order: 2,
        resource: {
          kind: "image",
          path: "shared.webp",
          size: { width: 1, height: 1 },
        },
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
    ],
    reels: {
      main: {
        columns: 1,
        rows: 1,
        cellSize: { width: 10, height: 10 },
        gap: { x: 0, y: 0 },
        placements: { default: { x: 0, y: 0 } },
      },
    },
    gameModes: {
      initialMode: "Alpha",
      modes: [
        {
          id: "Alpha",
          backgroundNodes: { default: "alpha-background" },
          nodeStates: {},
        },
        {
          id: "Beta",
          backgroundNodes: { default: "beta-background" },
          nodeStates: {},
        },
      ],
      transitions: [
        {
          from: "Alpha",
          to: "Beta",
          overlay: {
            resource: {
              kind: "video",
              path: "alpha-to-beta.mp4",
              mimeType: "video/mp4",
            },
            fit: "contain",
            fadeOutSeconds: 0.2,
          },
        },
        {
          from: "Beta",
          to: "Alpha",
          overlay: {
            resource: {
              kind: "video",
              path: "beta-to-alpha.mp4",
              mimeType: "video/mp4",
            },
            fit: "contain",
            fadeOutSeconds: 0.2,
          },
        },
      ],
    },
  });
}

export function logicalFixtureFiles(): ReadonlyMap<string, Uint8Array> {
  return new Map([
    ["alpha.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])],
    ["beta.jpg", new Uint8Array([0xff, 0xd8, 0xff, 2])],
    ["shared.webp", fakeWebp(3)],
    [
      "alpha-to-beta.mp4",
      new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]),
    ],
    [
      "beta-to-alpha.mp4",
      new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 5, 6, 7, 8]),
    ],
  ]);
}

export async function createMappedLayoutZip(
  options: {
    readonly manifest?: SceneLayoutManifestV1;
    readonly logicalFiles?: ReadonlyMap<string, Uint8Array>;
    readonly mutateMap?: (map: EditorAssetsMapV1) => EditorAssetsMapV1;
  } = {},
): Promise<Uint8Array> {
  const manifest = options.manifest ?? layoutFixture();
  const logicalFiles = options.logicalFiles ?? logicalFixtureFiles();
  const files: Record<string, EditorAssetsMapEntry> = {};
  const payloads = new Map<string, Uint8Array>();
  for (const [key, bytes] of logicalFiles) {
    const sha256 = await sha256Hex(bytes);
    const extension = canonicalExtensionOfEditorAssetKey(key);
    const path = allocateContentAddressedPath({ digest: sha256, extension });
    files[key] = {
      path,
      sha256,
      mediaType: mediaType(key),
      byteLength: bytes.byteLength,
    };
    payloads.set(path, bytes);
  }
  const initial: EditorAssetsMapV1 = {
    version: 1,
    kind: "editor-assets",
    files,
  };
  const map = options.mutateMap?.(initial) ?? initial;
  return createDeterministicZip(
    new Map([
      ...payloads,
      ["layout.manifest.json", text(manifest)] as const,
      ["assets.map.json", serializeEditorAssetsMap(map)] as const,
    ]),
    { level: 6, pathPolicy: { requireLowercase: true } },
  );
}

export function mediaType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".atlas")) return "text/plain";
  for (const extension of ["woff2", "woff", "ttf", "otf"])
    if (lower.endsWith(`.${extension}`)) return `font/${extension}`;
  throw new Error(`fixture mediaType missing: ${key}`);
}
