import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";

type FixtureZipName =
  | "roundreel.zip"
  | "megawin.zip"
  | "card-carousel-image.zip"
  | "card-carousel-sequence.zip";

interface FixtureProject {
  readonly schemaVersion: string;
  readonly name: string;
  readonly assets: readonly { readonly path: string }[];
  readonly exportProfile: {
    readonly id: string;
    readonly purpose: "editing" | "runtime";
    readonly assetScale: number;
    readonly label?: string;
  };
  readonly [key: string]: unknown;
}

const EXPORT_ROOT = join("../../docs/anieditor5/export");

export function createFixtureZip(name: FixtureZipName): Uint8Array {
  if (name === "roundreel.zip") return createRoundreelFixtureZip();
  if (name === "megawin.zip") return createMegawinFixtureZip();
  return createCardCarouselFixtureZip(
    name === "card-carousel-sequence.zip" ? "sequence" : "image",
  );
}

function createCardCarouselFixtureZip(
  layerType: "image" | "sequence",
): Uint8Array {
  const project = createSyntheticCardCarouselProject(layerType);
  const entries: Record<string, Uint8Array> = {
    "project.json": encodeJson(project),
  };
  for (const asset of project.assets) {
    entries[asset.path] = new Uint8Array([137, 80, 78, 71]);
  }
  return zipSync(entries);
}

function createSyntheticCardCarouselProject(layerType: "image" | "sequence") {
  const assets = [
    {
      id: "card-a",
      type: "image",
      path: "assets/card-a.png",
      originalName: "card-a.png",
      width: 300,
      height: 200,
    },
    {
      id: "card-b",
      type: "image",
      path: "assets/card-b.png",
      originalName: "card-b.png",
      width: 120,
      height: 360,
    },
    {
      id: "card-c",
      type: "image",
      path: "assets/card-c.png",
      originalName: "card-c.png",
      width: 480,
      height: 160,
    },
  ] as const;
  return {
    schemaVersion: "VNI_0.095",
    editor: { name: "VNI", version: "VNI_0.095" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: `synthetic-card-carousel-${layerType}`,
    exportProfile: {
      id: "runtime_100",
      purpose: "runtime" as const,
      assetScale: 1,
    },
    stage: {
      width: 1280,
      height: 720,
      coordinate: "center",
      duration: 6.1,
      backgroundColor: "#101827",
    },
    assets: layerType === "image" ? [assets[0]] : assets,
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
        id: "carousel-layer",
        name: "Card Carousel",
        type: layerType,
        assetId: layerType === "image" ? "card-a" : null,
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
        ...(layerType === "sequence"
          ? {
              sequence: {
                frameAssetIds: assets.map((asset) => asset.id),
                cycleDuration: 0.3,
                loop: true,
              },
            }
          : {}),
        animations: [
          {
            id: "carousel",
            type: "card_carousel_3d",
            startTime: 0,
            duration: 6.1,
            enabled: true,
            seed: 1,
            params: createCardCarouselParams(),
          },
        ],
        keyframes: [],
      },
    ],
    particles: [],
  };
}

function createCardCarouselParams() {
  return {
    phasePreviewMode: "full_demo",
    cardCount: 7,
    targetIndex: 2,
    rounds: 3,
    direction: 1,
    introDuration: 1.2,
    introSpeed: 0.22,
    revealDirection: 0,
    revealStagger: 0.08,
    revealOffsetX: 90,
    revealScaleFrom: 0.72,
    demoIdleDuration: 1.2,
    idleSpeed: 0.18,
    fastDuration: 1.1,
    fastSpeed: 2.8,
    accelRatio: 0.28,
    stopDuration: 1.6,
    holdDuration: 1,
    stopOvershoot: 0.18,
    finalPop: 0.12,
    finalGlow: 0.18,
    radius: 360,
    cardSpacing: 1,
    perspective: 0.72,
    slices: 12,
    visibleRange: 0.72,
    cardSize: 360,
    centerScale: 1.12,
    sideScale: 0.72,
    sideAlpha: 0.38,
    shadeStrength: 0.42,
    curve: 0.55,
    tilt: 8,
    sourceOpacity: 0,
    hideBack: true,
    keepOriginal: false,
  };
}

function createRoundreelFixtureZip(): Uint8Array {
  const runtimeProject = readFixtureProject("roundreel.json");
  const editProject = cloneProject(runtimeProject, {
    id: "edit_full",
    purpose: "editing",
    assetScale: 1,
    label: "100% 完整编辑备份",
  });
  const entries: Record<string, Uint8Array> = {
    "manifest.json": encodeJson({
      type: "vni_export_bundle",
      version: runtimeProject.schemaVersion,
      exports: [
        {
          id: "edit_full",
          purpose: "editing",
          assetScale: 1,
          path: "edit_full/roundreel.json",
          label: "100% 完整编辑备份",
        },
        {
          id: "runtime_100",
          purpose: "runtime",
          assetScale: 1,
          path: "runtime_100/roundreel.json",
          label: "100% 运行发布包",
        },
      ],
    }),
  };
  addProjectEntries(entries, "edit_full", "roundreel.json", editProject);
  addProjectEntries(entries, "runtime_100", "roundreel.json", runtimeProject);
  return zipSync(entries);
}

function createMegawinFixtureZip(): Uint8Array {
  const project = readFixtureProject("megawin.json");
  const entries: Record<string, Uint8Array> = {
    "project.json": encodeJson(project),
    "__MACOSX/._project.json": new Uint8Array([0]),
  };
  addAssetEntries(entries, "", project);
  return zipSync(entries);
}

function addProjectEntries(
  entries: Record<string, Uint8Array>,
  directory: string,
  projectFileName: string,
  project: FixtureProject,
): void {
  entries[`${directory}/${projectFileName}`] = encodeJson(project);
  addAssetEntries(entries, directory, project);
}

function addAssetEntries(
  entries: Record<string, Uint8Array>,
  directory: string,
  project: FixtureProject,
): void {
  for (const asset of project.assets) {
    const sourcePath = join(EXPORT_ROOT, asset.path);
    const entryPath = directory ? `${directory}/${asset.path}` : asset.path;
    entries[entryPath] = readFileSync(sourcePath);
  }
}

function readFixtureProject(fileName: string): FixtureProject {
  const parsed = JSON.parse(
    readFileSync(join(EXPORT_ROOT, fileName), "utf8"),
  ) as FixtureProject;
  if (!parsed.exportProfile) {
    throw new Error(`Fixture project ${fileName} is missing exportProfile.`);
  }
  return parsed;
}

function cloneProject(
  project: FixtureProject,
  exportProfile: FixtureProject["exportProfile"],
): FixtureProject {
  return JSON.parse(
    JSON.stringify({ ...project, exportProfile }),
  ) as FixtureProject;
}

function encodeJson(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value));
}
