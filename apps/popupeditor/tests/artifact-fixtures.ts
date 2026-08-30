const PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218,
  99, 100, 248, 15, 0, 1, 5, 1, 1, 39, 24, 227, 102, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]);

export function readPopupArtifactBytes(path: string): Uint8Array {
  if (path.endsWith(".json")) return encode(createPopupVniProject());
  if (path === "assets/a.png") return PNG.slice();
  throw new Error(`Unknown Popup Editor test fixture: ${path}.`);
}

export function readPopupArtifactJson(path: string): unknown {
  if (!path.endsWith(".json"))
    throw new Error(`Popup Editor JSON fixture expected: ${path}.`);
  return createPopupVniProject();
}

export function getPopupSpinePath(
  resource: "skeleton" | "atlas" | "texture",
): string {
  return {
    skeleton: "popup.json",
    atlas: "popup.atlas",
    texture: "popup.png",
  }[resource];
}

export function readPopupSpineBytes(
  resource: "skeleton" | "atlas" | "texture",
): Uint8Array {
  if (resource === "texture") return PNG.slice();
  if (resource === "atlas")
    return new TextEncoder().encode(
      "popup.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n",
    );
  return encode({
    skeleton: { spine: "4.3.23", width: 160, height: 160 },
    bones: [{ name: "root" }],
    slots: [],
    skins: [{ name: "default", attachments: {} }],
    animations: { Idle: {}, Win: {} },
  });
}

function createPopupVniProject() {
  return {
    schemaVersion: "VNI_0.087",
    editor: { name: "VNI", version: "VNI_0.087" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: "popup",
    stage: {
      width: 300,
      height: 300,
      coordinate: "center",
      duration: 1,
      backgroundColor: "#000000",
    },
    assets: [
      {
        id: "asset-image",
        type: "image",
        path: "assets/a.png",
        originalName: "A.png",
        width: 1,
        height: 1,
        fileWidth: 1,
        fileHeight: 1,
        fileScale: 1,
      },
    ],
    layerGroups: [
      {
        id: "group-default",
        name: "default",
        visible: true,
        collapsed: false,
        order: 0,
      },
    ],
    layers: [],
    particles: [],
    exportProfile: { id: "runtime", purpose: "runtime", assetScale: 1 },
    maskCompositeMode: "precompose_light_alpha",
  };
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
