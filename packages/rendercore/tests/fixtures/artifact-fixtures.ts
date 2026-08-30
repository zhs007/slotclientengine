import {
  rewriteVNIProjectAssetPaths,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/data";

const encoder = new TextEncoder();

export function createTestVniProject(
  name: string,
  duration = 3,
): VNIProjectConfig {
  return rewriteVNIProjectAssetPaths(
    {
      schemaVersion: "VNI_0.087",
      editor: { name: "VNI", version: "VNI_0.087" },
      engineTarget: { name: "cocos_creator", version: "3.8.6" },
      name,
      stage: {
        width: 300,
        height: 300,
        coordinate: "center",
        duration,
        backgroundColor: "#000000",
      },
      assets: [
        {
          id: "asset-icon",
          type: "image",
          path: "assets/icon.webp",
          originalName: "icon.webp",
          width: 1,
          height: 1,
          fileWidth: 1,
          fileHeight: 1,
          fileScale: 1,
        },
      ],
      layerGroups: [
        {
          id: "group_default",
          name: "Default",
          visible: true,
          collapsed: false,
          order: 0,
        },
      ],
      layers: [
        {
          id: "layer-icon",
          name: "Icon",
          type: "image",
          assetId: "asset-icon",
          parentId: null,
          groupId: "group_default",
          visible: true,
          locked: false,
          transform: {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            anchorX: 0.5,
            anchorY: 0.5,
          },
          opacity: 1,
          blendMode: "normal",
          animations: [],
          keyframes: [],
        },
      ],
      particles: [],
      exportProfile: { id: "runtime_100", purpose: "runtime", assetScale: 1 },
      maskCompositeMode: "precompose_light_alpha",
    },
    (path) => path,
  );
}

export function createTestSpineSkeleton() {
  return {
    skeleton: { spine: "4.3.23" },
    bones: [{ name: "root" }],
    slots: [
      { name: "Number", bone: "root" },
      { name: "Value", bone: "root" },
    ],
    skins: [{ name: "default", attachments: {} }],
    animations: { Feature: {}, Idle: {}, Win: {} },
  };
}

export function createTestSpineAtlas(...pages: readonly string[]): string {
  return pages
    .map((page) => `${page}\nsize: 1,1\nfilter: Linear,Linear\n`)
    .join("\n");
}

export function encodeTestJson(value: unknown): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(value));
}
