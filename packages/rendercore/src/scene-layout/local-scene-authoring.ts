import type { GameConfigNumberWeightEntry } from "@slotclientengine/logiccore";
import type { SymbolPackageResource } from "../symbol/index.js";
import { SceneLayoutError } from "./errors.js";
import { upgradeSceneLayoutManifestToLatest } from "./manifest-v3.js";
import { loadSceneLayoutPackageFromZipBytes } from "./production-zip.js";
import {
  parseSlotReelPresentationProfile,
  type SlotReelPresentationProfileV1,
} from "./template-presentation.js";
import type {
  SceneLayoutPackageResource,
  SceneLayoutSymbolPackageBinding,
} from "./types.js";

export interface SceneOtherSceneFlowStepV2 {
  readonly state: string;
}

interface SceneOtherSceneFlowChoreographyBaseV2 {
  readonly id: string;
  readonly name: string;
}

export interface SceneOtherSceneFlowSpinChoreographyV2 extends SceneOtherSceneFlowChoreographyBaseV2 {
  readonly kind: "spin";
  readonly beforeSpin: SceneOtherSceneFlowStepV2;
  readonly spinning: SceneOtherSceneFlowStepV2;
  readonly stopping: readonly SceneOtherSceneFlowStepV2[];
}

export interface SceneOtherSceneFlowSequenceChoreographyV2 extends SceneOtherSceneFlowChoreographyBaseV2 {
  readonly kind: "sequence";
  readonly steps: readonly SceneOtherSceneFlowStepV2[];
}

export type SceneOtherSceneFlowChoreographyV2 =
  | SceneOtherSceneFlowSpinChoreographyV2
  | SceneOtherSceneFlowSequenceChoreographyV2;

interface SceneOtherSceneFlowSnapshotBaseV2 {
  readonly id: string;
  readonly name: string;
  readonly scene: readonly (readonly number[])[];
  readonly otherScene: readonly (readonly (number | null)[])[];
}

export interface SceneOtherSceneFlowInitialSnapshotV2 extends SceneOtherSceneFlowSnapshotBaseV2 {
  readonly kind: "initial";
}

export type SceneOtherSceneFlowCompletionPolicyV2 =
  | "all-cells-normal"
  | "first-cell-normal";

export interface SceneOtherSceneFlowStateSnapshotV2 extends SceneOtherSceneFlowSnapshotBaseV2 {
  readonly kind: "scene";
  readonly transition: "spin" | "settled";
  readonly completionPolicy: SceneOtherSceneFlowCompletionPolicyV2;
  readonly choreographies: readonly (readonly string[])[];
}

export type SceneOtherSceneFlowSnapshotV2 =
  | SceneOtherSceneFlowInitialSnapshotV2
  | SceneOtherSceneFlowStateSnapshotV2;

export interface SceneOtherSceneFlowProjectV2 {
  readonly kind: "scene-other-scene-flow";
  readonly version: 2;
  readonly spin: SlotReelPresentationProfileV1;
  readonly choreographies: readonly SceneOtherSceneFlowChoreographyV2[];
  readonly snapshots: readonly [
    SceneOtherSceneFlowInitialSnapshotV2,
    SceneOtherSceneFlowStateSnapshotV2,
    ...SceneOtherSceneFlowStateSnapshotV2[],
  ];
}

export interface SceneOtherSceneFlowPackageSummary {
  readonly kind: "scene-other-scene-flow-package-summary";
  readonly version: 1;
  readonly sha256: string;
  readonly layoutId: string;
  readonly initialMode: string | null;
  readonly columns: number;
  readonly rows: number;
  readonly renderMode: "standard" | "grid-cell";
  readonly symbolPackageId: string;
  readonly reelSet: string;
  readonly publicReels: readonly (readonly number[])[];
  readonly symbols: readonly {
    readonly code: number;
    readonly name: string;
    readonly valueCapable: boolean;
    readonly defaultValues: readonly number[];
    readonly supportedStates: readonly string[];
    readonly valueRequiredStates: readonly string[];
  }[];
  readonly states: readonly {
    readonly id: string;
    readonly phase: "stable" | "once";
    readonly playback: "loop" | "static" | "once";
  }[];
  readonly numberWeightTables: Readonly<
    Record<string, readonly GameConfigNumberWeightEntry[]>
  >;
}

export interface SceneOtherSceneFlowReadiness {
  readonly kind: "scene-other-scene-flow-readiness";
  readonly version: 1;
  readonly layout: SceneOtherSceneFlowPackageSummary;
  readonly project: SceneOtherSceneFlowProjectV2;
}

export type SceneOtherSceneBoundedRandom = (exclusiveMax: number) => number;

export function parseSceneOtherSceneFlowProject(
  input: unknown,
): SceneOtherSceneFlowProjectV2 {
  const root = strictRecord(input, "project", [
    "kind",
    "version",
    "spin",
    "choreographies",
    "snapshots",
  ]);
  if (root.kind !== "scene-other-scene-flow")
    fail('project.kind must be "scene-other-scene-flow".');
  if (root.version !== 2) fail("project.version must be 2.");
  const choreographies = array(root.choreographies, "project.choreographies");
  if (choreographies.length === 0)
    fail("project.choreographies must contain at least one item.");
  const choreographyIds = new Set<string>();
  const choreographyNames = new Set<string>();
  const parsedChoreographies = choreographies.map((value, index) => {
    const path = `project.choreographies[${index}]`;
    const record = strictRecord(value, path, [
      "kind",
      "id",
      "name",
      "beforeSpin",
      "spinning",
      "stopping",
      "steps",
    ]);
    const id = unique(
      nonBlank(record.id, `${path}.id`),
      choreographyIds,
      `${path}.id`,
    );
    const name = unique(
      nonBlank(record.name, `${path}.name`),
      choreographyNames,
      `${path}.name`,
    );
    if (record.kind === "spin") {
      if (record.steps !== undefined)
        fail(`${path}.steps is not allowed for spin choreography.`);
      return Object.freeze({
        kind: "spin" as const,
        id,
        name,
        beforeSpin: parseFlowStep(record.beforeSpin, `${path}.beforeSpin`),
        spinning: parseFlowStep(record.spinning, `${path}.spinning`),
        stopping: parseFlowSteps(record.stopping, `${path}.stopping`),
      });
    }
    if (record.kind === "sequence") {
      if (
        record.beforeSpin !== undefined ||
        record.spinning !== undefined ||
        record.stopping !== undefined
      )
        fail(`${path} sequence choreography contains spin-only fields.`);
      return Object.freeze({
        kind: "sequence" as const,
        id,
        name,
        steps: parseFlowSteps(record.steps, `${path}.steps`),
      });
    }
    fail(`${path}.kind must be "spin" or "sequence".`);
  });
  const snapshots = array(root.snapshots, "project.snapshots");
  if (snapshots.length < 2)
    fail("project.snapshots must contain at least two snapshots.");
  const snapshotIds = new Set<string>();
  const parsedSnapshots = snapshots.map((value, index) => {
    const path = `project.snapshots[${index}]`;
    const record = strictRecord(value, path, [
      "kind",
      "id",
      "name",
      "scene",
      "otherScene",
      "transition",
      "completionPolicy",
      "choreographies",
    ]);
    const scene = numberMatrix(record.scene, `${path}.scene`);
    const otherScene = optionalPositiveMatrix(
      record.otherScene,
      `${path}.otherScene`,
      scene.length,
      scene[0]!.length,
    );
    const base = {
      id: unique(nonBlank(record.id, `${path}.id`), snapshotIds, `${path}.id`),
      name: nonBlank(record.name, `${path}.name`),
      scene,
      otherScene,
    };
    if (index === 0) {
      if (record.kind !== "initial") fail(`${path}.kind must be "initial".`);
      if (
        record.transition !== undefined ||
        record.completionPolicy !== undefined ||
        record.choreographies !== undefined
      )
        fail(`${path} initial snapshot contains scene-state fields.`);
      return Object.freeze({ kind: "initial" as const, ...base });
    }
    if (record.kind !== "scene") fail(`${path}.kind must be "scene".`);
    const transition =
      index === 1
        ? exact(record.transition, "spin", `${path}.transition`)
        : exact(record.transition, "settled", `${path}.transition`);
    const completionPolicy = parseCompletionPolicy(
      record.completionPolicy,
      `${path}.completionPolicy`,
    );
    const assignments = stringMatrix(
      record.choreographies,
      `${path}.choreographies`,
      scene.length,
      scene[0]!.length,
    );
    for (const [x, column] of assignments.entries())
      for (const [y, choreographyId] of column.entries())
        if (!choreographyIds.has(choreographyId))
          fail(
            `${path}.choreographies[${x}][${y}] references unknown choreography "${choreographyId}".`,
          );
    return Object.freeze({
      kind: "scene" as const,
      ...base,
      transition,
      completionPolicy,
      choreographies: assignments,
    });
  });
  return deepFreeze({
    kind: "scene-other-scene-flow" as const,
    version: 2 as const,
    spin: parseSlotReelPresentationProfile(root.spin),
    choreographies: parsedChoreographies,
    snapshots:
      parsedSnapshots as unknown as SceneOtherSceneFlowProjectV2["snapshots"],
  });
}

export async function inspectSceneOtherSceneFlowPackage(options: {
  readonly layoutZipBytes: Uint8Array;
}): Promise<SceneOtherSceneFlowPackageSummary> {
  const [resource, sha256] = await Promise.all([
    loadSceneLayoutPackageFromZipBytes({
      zipBytes: options.layoutZipBytes,
      loadSymbolTextures: false,
    }),
    sha256Hex(options.layoutZipBytes),
  ]);
  try {
    return createPackageSummary(resource, sha256);
  } finally {
    await resource.destroy();
  }
}

export async function inspectSceneOtherSceneFlowReadiness(options: {
  readonly layoutZipBytes: Uint8Array;
  readonly expectedLayoutSha256?: string;
  readonly project: unknown;
}): Promise<SceneOtherSceneFlowReadiness> {
  const project = parseSceneOtherSceneFlowProject(options.project);
  const [resource, sha256] = await Promise.all([
    loadSceneLayoutPackageFromZipBytes({
      zipBytes: options.layoutZipBytes,
      loadSymbolTextures: false,
    }),
    sha256Hex(options.layoutZipBytes),
  ]);
  try {
    if (
      options.expectedLayoutSha256 !== undefined &&
      normalizeSha256(options.expectedLayoutSha256) !== sha256
    )
      fail(
        `Layout ZIP hash mismatch: expected ${options.expectedLayoutSha256}, received ${sha256}.`,
      );
    const summary = createPackageSummary(resource, sha256);
    validateProjectAgainstPackage(project, resource, summary);
    return deepFreeze({
      kind: "scene-other-scene-flow-readiness" as const,
      version: 1 as const,
      layout: summary,
      project,
    });
  } finally {
    await resource.destroy();
  }
}

export function createDefaultSceneOtherSceneFlowProject(options: {
  readonly summary: SceneOtherSceneFlowPackageSummary;
  readonly random?: SceneOtherSceneBoundedRandom;
}): SceneOtherSceneFlowProjectV2 {
  const random = options.random ?? secureBoundedRandom;
  const first = rollSceneFromPublicReels(options.summary, random);
  const second = rollSceneFromPublicReels(options.summary, random);
  const emptyValues = () =>
    Array.from({ length: options.summary.columns }, () =>
      Array.from({ length: options.summary.rows }, () => null),
    );
  const assignments = (id: string) =>
    Object.freeze(
      Array.from({ length: options.summary.columns }, () =>
        Object.freeze(Array.from({ length: options.summary.rows }, () => id)),
      ),
    );
  return parseSceneOtherSceneFlowProject({
    kind: "scene-other-scene-flow",
    version: 2,
    spin: defaultSpinProfile(options.summary.renderMode),
    choreographies: [
      {
        kind: "spin",
        id: "spin",
        name: "Spin",
        beforeSpin: { state: "normal" },
        spinning: { state: "spinBlur" },
        stopping: [{ state: "appear" }, { state: "normal" }],
      },
      {
        kind: "sequence",
        id: "normal",
        name: "Normal",
        steps: [{ state: "normal" }],
      },
    ],
    snapshots: [
      {
        kind: "initial",
        id: "snapshot-1",
        name: "Snapshot 1 · Initial",
        scene: first,
        otherScene: fillMissingSymbolValues({
          summary: options.summary,
          scene: first,
          otherScene: emptyValues(),
          random,
        }),
      },
      {
        kind: "scene",
        id: "snapshot-2",
        name: "Snapshot 2 · Spin Target",
        transition: "spin",
        completionPolicy: "all-cells-normal",
        scene: second,
        otherScene: fillMissingSymbolValues({
          summary: options.summary,
          scene: second,
          otherScene: emptyValues(),
          random,
        }),
        choreographies: assignments("spin"),
      },
    ],
  });
}

export function fillMissingSymbolValues(options: {
  readonly summary: SceneOtherSceneFlowPackageSummary;
  readonly scene: readonly (readonly number[])[];
  readonly otherScene: readonly (readonly (number | null)[])[];
  readonly random?: SceneOtherSceneBoundedRandom;
}): readonly (readonly (number | null)[])[] {
  assertDimensions(options.scene, options.summary, "scene");
  assertDimensions(options.otherScene, options.summary, "otherScene");
  const symbols = new Map(
    options.summary.symbols.map((symbol) => [symbol.code, symbol] as const),
  );
  const random = options.random ?? secureBoundedRandom;
  return Object.freeze(
    options.otherScene.map((column, x) =>
      Object.freeze(
        column.map((current, y) => {
          if (current !== null) return current;
          const code = options.scene[x]![y]!;
          const symbol = symbols.get(code);
          if (!symbol)
            fail(`scene[${x}][${y}] uses unknown display code ${code}.`);
          if (!symbol.valueCapable) return null;
          if (symbol.defaultValues.length === 0)
            fail(
              `Value-capable symbol "${symbol.name}" has no default values.`,
            );
          return symbol.defaultValues[
            bounded(
              random,
              symbol.defaultValues.length,
              `symbol "${symbol.name}" default value`,
            )
          ]!;
        }),
      ),
    ),
  );
}

export function rollSceneFromPublicReels(
  summary: SceneOtherSceneFlowPackageSummary,
  random: SceneOtherSceneBoundedRandom = secureBoundedRandom,
): readonly (readonly number[])[] {
  if (summary.publicReels.length !== summary.columns)
    fail("Public reel count does not match layout columns.");
  return Object.freeze(
    summary.publicReels.map((reel, x) => {
      if (reel.length === 0) fail(`Public reel ${x} is empty.`);
      const stop = bounded(random, reel.length, `public reel ${x} stop`);
      return Object.freeze(
        Array.from(
          { length: summary.rows },
          (_, y) => reel[(stop + y) % reel.length]!,
        ),
      );
    }),
  );
}

export function rollOtherSceneValues(options: {
  readonly summary: SceneOtherSceneFlowPackageSummary;
  readonly snapshot: SceneOtherSceneFlowSnapshotV2;
  readonly symbolNames?: readonly string[];
  readonly weightTableName?: string;
  readonly fixedValue?: number;
  readonly random?: SceneOtherSceneBoundedRandom;
}): readonly (readonly (number | null)[])[] {
  const selectedCodes = new Set<number>();
  for (const name of options.symbolNames ?? []) {
    const symbol = options.summary.symbols.find(
      (candidate) => candidate.name === name,
    );
    if (!symbol) fail(`Unknown symbol filter "${name}".`);
    selectedCodes.add(symbol.code);
  }
  const table = options.weightTableName
    ? options.summary.numberWeightTables[options.weightTableName]
    : undefined;
  if (options.weightTableName && !table)
    fail(`Unknown number weight table "${options.weightTableName}".`);
  if (!table && options.fixedValue === undefined)
    fail("fixedValue is required when no number weight table is selected.");
  const fixed =
    table === undefined
      ? positiveSafeInteger(options.fixedValue, "fixedValue")
      : undefined;
  const random = options.random ?? secureBoundedRandom;
  return Object.freeze(
    options.snapshot.otherScene.map((column, x) =>
      Object.freeze(
        column.map((current, y) => {
          if (
            selectedCodes.size > 0 &&
            !selectedCodes.has(options.snapshot.scene[x]![y]!)
          )
            return current;
          return table ? sampleWeightTable(table, random) : fixed!;
        }),
      ),
    ),
  );
}

export function secureSceneOtherSceneBoundedRandom(
  exclusiveMax: number,
): number {
  return secureBoundedRandom(exclusiveMax);
}

function createPackageSummary(
  resource: SceneLayoutPackageResource,
  sha256: string,
): SceneOtherSceneFlowPackageSummary {
  const geometry = resource.manifest.main;
  if (!geometry) fail("Scene Layout package has no main geometry.");
  const { binding, id, symbolResource } = resolveInitialSymbolBinding(resource);
  const reels = symbolResource.gameConfig.getReels(binding.reelSet);
  if (reels.getReelCount() !== geometry.columns)
    fail(
      `Bound reel set "${binding.reelSet}" count ${reels.getReelCount()} does not match layout columns ${geometry.columns}.`,
    );
  const states = symbolResource.statePreset.states.map((state) =>
    Object.freeze({
      id: state.id,
      phase: state.phase,
      playback: state.playback,
    }),
  );
  const symbols = symbolResource.displaySymbols.map((name) => {
    const code = symbolResource.gameConfig.getSymbolCode(name);
    if (code === undefined) fail(`Display symbol "${name}" has no code.`);
    const supportedStates = states
      .map((state) => state.id)
      .filter((state) => supportsRequestedState(symbolResource, name, state));
    const valuePresentation =
      symbolResource.symbolManifest.symbols[name]?.valuePresentation;
    return Object.freeze({
      code,
      name,
      valueCapable: valuePresentation !== undefined,
      defaultValues: Object.freeze([
        ...(valuePresentation?.defaultValues ?? []),
      ]),
      supportedStates: Object.freeze(supportedStates),
      valueRequiredStates: Object.freeze(
        supportedStates.filter((state) =>
          requiresPresentationValue(symbolResource, name, state),
        ),
      ),
    });
  });
  const tables = Object.fromEntries(
    symbolResource.gameConfig
      .getNumberWeightTableNames()
      .map((name) => [
        name,
        Object.freeze(
          symbolResource.gameConfig
            .getNumberWeightTable(name)
            .map((entry) => Object.freeze({ ...entry })),
        ),
      ]),
  );
  return deepFreeze({
    kind: "scene-other-scene-flow-package-summary" as const,
    version: 1 as const,
    sha256,
    layoutId: resource.manifest.id,
    initialMode: resource.manifest.gameModes?.initialMode ?? null,
    columns: geometry.columns,
    rows: geometry.rows,
    renderMode: binding.renderMode,
    symbolPackageId: id,
    reelSet: binding.reelSet,
    publicReels: Object.freeze(
      Array.from({ length: reels.getReelCount() }, (_, x) =>
        Object.freeze(
          Array.from({ length: reels.getLength(x) }, (_, y) => reels.get(x, y)),
        ),
      ),
    ),
    symbols: Object.freeze(symbols),
    states: Object.freeze(states),
    numberWeightTables: Object.freeze(tables),
  });
}

function validateProjectAgainstPackage(
  project: SceneOtherSceneFlowProjectV2,
  resource: SceneLayoutPackageResource,
  summary: SceneOtherSceneFlowPackageSummary,
): void {
  if (project.spin.kind !== summary.renderMode)
    fail(
      `project.spin.kind "${project.spin.kind}" does not match layout renderMode "${summary.renderMode}".`,
    );
  const choreographyById = new Map(
    project.choreographies.map((item) => [item.id, item] as const),
  );
  const stateById = new Map(summary.states.map((state) => [state.id, state]));
  if (stateById.get("normal")?.phase !== "stable")
    fail('Symbol state preset must declare exact stable state "normal".');
  for (const choreography of project.choreographies) {
    if (choreography.kind === "spin") {
      requireKnownState(
        choreography.name,
        "beforeSpin",
        choreography.beforeSpin,
      );
      const spinning = requireKnownState(
        choreography.name,
        "spinning",
        choreography.spinning,
      );
      if (spinning.phase !== "stable")
        fail(
          `Spin choreography "${choreography.name}" spinning state must be stable.`,
        );
      validateCompletionSteps(choreography.name, choreography.stopping);
    } else validateCompletionSteps(choreography.name, choreography.steps);
  }
  const codes = new Map(summary.symbols.map((symbol) => [symbol.code, symbol]));
  for (const [snapshotIndex, snapshot] of project.snapshots.entries()) {
    assertDimensions(
      snapshot.scene,
      summary,
      `snapshots[${snapshotIndex}].scene`,
    );
    assertDimensions(
      snapshot.otherScene,
      summary,
      `snapshots[${snapshotIndex}].otherScene`,
    );
    for (let x = 0; x < summary.columns; x += 1)
      for (let y = 0; y < summary.rows; y += 1) {
        const symbol = codes.get(snapshot.scene[x]![y]!);
        if (!symbol)
          fail(
            `snapshots[${snapshotIndex}].scene[${x}][${y}] uses unknown display code ${snapshot.scene[x]![y]}.`,
          );
        validateSymbolSteps(
          snapshotIndex,
          x,
          y,
          snapshot,
          symbol,
          [{ state: "normal" }],
          "initial normal",
        );
      }
    if (snapshot.kind === "initial") continue;
    assertDimensions(
      snapshot.choreographies,
      summary,
      `snapshots[${snapshotIndex}].choreographies`,
    );
    for (let x = 0; x < summary.columns; x += 1)
      for (let y = 0; y < summary.rows; y += 1) {
        const choreography = choreographyById.get(
          snapshot.choreographies[x]![y]!,
        )!;
        const expectedKind =
          snapshot.transition === "spin" ? "spin" : "sequence";
        if (choreography.kind !== expectedKind)
          fail(
            `snapshots[${snapshotIndex}].choreographies[${x}][${y}] must reference a ${expectedKind} choreography.`,
          );
        if (choreography.kind === "spin") {
          const source = project.snapshots[snapshotIndex - 1]!;
          const sourceSymbol = codes.get(source.scene[x]![y]!)!;
          validateSymbolSteps(
            snapshotIndex - 1,
            x,
            y,
            source,
            sourceSymbol,
            [choreography.beforeSpin, choreography.spinning],
            choreography.name,
          );
          const targetSymbol = codes.get(snapshot.scene[x]![y]!)!;
          validateSymbolSteps(
            snapshotIndex,
            x,
            y,
            snapshot,
            targetSymbol,
            choreography.stopping,
            choreography.name,
          );
        } else {
          const targetSymbol = codes.get(snapshot.scene[x]![y]!)!;
          validateSymbolSteps(
            snapshotIndex,
            x,
            y,
            snapshot,
            targetSymbol,
            choreography.steps,
            choreography.name,
          );
        }
      }
  }
  void resource;

  function requireKnownState(
    choreographyName: string,
    label: string,
    step: SceneOtherSceneFlowStepV2,
  ): SceneOtherSceneFlowPackageSummary["states"][number] {
    const state = stateById.get(step.state);
    if (!state)
      fail(
        `Choreography "${choreographyName}" ${label} uses unknown state "${step.state}".`,
      );
    return state;
  }

  function validateCompletionSteps(
    choreographyName: string,
    steps: readonly SceneOtherSceneFlowStepV2[],
  ): void {
    for (const [index, step] of steps.entries()) {
      const state = requireKnownState(choreographyName, `step[${index}]`, step);
      if (index < steps.length - 1 && state.phase !== "once")
        fail(
          `Choreography "${choreographyName}" intermediate step[${index}] must be once.`,
        );
    }
    const last = steps.at(-1)!;
    if (last.state !== "normal")
      fail(
        `Choreography "${choreographyName}" must end with exact state "normal".`,
      );
  }

  function validateSymbolSteps(
    snapshotIndex: number,
    x: number,
    y: number,
    snapshot: SceneOtherSceneFlowSnapshotV2,
    symbol: SceneOtherSceneFlowPackageSummary["symbols"][number],
    steps: readonly SceneOtherSceneFlowStepV2[],
    choreographyName: string,
  ): void {
    for (const step of steps)
      if (!symbol.supportedStates.includes(step.state))
        fail(
          `snapshots[${snapshotIndex}] cell (${x},${y}) symbol "${symbol.name}" does not support state "${step.state}" from choreography "${choreographyName}".`,
        );
      else if (
        symbol.valueRequiredStates.includes(step.state) &&
        snapshot.otherScene[x]![y] === null
      )
        fail(
          `snapshots[${snapshotIndex}] cell (${x},${y}) symbol "${symbol.name}" state "${step.state}" requires a positive otherScene value for its active Spine provider.`,
        );
  }
}

function resolveInitialSymbolBinding(resource: SceneLayoutPackageResource): {
  readonly binding: SceneLayoutSymbolPackageBinding;
  readonly id: string;
  readonly symbolResource: SymbolPackageResource;
} {
  const manifest =
    resource.runtimeManifest ??
    (resource.manifest.version
      ? upgradeSceneLayoutManifestToLatest(resource.manifest)
      : (resource.manifest as never));
  if (manifest.symbolPackage && resource.symbolPackage)
    return {
      binding: manifest.symbolPackage,
      id: resource.symbolPackage.packageManifest.id,
      symbolResource: resource.symbolPackage,
    };
  const initialModeId = manifest.gameModes?.initialMode;
  const mode = manifest.gameModes?.modes.find(
    (item) => item.id === initialModeId,
  );
  const id = mode?.symbolPackage;
  const binding = id ? manifest.symbolPackages?.[id] : undefined;
  const symbolResource = id ? resource.symbolPackages[id] : undefined;
  if (!id || !binding || !symbolResource)
    fail(
      "Scene layout initial mode must resolve an active symbol package binding.",
    );
  return { binding, id, symbolResource };
}

function supportsRequestedState(
  resource: SymbolPackageResource,
  symbol: string,
  requested: string,
): boolean {
  const entry = resource.symbolManifest.symbols[symbol];
  if (!entry) return false;
  const equivalences = new Map(
    (resource.statePreset.equivalences ?? []).map((item) => [
      item.from,
      item.to,
    ]),
  );
  const seen = new Set<string>();
  let state = requested;
  while (equivalences.has(state)) {
    if (seen.has(state)) fail(`Symbol state equivalence cycle at "${state}".`);
    seen.add(state);
    state = equivalences.get(state)!;
  }
  return (
    state === resource.statePreset.defaultState ||
    entry.animations[state] !== undefined ||
    entry.states[state] !== undefined ||
    entry.valuePresentation?.reelStates.states[state] !== undefined
  );
}

function requiresPresentationValue(
  resource: SymbolPackageResource,
  symbol: string,
  requested: string,
): boolean {
  const entry = resource.symbolManifest.symbols[symbol];
  if (!entry?.valuePresentation) return false;
  const equivalences = new Map(
    (resource.statePreset.equivalences ?? []).map((item) => [
      item.from,
      item.to,
    ]),
  );
  const seen = new Set<string>();
  let state = requested;
  while (equivalences.has(state)) {
    if (seen.has(state)) fail(`Symbol state equivalence cycle at "${state}".`);
    seen.add(state);
    state = equivalences.get(state)!;
  }
  if (
    requested !== state &&
    entry.valuePresentation.reelStates.states[requested]
  )
    return false;
  return (
    state === resource.statePreset.defaultState ||
    entry.animations[state]?.kind === "activeSpine"
  );
}

function defaultSpinProfile(
  renderMode: "standard" | "grid-cell",
): SlotReelPresentationProfileV1 {
  return renderMode === "standard"
    ? Object.freeze({
        kind: "standard" as const,
        version: 1 as const,
        direction: "forward" as const,
        speedSymbolsPerSecond: 24,
        minimumSpinCycles: 3,
        baseDurationMs: 900,
        startDelayMs: 80,
        stopDelayMs: 120,
        bounceStrength: 1,
      })
    : Object.freeze({
        kind: "grid-cell" as const,
        version: 1 as const,
        direction: "forward" as const,
        order: "top-down-left-right" as const,
        timing: Object.freeze({
          startStepMs: 16,
          stopStepMs: 80,
          settleAfterLastStartMs: 800,
          minimumSpinCycles: 3,
          speedSymbolsPerSecond: 24,
        }),
        bounceStrength: 1,
      });
}

function sampleWeightTable(
  table: readonly GameConfigNumberWeightEntry[],
  random: SceneOtherSceneBoundedRandom,
): number {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = bounded(random, total, "number weight sample");
  for (const entry of table) {
    if (cursor < entry.weight) return entry.value;
    cursor -= entry.weight;
  }
  fail("Number weight table sampling overflowed.");
}

function secureBoundedRandom(exclusiveMax: number): number {
  if (
    !Number.isSafeInteger(exclusiveMax) ||
    exclusiveMax <= 0 ||
    exclusiveMax > 0x1_0000_0000
  )
    fail("exclusiveMax must be between 1 and 2^32.");
  if (!globalThis.crypto?.getRandomValues)
    fail("Web Crypto getRandomValues is required.");
  const limit = Math.floor(0x1_0000_0000 / exclusiveMax) * exclusiveMax;
  const values = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(values);
  while (values[0]! >= limit);
  return values[0]! % exclusiveMax;
}

function bounded(
  random: SceneOtherSceneBoundedRandom,
  max: number,
  label: string,
): number {
  const value = random(max);
  if (!Number.isSafeInteger(value) || value < 0 || value >= max)
    fail(`${label} random result must be an integer in [0, ${max}).`);
  return value;
}

function assertDimensions(
  matrix: readonly (readonly unknown[])[],
  summary: Pick<SceneOtherSceneFlowPackageSummary, "columns" | "rows">,
  label: string,
): void {
  if (
    matrix.length !== summary.columns ||
    matrix.some((column) => column.length !== summary.rows)
  )
    fail(`${label} must be ${summary.columns} x ${summary.rows}.`);
}

function numberMatrix(
  value: unknown,
  path: string,
): readonly (readonly number[])[] {
  const columns = array(value, path);
  if (columns.length === 0) fail(`${path} must contain columns.`);
  const parsed = columns.map((column, x) => {
    const rows = array(column, `${path}[${x}]`);
    if (rows.length === 0) fail(`${path}[${x}] must contain rows.`);
    return Object.freeze(
      rows.map((item, y) =>
        nonNegativeSafeInteger(item, `${path}[${x}][${y}]`),
      ),
    );
  });
  const rows = parsed[0]!.length;
  if (parsed.some((column) => column.length !== rows))
    fail(`${path} columns must have equal row counts.`);
  return Object.freeze(parsed);
}

function optionalPositiveMatrix(
  value: unknown,
  path: string,
  columns: number,
  rows: number,
): readonly (readonly (number | null)[])[] {
  const parsed = array(value, path);
  if (parsed.length !== columns)
    fail(`${path} must contain ${columns} columns.`);
  return Object.freeze(
    parsed.map((column, x) => {
      const items = array(column, `${path}[${x}]`);
      if (items.length !== rows)
        fail(`${path}[${x}] must contain ${rows} rows.`);
      return Object.freeze(
        items.map((item, y) =>
          item === null
            ? null
            : positiveSafeInteger(item, `${path}[${x}][${y}]`),
        ),
      );
    }),
  );
}

function stringMatrix(
  value: unknown,
  path: string,
  columns: number,
  rows: number,
): readonly (readonly string[])[] {
  const parsed = array(value, path);
  if (parsed.length !== columns)
    fail(`${path} must contain ${columns} columns.`);
  return Object.freeze(
    parsed.map((column, x) => {
      const items = array(column, `${path}[${x}]`);
      if (items.length !== rows)
        fail(`${path}[${x}] must contain ${rows} rows.`);
      return Object.freeze(
        items.map((item, y) => nonBlank(item, `${path}[${x}][${y}]`)),
      );
    }),
  );
}

function parseFlowStep(
  value: unknown,
  path: string,
): SceneOtherSceneFlowStepV2 {
  const record = strictRecord(value, path, ["state"]);
  return Object.freeze({ state: nonBlank(record.state, `${path}.state`) });
}

function parseFlowSteps(
  value: unknown,
  path: string,
): readonly SceneOtherSceneFlowStepV2[] {
  const steps = array(value, path);
  if (steps.length === 0) fail(`${path} must not be empty.`);
  return Object.freeze(
    steps.map((step, index) => parseFlowStep(step, `${path}[${index}]`)),
  );
}

function parseCompletionPolicy(
  value: unknown,
  path: string,
): SceneOtherSceneFlowCompletionPolicyV2 {
  if (value !== "all-cells-normal" && value !== "first-cell-normal")
    fail(`${path} must be "all-cells-normal" or "first-cell-normal".`);
  return value;
}

function exact<T extends string>(value: unknown, expected: T, path: string): T {
  if (value !== expected) fail(`${path} must be "${expected}".`);
  return expected;
}

function strictRecord(
  value: unknown,
  path: string,
  allowed: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(`${path} must be an object.`);
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) fail(`${path}.${unknown} is not supported.`);
  return record;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${path} must be an array.`);
  return value;
}

function nonBlank(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    fail(`${path} must be a non-empty string.`);
  return value.trim();
}

function unique(value: string, seen: Set<string>, path: string): string {
  if (seen.has(value)) fail(`${path} must be unique; duplicate "${value}".`);
  seen.add(value);
  return value;
}

function positiveSafeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    fail(`${path} must be a positive safe integer.`);
  return value as number;
}

function nonNegativeSafeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail(`${path} must be a non-negative safe integer.`);
  return value as number;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) fail("Web Crypto subtle.digest is required.");
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes.slice().buffer,
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeSha256(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized))
    fail("expectedLayoutSha256 must be a 64-character SHA-256 hex string.");
  return normalized;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}

function fail(message: string): never {
  throw new SceneLayoutError(message);
}
