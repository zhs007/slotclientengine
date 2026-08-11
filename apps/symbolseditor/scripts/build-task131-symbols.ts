import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Texture } from "pixi.js";
import { importImageStringDependencyZip } from "../src/io/image-string-dependency.js";
import {
  exportSymbolPackageZip,
  importSymbolPackageZip,
} from "../src/io/symbol-package-zip.js";
import {
  addCustomStateDefinition,
  addSymbolState,
  installImageStringDependency,
  renameImportedImageStringDependency,
  setStateVisual,
  setSymbolImageStringNodes,
} from "../src/model/editor-project.js";

const workspace = resolve(import.meta.dirname, "../../..");
const downloads = "/Users/zerro/Downloads";
const outputDirectory = resolve(workspace, "tasks/artifacts/131");
const sourceSymbols = new Uint8Array(
  await readFile(resolve(downloads, "crave-symbols-fixed.zip")),
);
const sourceImageString = new Uint8Array(
  await readFile(resolve(downloads, "crave-wl-num.zip")),
);

const importedSymbols = await importSymbolPackageZip(sourceSymbols, {
  loadTextures: false,
});
try {
  const importedDependency = await importImageStringDependencyZip(
    sourceImageString,
    {
      decodeImage: async (blob) =>
        decodePngSize(new Uint8Array(await blob.arrayBuffer())),
      loadTexture: async () => Texture.EMPTY,
    },
  );
  const dependency = renameImportedImageStringDependency(
    importedDependency,
    "wl-wm-multiplier",
  );
  installImageStringDependency(importedSymbols.project, dependency);
  const installed = importedSymbols.project.imageStringDependencies.get(
    dependency.id,
  );
  if (!installed)
    throw new Error("Task 131 ImgNumber dependency was not installed.");
  const resource = `./${installed.rootKey}`;

  for (const definition of [
    {
      id: "multStart",
      phase: "once",
      playback: "once",
      afterComplete: "return-to-default",
    },
    { id: "multIdle", phase: "stable", playback: "loop" },
    {
      id: "multEnd",
      phase: "once",
      playback: "once",
      afterComplete: "return-to-default",
    },
    {
      id: "change",
      phase: "once",
      playback: "once",
      afterComplete: "return-to-default",
    },
  ] as const) {
    addCustomStateDefinition(importedSymbols.project, definition);
    addSymbolState(importedSymbols.project, "WM", definition.id);
  }

  const wm = importedSymbols.project.symbols.get("WM");
  const wmNormal = wm?.states.get("normal");
  if (!wm || wmNormal?.kind !== "spine") {
    throw new Error(
      "Task 131 expects WM.normal to be an imported Spine visual.",
    );
  }
  for (const [state, animationName] of [
    ["multStart", "Mult_Start"],
    ["multIdle", "Mult_Idle"],
    ["multEnd", "Mult_End"],
    ["change", "Change"],
  ] as const) {
    setStateVisual(importedSymbols.project, "WM", state, {
      ...wmNormal,
      animationName,
    });
  }

  setSymbolImageStringNodes(importedSymbols.project, "WL", [
    multiplierNode(resource, ["normal", "dropdown", "appear", "win"]),
  ]);
  setSymbolImageStringNodes(importedSymbols.project, "WM", [
    multiplierNode(resource, [
      "normal",
      "dropdown",
      "appear",
      "multStart",
      "multIdle",
      "multEnd",
      "change",
    ]),
  ]);

  const editProbe = structuredClone(
    importedSymbols.project.symbols.get("WL")!.imageStringNodes,
  );
  setSymbolImageStringNodes(importedSymbols.project, "WL", [
    { ...editProbe[0]!, initialText: "x2" },
  ]);
  const edited = await exportSymbolPackageZip(importedSymbols.project, {
    loadTextures: false,
  });
  const editedImport = await importSymbolPackageZip(edited.bytes, {
    loadTextures: false,
  });
  try {
    if (
      editedImport.project.symbols.get("WL")?.imageStringNodes[0]
        ?.initialText !== "x2"
    ) {
      throw new Error(
        "Symbols Editor edit/export/reimport probe did not persist.",
      );
    }
  } finally {
    editedImport.destroy();
  }
  setSymbolImageStringNodes(importedSymbols.project, "WL", editProbe);

  const exported = await exportSymbolPackageZip(importedSymbols.project, {
    loadTextures: false,
  });
  const reimported = await importSymbolPackageZip(exported.bytes, {
    loadTextures: false,
  });
  try {
    assertTask131Symbols(reimported.project);
  } finally {
    reimported.destroy();
  }

  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, "game002-s3-symbols-task131.zip");
  await writeFile(outputPath, exported.bytes);
  process.stdout.write(
    `${JSON.stringify({
      outputPath,
      byteLength: exported.bytes.byteLength,
      sha256: createHash("sha256").update(exported.bytes).digest("hex"),
      imageStringRoot: installed.rootKey,
    })}\n`,
  );
} finally {
  importedSymbols.destroy();
}

function multiplierNode(resource: string, states: readonly string[]) {
  return {
    name: "multiplier",
    resource,
    targets: states.map((state) => ({ state, slot: "Mult" })),
    initialText: "x1",
    anchor: { x: 0.5, y: 0.5 },
    transform: { x: 0, y: 0, scale: 1 },
    followSlotColor: true,
  } as const;
}

function assertTask131Symbols(
  project: Awaited<ReturnType<typeof importSymbolPackageZip>>["project"],
): void {
  const wl = project.symbols.get("WL");
  const wm = project.symbols.get("WM");
  if (!wl || !wm) throw new Error("Task 131 Symbols ZIP is missing WL or WM.");
  if (wl.imageStringNodes[0]?.targets.length !== 4) {
    throw new Error("Task 131 WL multiplier targets were not preserved.");
  }
  if (wm.imageStringNodes[0]?.targets.length !== 7) {
    throw new Error("Task 131 WM multiplier targets were not preserved.");
  }
  for (const state of ["multStart", "multIdle", "multEnd", "change"]) {
    if (!wm.states.has(state)) {
      throw new Error(`Task 131 WM state was not preserved: ${state}.`);
    }
  }
}

function decodePngSize(bytes: Uint8Array): { width: number; height: number } {
  if (
    bytes.byteLength < 24 ||
    String.fromCharCode(...bytes.slice(1, 4)) !== "PNG"
  ) {
    throw new Error("Task 131 ImgNumber contains a non-PNG glyph.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
