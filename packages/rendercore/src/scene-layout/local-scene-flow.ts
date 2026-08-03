import { Application } from "pixi.js";
import type { RenderViewportSize } from "../viewport/index.js";
import { SceneLayoutError } from "./errors.js";
import {
  inspectSceneOtherSceneFlowReadiness,
  secureSceneOtherSceneBoundedRandom,
  type SceneOtherSceneBoundedRandom,
  type SceneOtherSceneFlowChoreographyV2,
  type SceneOtherSceneFlowProjectV2,
  type SceneOtherSceneFlowReadiness,
  type SceneOtherSceneFlowSpinChoreographyV2,
  type SceneOtherSceneFlowStateSnapshotV2,
  type SceneOtherSceneFlowStepV2,
} from "./local-scene-authoring.js";
import { createSceneLayoutPackageRuntime } from "./package-runtime.js";
import { resolveSceneLayoutFrameViewport } from "./geometry.js";
import { loadSceneLayoutPackageFromZipBytes } from "./production-zip.js";
import type {
  SceneLayoutManifestV1,
  SceneLayoutPackageRuntime,
} from "./types.js";

export interface SceneOtherSceneFlowRuntimeSnapshot {
  readonly phase: "ready" | "playing" | "completed" | "destroyed";
  readonly snapshotIndex: number;
  readonly activeCellCount: number;
}

export interface SceneOtherSceneFlowRuntime {
  readonly canvas: HTMLCanvasElement;
  readonly readiness: SceneOtherSceneFlowReadiness;
  play(): void;
  replay(): void;
  applyViewport(size: RenderViewportSize): void;
  getSnapshot(): SceneOtherSceneFlowRuntimeSnapshot;
  destroy(): void;
}

interface ActiveCellSequence {
  readonly x: number;
  readonly y: number;
  readonly generation: number;
  readonly mode: "before-spin" | "completion";
  readonly steps: readonly SceneOtherSceneFlowStepV2[];
  index: number;
  onceCompletionCount: number;
}

type FlowPhase = "idle" | "before-spin" | "spinning" | "settled";

export async function createSceneOtherSceneFlowRuntime(options: {
  readonly root: HTMLElement;
  readonly layoutZipBytes: Uint8Array;
  readonly expectedLayoutSha256?: string;
  readonly project: SceneOtherSceneFlowProjectV2 | unknown;
  readonly random?: SceneOtherSceneBoundedRandom;
}): Promise<SceneOtherSceneFlowRuntime> {
  const readiness = await inspectSceneOtherSceneFlowReadiness({
    layoutZipBytes: options.layoutZipBytes,
    ...(options.expectedLayoutSha256
      ? { expectedLayoutSha256: options.expectedLayoutSha256 }
      : {}),
    project: options.project,
  });
  const resource = await loadSceneLayoutPackageFromZipBytes({
    zipBytes: options.layoutZipBytes,
    loadSymbolTextures: true,
  });
  const application = new Application();
  let runtime: SceneLayoutPackageRuntime | null = null;
  try {
    await application.init({
      width: 1,
      height: 1,
      antialias: true,
      background: "#050914",
    });
    runtime = createSceneLayoutPackageRuntime({
      resource,
      reelPresentation: readiness.project.spin,
    });
    const initial = readiness.project.snapshots[0];
    await runtime.init({
      reels: {
        main: {
          scene: initial.scene,
          localPhaseYs: zeroPhases(readiness.layout.columns),
          presentationValues: initial.otherScene,
        },
      },
    });
    application.stage.addChild(runtime.container);
    options.root.replaceChildren(application.canvas);
    application.canvas.setAttribute("aria-label", "Game Viewer 2 preview");
    const controller = new DefaultSceneOtherSceneFlowRuntime(
      application,
      runtime,
      readiness,
      resource.manifest,
      options.random ?? secureSceneOtherSceneBoundedRandom,
    );
    application.ticker.add((ticker) =>
      controller.update(ticker.deltaMS / 1000),
    );
    return controller;
  } catch (error) {
    runtime?.destroy();
    if (!runtime) await resource.destroy();
    application.destroy(true, { children: true, texture: false });
    throw error;
  }
}

class DefaultSceneOtherSceneFlowRuntime implements SceneOtherSceneFlowRuntime {
  readonly canvas: HTMLCanvasElement;
  readonly readiness: SceneOtherSceneFlowReadiness;
  readonly #application: Application;
  readonly #runtime: SceneLayoutPackageRuntime;
  readonly #manifest: SceneLayoutManifestV1;
  readonly #random: SceneOtherSceneBoundedRandom;
  readonly #statePhases: ReadonlyMap<string, "stable" | "once">;
  #phase: SceneOtherSceneFlowRuntimeSnapshot["phase"] = "ready";
  #flowPhase: FlowPhase = "idle";
  #snapshotIndex = 0;
  #generation = 0;
  #active = new Map<string, ActiveCellSequence>();
  #completed = new Set<string>();
  #started = new Set<string>();

  constructor(
    application: Application,
    runtime: SceneLayoutPackageRuntime,
    readiness: SceneOtherSceneFlowReadiness,
    manifest: SceneLayoutManifestV1,
    random: SceneOtherSceneBoundedRandom,
  ) {
    this.#application = application;
    this.#runtime = runtime;
    this.#manifest = manifest;
    this.readiness = readiness;
    this.#random = random;
    this.canvas = application.canvas;
    this.#statePhases = new Map(
      readiness.layout.states.map((state) => [state.id, state.phase]),
    );
  }

  play(): void {
    this.assertAlive();
    if (this.#phase === "playing") return;
    if (this.#phase === "completed") this.reset();
    this.#phase = "playing";
    this.startSpinTarget();
  }

  replay(): void {
    this.assertAlive();
    this.reset();
    this.play();
  }

  applyViewport(size: RenderViewportSize): void {
    this.assertAlive();
    if (
      !Number.isFinite(size.width) ||
      size.width <= 0 ||
      !Number.isFinite(size.height) ||
      size.height <= 0
    )
      throw new SceneLayoutError(
        "Preview viewport must have positive finite dimensions.",
      );
    const frame = resolveSceneLayoutFrameViewport({
      manifest: this.#manifest,
      pageSize: size,
    });
    this.#application.renderer.resize(
      frame.frameDesignSize.width,
      frame.frameDesignSize.height,
    );
    this.#runtime.applyViewport(frame.frameDesignSize);
    Object.assign(this.canvas.style, {
      position: "absolute",
      left: `${frame.offsetX}px`,
      top: `${frame.offsetY}px`,
      width: `${frame.cssSize.width}px`,
      height: `${frame.cssSize.height}px`,
    });
  }

  getSnapshot(): SceneOtherSceneFlowRuntimeSnapshot {
    return Object.freeze({
      phase: this.#phase,
      snapshotIndex: this.#snapshotIndex,
      activeCellCount: this.#active.size,
    });
  }

  update(deltaSeconds: number): void {
    if (this.#phase === "destroyed") return;
    this.#runtime.update(deltaSeconds);
    if (this.#phase !== "playing") return;

    if (this.#flowPhase === "spinning")
      for (const position of this.#runtime.drainMainReelLandingPositions())
        this.startStopping(position.x, position.y);

    this.updateSequences();

    if (this.#flowPhase === "before-spin") {
      if (this.#completed.size === this.cellCount) this.beginReelSpin();
      return;
    }
    if (this.#flowPhase === "spinning") {
      if (
        !this.#runtime.isMainReelSpinning() &&
        this.completionPolicySatisfied(this.currentScene)
      )
        this.advanceAfterScene();
      return;
    }
    if (
      this.#flowPhase === "settled" &&
      this.completionPolicySatisfied(this.currentScene)
    )
      this.advanceAfterScene();
  }

  destroy(): void {
    if (this.#phase === "destroyed") return;
    this.#phase = "destroyed";
    this.retireGeneration();
    this.#runtime.destroy();
    this.#application.destroy(true, { children: true, texture: false });
  }

  private startSpinTarget(): void {
    this.beginGeneration(1, "before-spin");
    const snapshot = this.currentScene;
    for (let x = 0; x < this.readiness.layout.columns; x++)
      for (let y = 0; y < this.readiness.layout.rows; y++) {
        const choreography = this.requireSpinChoreography(
          snapshot.choreographies[x]![y]!,
        );
        this.startBeforeSpin(x, y, choreography.beforeSpin);
      }
    if (this.#completed.size === this.cellCount) this.beginReelSpin();
  }

  private startBeforeSpin(
    x: number,
    y: number,
    step: SceneOtherSceneFlowStepV2,
  ): void {
    this.requestState(x, y, step.state);
    if (this.statePhase(step.state) === "stable") {
      this.#completed.add(cellKey(x, y));
      return;
    }
    this.addActive(x, y, "before-spin", [step]);
  }

  private beginReelSpin(): void {
    const target = this.currentScene;
    this.#active.clear();
    this.#completed.clear();
    this.#started.clear();
    for (let x = 0; x < this.readiness.layout.columns; x++)
      for (let y = 0; y < this.readiness.layout.rows; y++) {
        const choreography = this.requireSpinChoreography(
          target.choreographies[x]![y]!,
        );
        this.requestState(x, y, choreography.spinning.state);
      }
    this.#flowPhase = "spinning";
    this.#runtime.spinMainReelToScene({
      scene: target.scene,
      localPhaseYs: zeroPhases(this.readiness.layout.columns),
      presentationValues: target.otherScene,
      random: () => this.#random(0x1_0000_0000) / 0x1_0000_0000,
    });
  }

  private startStopping(x: number, y: number): void {
    const key = cellKey(x, y);
    if (this.#started.has(key)) return;
    this.#started.add(key);
    const choreography = this.requireSpinChoreography(
      this.currentScene.choreographies[x]![y]!,
    );
    this.startCompletionSequence(x, y, choreography.stopping);
  }

  private startSettledScene(snapshotIndex: number): void {
    const snapshot = this.readiness.project.snapshots[snapshotIndex]!;
    if (snapshot.kind !== "scene" || snapshot.transition !== "settled")
      throw new SceneLayoutError(
        `Snapshot ${snapshotIndex} is not a settled scene state.`,
      );
    this.#runtime.applyMainReelSnapshot({
      scene: snapshot.scene,
      localPhaseYs: zeroPhases(this.readiness.layout.columns),
      presentationValues: snapshot.otherScene,
    });
    this.beginGeneration(snapshotIndex, "settled");
    for (let x = 0; x < this.readiness.layout.columns; x++)
      for (let y = 0; y < this.readiness.layout.rows; y++) {
        const choreography = this.requireChoreography(
          snapshot.choreographies[x]![y]!,
        );
        if (choreography.kind !== "sequence")
          throw new SceneLayoutError(
            `Snapshot ${snapshotIndex} cell (${x},${y}) must use sequence choreography.`,
          );
        this.startCompletionSequence(x, y, choreography.steps);
      }
  }

  private startCompletionSequence(
    x: number,
    y: number,
    steps: readonly SceneOtherSceneFlowStepV2[],
  ): void {
    this.requestState(x, y, steps[0]!.state);
    if (steps.length === 1) {
      this.#completed.add(cellKey(x, y));
      return;
    }
    this.addActive(x, y, "completion", steps);
  }

  private addActive(
    x: number,
    y: number,
    mode: ActiveCellSequence["mode"],
    steps: readonly SceneOtherSceneFlowStepV2[],
  ): void {
    const position = [{ x, y }];
    const state = this.#runtime.getMainReelSymbolStateSnapshots(position)[0]!;
    this.#active.set(cellKey(x, y), {
      x,
      y,
      generation: this.#generation,
      mode,
      steps,
      index: 0,
      onceCompletionCount: state.onceCompletionCount ?? 0,
    });
  }

  private updateSequences(): void {
    for (const [key, active] of [...this.#active]) {
      if (active.generation !== this.#generation) {
        this.#active.delete(key);
        continue;
      }
      const position = [{ x: active.x, y: active.y }];
      const snapshot =
        this.#runtime.getMainReelSymbolStateSnapshots(position)[0]!;
      const onceCount = snapshot.onceCompletionCount ?? 0;
      if (onceCount <= active.onceCompletionCount) continue;
      active.onceCompletionCount = onceCount;
      if (active.mode === "before-spin") {
        this.#active.delete(key);
        this.#completed.add(key);
        continue;
      }
      active.index += 1;
      const next = active.steps[active.index]!;
      this.requestState(active.x, active.y, next.state);
      if (active.index === active.steps.length - 1) {
        this.#active.delete(key);
        this.#completed.add(key);
      } else {
        active.onceCompletionCount =
          this.#runtime.getMainReelSymbolStateSnapshots(position)[0]!
            .onceCompletionCount ?? 0;
      }
    }
  }

  private completionPolicySatisfied(
    snapshot: SceneOtherSceneFlowStateSnapshotV2,
  ): boolean {
    return snapshot.completionPolicy === "first-cell-normal"
      ? this.#completed.has(cellKey(0, 0))
      : this.#completed.size === this.cellCount;
  }

  private advanceAfterScene(): void {
    const nextIndex = this.#snapshotIndex + 1;
    this.retireGeneration();
    if (nextIndex >= this.readiness.project.snapshots.length) {
      this.#phase = "completed";
      this.#flowPhase = "idle";
      return;
    }
    this.startSettledScene(nextIndex);
  }

  private beginGeneration(snapshotIndex: number, phase: FlowPhase): void {
    this.retireGeneration();
    this.#generation += 1;
    this.#snapshotIndex = snapshotIndex;
    this.#flowPhase = phase;
  }

  private retireGeneration(): void {
    this.#generation += 1;
    this.#active.clear();
    this.#completed.clear();
    this.#started.clear();
  }

  private reset(): void {
    const initial = this.readiness.project.snapshots[0];
    this.retireGeneration();
    this.#runtime.resetReelScene("main", {
      scene: initial.scene,
      localPhaseYs: zeroPhases(this.readiness.layout.columns),
      presentationValues: initial.otherScene,
    });
    this.#snapshotIndex = 0;
    this.#flowPhase = "idle";
    this.#phase = "ready";
  }

  private requestState(x: number, y: number, state: string): void {
    this.#runtime.requestMainReelSymbolStates([{ x, y }], state, "immediate");
  }

  private requireChoreography(id: string): SceneOtherSceneFlowChoreographyV2 {
    const choreography = this.readiness.project.choreographies.find(
      (item) => item.id === id,
    );
    if (!choreography)
      throw new SceneLayoutError(`Unknown choreography "${id}".`);
    return choreography;
  }

  private requireSpinChoreography(
    id: string,
  ): SceneOtherSceneFlowSpinChoreographyV2 {
    const choreography = this.requireChoreography(id);
    if (choreography.kind !== "spin")
      throw new SceneLayoutError(`Choreography "${id}" is not a spin.`);
    return choreography;
  }

  private statePhase(state: string): "stable" | "once" {
    const phase = this.#statePhases.get(state);
    if (!phase) throw new SceneLayoutError(`Unknown state "${state}".`);
    return phase;
  }

  private get currentScene(): SceneOtherSceneFlowStateSnapshotV2 {
    const snapshot = this.readiness.project.snapshots[this.#snapshotIndex];
    if (!snapshot || snapshot.kind !== "scene")
      throw new SceneLayoutError(
        `Snapshot ${this.#snapshotIndex} is not a scene state.`,
      );
    return snapshot;
  }

  private get cellCount(): number {
    return this.readiness.layout.columns * this.readiness.layout.rows;
  }

  private assertAlive(): void {
    if (this.#phase === "destroyed")
      throw new SceneLayoutError("Scene flow runtime is destroyed.");
  }
}

function zeroPhases(columns: number): readonly number[] {
  return Object.freeze(Array.from({ length: columns }, () => 0));
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}
