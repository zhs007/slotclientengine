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
const taskId = process.env.GAME002_SYMBOL_BUILD_TASK ?? "132";
if (taskId !== "132" && taskId !== "135" && taskId !== "147")
  throw new Error(`Unsupported game002 Symbols build task "${taskId}".`);
const isTask135 = taskId === "135" || taskId === "147";
const isTask147 = taskId === "147";
const outputDirectory = resolve(workspace, `tasks/artifacts/${taskId}`);
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
    throw new Error("Task 132 ImgNumber dependency was not installed.");
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
    {
      id: "feature1",
      phase: "once",
      playback: "once",
      afterComplete: "return-to-default",
    },
    {
      id: "featureChange",
      phase: "once",
      playback: "once",
      afterComplete: "return-to-default",
    },
    ...(isTask135
      ? ([
          {
            id: "feature",
            phase: "once",
            playback: "once",
            afterComplete: "return-to-default",
          },
          {
            id: "feature2",
            phase: "once",
            playback: "once",
            afterComplete: "return-to-default",
          },
        ] as const)
      : []),
  ] as const) {
    addCustomStateDefinition(importedSymbols.project, definition);
  }

  const wm = requireSpineNormal(importedSymbols.project, "WM");
  for (const [state, animationName] of [
    ["multStart", "Mult_Start"],
    ["multIdle", "Mult_Idle"],
    ["multEnd", "Mult_End"],
    ["change", "Change"],
  ] as const) {
    addSymbolState(importedSymbols.project, "WM", state);
    setStateVisual(importedSymbols.project, "WM", state, {
      ...wm,
      animationName,
    });
  }

  const cm = requireSpineNormal(importedSymbols.project, "CM");
  for (const [state, animationName] of [
    ["feature1", "Feature1"],
    ["change", "Change"],
  ] as const) {
    addSymbolState(importedSymbols.project, "CM", state);
    setStateVisual(importedSymbols.project, "CM", state, {
      ...cm,
      animationName,
    });
  }

  addSymbolState(importedSymbols.project, "CN", "featureChange");
  setStateVisual(importedSymbols.project, "CN", "featureChange", {
    kind: "activeSpine",
    animationName: "Feature_Change",
  });

  if (isTask135) {
    const co = requireSpineNormal(importedSymbols.project, "CO");
    addSymbolState(importedSymbols.project, "CO", "feature");
    setStateVisual(importedSymbols.project, "CO", "feature", {
      ...co,
      animationName: "Feature",
    });
    for (const symbol of ["WL", "H1", "H2", "L1", "L2", "L3", "L4"]) {
      const normal = requireSpineNormal(importedSymbols.project, symbol);
      for (const [state, animationName] of [
        ["feature1", "Feature1"],
        ["feature2", "Feature2"],
      ] as const) {
        addSymbolState(importedSymbols.project, symbol, state);
        setStateVisual(importedSymbols.project, symbol, state, {
          ...normal,
          animationName,
        });
      }
    }
    for (const [state, animationName] of [
      ["feature1", "Feature1"],
      ["feature2", "Feature2"],
    ] as const) {
      addSymbolState(importedSymbols.project, "CN", state);
      setStateVisual(importedSymbols.project, "CN", state, {
        kind: "activeSpine",
        animationName,
      });
    }
  }

  if (isTask147) {
    const af = requireSpineNormal(importedSymbols.project, "AF");
    for (const [state, animationName] of [
      ["feature", "Feature"],
      ["change", "Change"],
    ] as const) {
      addSymbolState(importedSymbols.project, "AF", state);
      setStateVisual(importedSymbols.project, "AF", state, {
        ...af,
        animationName,
      });
    }
  }

  setSymbolImageStringNodes(importedSymbols.project, "WL", [
    multiplierNode(resource, [
      "normal",
      "dropdown",
      "appear",
      "win",
      ...(isTask135 ? ["feature1", "feature2"] : []),
    ]),
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
  setSymbolImageStringNodes(importedSymbols.project, "CM", [
    multiplierNode(resource, [
      "normal",
      "dropdown",
      "appear",
      "feature1",
      "change",
    ]),
  ]);
  if (isTask147) {
    setSymbolImageStringNodes(importedSymbols.project, "AF", [
      freeSpinNode(resource, ["normal", "appear", "feature", "change"]),
    ]);
  }

  const editProbe = structuredClone(
    importedSymbols.project.symbols.get("CM")!.imageStringNodes,
  );
  setSymbolImageStringNodes(importedSymbols.project, "CM", [
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
      editedImport.project.symbols.get("CM")?.imageStringNodes[0]
        ?.initialText !== "x2"
    ) {
      throw new Error(
        "Symbols Editor edit/export/reimport probe did not persist.",
      );
    }
  } finally {
    editedImport.destroy();
  }
  setSymbolImageStringNodes(importedSymbols.project, "CM", editProbe);

  const exported = await exportSymbolPackageZip(importedSymbols.project, {
    loadTextures: false,
  });
  const reimported = await importSymbolPackageZip(exported.bytes, {
    loadTextures: false,
  });
  try {
    assertTask132Symbols(reimported.project);
    if (isTask135) assertTask135Symbols(reimported.project);
    if (isTask147) assertTask147Symbols(reimported.project);
  } finally {
    reimported.destroy();
  }

  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(
    outputDirectory,
    `game002-s3-symbols-task${taskId}.zip`,
  );
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

function assertTask147Symbols(
  project: Awaited<ReturnType<typeof importSymbolPackageZip>>["project"],
): void {
  const af = project.symbols.get("AF");
  const feature = af?.states.get("feature");
  const change = af?.states.get("change");
  if (
    feature?.kind !== "spine" ||
    feature.animationName !== "Feature" ||
    change?.kind !== "spine" ||
    change.animationName !== "Change"
  )
    throw new Error("Task 147 AF must bind exact Spine Feature and Change.");
  const node = af?.imageStringNodes.find(
    (candidate) => candidate.name === "free-spins",
  );
  if (
    !af ||
    !node ||
    node.initialText !== "0" ||
    node.targets.some((target) => target.slot !== "Mult")
  )
    throw new Error(
      "Task 147 AF ImgNumber must use raw digits in exact slot Mult.",
    );
}

function assertTask135Symbols(
  project: Awaited<ReturnType<typeof importSymbolPackageZip>>["project"],
): void {
  const coFeature = project.symbols.get("CO")?.states.get("feature");
  if (coFeature?.kind !== "spine" || coFeature.animationName !== "Feature")
    throw new Error("Task 135 CO feature must bind exact Spine Feature.");
  for (const symbol of ["WL", "H1", "H2", "L1", "L2", "L3", "L4"]) {
    for (const [state, animationName] of [
      ["feature1", "Feature1"],
      ["feature2", "Feature2"],
    ] as const) {
      const visual = project.symbols.get(symbol)?.states.get(state);
      if (visual?.kind !== "spine" || visual.animationName !== animationName)
        throw new Error(
          `Task 135 ${symbol}.${state} must bind exact Spine ${animationName}.`,
        );
    }
  }
  for (const [state, animationName] of [
    ["feature1", "Feature1"],
    ["feature2", "Feature2"],
  ] as const) {
    const visual = project.symbols.get("CN")?.states.get(state);
    if (
      visual?.kind !== "activeSpine" ||
      visual.animationName !== animationName
    )
      throw new Error(
        `Task 135 CN.${state} must bind exact active Spine ${animationName}.`,
      );
  }
}

function requireSpineNormal(
  project: Awaited<ReturnType<typeof importSymbolPackageZip>>["project"],
  symbol: string,
) {
  const normal = project.symbols.get(symbol)?.states.get("normal");
  if (normal?.kind !== "spine") {
    throw new Error(
      `Task 132 expects ${symbol}.normal to be an imported Spine visual.`,
    );
  }
  return normal;
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

function freeSpinNode(resource: string, states: readonly string[]) {
  return {
    name: "free-spins",
    resource,
    targets: states.map((state) => ({ state, slot: "Mult" })),
    initialText: "0",
    anchor: { x: 0.5, y: 0.5 },
    transform: { x: 0, y: 0, scale: 1 },
    followSlotColor: true,
  } as const;
}

function assertTask132Symbols(
  project: Awaited<ReturnType<typeof importSymbolPackageZip>>["project"],
): void {
  const wl = project.symbols.get("WL");
  const wm = project.symbols.get("WM");
  const cm = project.symbols.get("CM");
  const cn = project.symbols.get("CN");
  if (!wl || !wm || !cm || !cn)
    throw new Error("Task 132 Symbols ZIP is missing WL, WM, CM or CN.");
  if (wl.imageStringNodes[0]?.targets.length !== (isTask135 ? 6 : 4))
    throw new Error("Task 132 WL multiplier targets were not preserved.");
  if (wm.imageStringNodes[0]?.targets.length !== 7)
    throw new Error("Task 132 WM multiplier targets were not preserved.");
  if (cm.imageStringNodes[0]?.targets.length !== 5)
    throw new Error("Task 132 CM multiplier targets were not preserved.");
  const multiplierResources = new Set(
    [wl, wm, cm].map((symbol) => symbol.imageStringNodes[0]?.resource),
  );
  if (
    multiplierResources.size !== 1 ||
    [...multiplierResources][0] === undefined
  )
    throw new Error(
      "Task 132 WL, WM and CM must share one ImgNumber dependency.",
    );
  const multiplierResource = [...multiplierResources][0]!;
  const matchingDependencies = [
    ...project.imageStringDependencies.values(),
  ].filter((dependency) => `./${dependency.rootKey}` === multiplierResource);
  if (matchingDependencies.length !== 1)
    throw new Error(
      `Task 132 multiplier resource must resolve to one dependency; received ${matchingDependencies.length}.`,
    );
  for (const symbol of [wl, wm, cm]) {
    const node = symbol.imageStringNodes[0];
    if (!node || node.targets.some((target) => target.slot !== "Mult"))
      throw new Error(
        `Task 132 ${symbol.symbol} multiplier must use exact slot Mult.`,
      );
  }
  for (const state of ["multStart", "multIdle", "multEnd", "change"]) {
    if (!wm.states.has(state))
      throw new Error(`Task 132 WM state was not preserved: ${state}.`);
  }
  for (const state of ["feature1", "change"]) {
    if (!cm.states.has(state))
      throw new Error(`Task 132 CM state was not preserved: ${state}.`);
  }
  const feature1 = cm.states.get("feature1");
  const change = cm.states.get("change");
  if (
    feature1?.kind !== "spine" ||
    feature1.animationName !== "Feature1" ||
    change?.kind !== "spine" ||
    change.animationName !== "Change"
  )
    throw new Error("Task 132 CM exact animations were not preserved.");
  const featureChange = cn.states.get("featureChange");
  if (
    featureChange?.kind !== "activeSpine" ||
    featureChange.animationName !== "Feature_Change"
  )
    throw new Error("Task 132 CN featureChange state was not preserved.");
}

function decodePngSize(bytes: Uint8Array): { width: number; height: number } {
  if (
    bytes.byteLength < 24 ||
    String.fromCharCode(...bytes.slice(1, 4)) !== "PNG"
  ) {
    throw new Error("Task 132 ImgNumber contains a non-PNG glyph.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
