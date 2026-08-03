import { Application } from "pixi.js";
import {
  SymbolStateSequenceController,
  type SymbolStatePreset,
} from "../symbol/index.js";
import type { RenderViewportSize } from "../viewport/index.js";
import { SceneLayoutError } from "./errors.js";
import {
  inspectSceneOtherSceneFlowReadiness,
  secureSceneOtherSceneBoundedRandom,
  type SceneOtherSceneBoundedRandom,
  type SceneOtherSceneFlowChoreographyV1,
  type SceneOtherSceneFlowProjectV1,
  type SceneOtherSceneFlowReadiness,
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
  readonly controller: SymbolStateSequenceController;
  onceCompletionCount: number;
}

export async function createSceneOtherSceneFlowRuntime(options: {
  readonly root: HTMLElement;
  readonly layoutZipBytes: Uint8Array;
  readonly expectedLayoutSha256?: string;
  readonly project: SceneOtherSceneFlowProjectV1 | unknown;
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
    const initial = readiness.project.snapshots[0]!;
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
  readonly #statePreset: SymbolStatePreset;
  #phase: SceneOtherSceneFlowRuntimeSnapshot["phase"] = "ready";
  #snapshotIndex = 0;
  #active = new Map<string, ActiveCellSequence>();
  #spinStarted = false;

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
    this.#statePreset = Object.freeze({
      defaultState:
        readiness.layout.states.find((state) => state.phase === "stable")?.id ??
        "normal",
      states: readiness.layout.states,
    });
  }

  play(): void {
    this.assertAlive();
    if (this.#phase === "playing") return;
    if (this.#phase === "completed") this.reset();
    this.#phase = "playing";
    this.startSnapshotSequences(0);
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
    for (const position of this.#runtime.drainMainReelLandingPositions())
      this.startCellSequence(this.#snapshotIndex + 1, position.x, position.y);
    this.updateSequences(deltaSeconds);
    if (
      !this.#spinStarted &&
      this.#snapshotIndex === 0 &&
      this.#active.size === 0
    ) {
      const target = this.readiness.project.snapshots[1]!;
      this.#spinStarted = true;
      this.#runtime.spinMainReelToScene({
        scene: target.scene,
        localPhaseYs: zeroPhases(this.readiness.layout.columns),
        presentationValues: target.otherScene,
        random: () => this.#random(0x1_0000_0000) / 0x1_0000_0000,
      });
      return;
    }
    if (
      this.#spinStarted &&
      !this.#runtime.isMainReelSpinning() &&
      this.#active.size === 0
    ) {
      this.#snapshotIndex = 1;
      this.#spinStarted = false;
      this.advanceAfterSnapshot();
    }
  }

  destroy(): void {
    if (this.#phase === "destroyed") return;
    this.#phase = "destroyed";
    this.#active.clear();
    this.#runtime.destroy();
    this.#application.destroy(true, { children: true, texture: false });
  }

  private advanceAfterSnapshot(): void {
    const nextIndex = this.#snapshotIndex + 1;
    if (nextIndex >= this.readiness.project.snapshots.length) {
      this.#phase = "completed";
      return;
    }
    const next = this.readiness.project.snapshots[nextIndex]!;
    this.#runtime.applyMainReelSnapshot({
      scene: next.scene,
      localPhaseYs: zeroPhases(this.readiness.layout.columns),
      presentationValues: next.otherScene,
    });
    this.#snapshotIndex = nextIndex;
    this.startSnapshotSequences(nextIndex);
  }

  private startSnapshotSequences(snapshotIndex: number): void {
    for (let x = 0; x < this.readiness.layout.columns; x++)
      for (let y = 0; y < this.readiness.layout.rows; y++)
        this.startCellSequence(snapshotIndex, x, y);
  }

  private startCellSequence(snapshotIndex: number, x: number, y: number): void {
    const snapshot = this.readiness.project.snapshots[snapshotIndex];
    if (!snapshot) return;
    const choreographyId = snapshot.choreographies[x]![y]!;
    const choreography = this.requireChoreography(choreographyId);
    const controller = new SymbolStateSequenceController({
      statePreset: this.#statePreset,
      steps: choreography.steps,
      loop: false,
    });
    const position = [{ x, y }];
    this.#runtime.requestMainReelSymbolStates(
      position,
      controller.getCurrentStep().state,
      "immediate",
    );
    const state = this.#runtime.getMainReelSymbolStateSnapshots(position)[0]!;
    const key = cellKey(x, y);
    if (controller.isCompleted()) return;
    this.#active.set(key, {
      x,
      y,
      controller,
      onceCompletionCount: state.onceCompletionCount ?? 0,
    });
  }

  private updateSequences(deltaSeconds: number): void {
    for (const [key, active] of [...this.#active]) {
      const position = [{ x: active.x, y: active.y }];
      const snapshot =
        this.#runtime.getMainReelSymbolStateSnapshots(position)[0]!;
      const onceCount = snapshot.onceCompletionCount ?? 0;
      const result = active.controller.update({
        deltaSeconds,
        onceCompleted: onceCount > active.onceCompletionCount,
      });
      active.onceCompletionCount = onceCount;
      if (result.shouldRequestState) {
        this.#runtime.requestMainReelSymbolStates(
          position,
          result.state,
          "immediate",
        );
        active.onceCompletionCount =
          this.#runtime.getMainReelSymbolStateSnapshots(position)[0]!
            .onceCompletionCount ?? 0;
      }
      if (result.completed) this.#active.delete(key);
    }
    if (
      this.#active.size === 0 &&
      this.#snapshotIndex >= 1 &&
      !this.#spinStarted
    )
      this.advanceAfterSnapshot();
  }

  private reset(): void {
    const initial = this.readiness.project.snapshots[0]!;
    this.#runtime.resetReelScene("main", {
      scene: initial.scene,
      localPhaseYs: zeroPhases(this.readiness.layout.columns),
      presentationValues: initial.otherScene,
    });
    this.#active.clear();
    this.#snapshotIndex = 0;
    this.#spinStarted = false;
    this.#phase = "ready";
  }

  private requireChoreography(id: string): SceneOtherSceneFlowChoreographyV1 {
    const choreography = this.readiness.project.choreographies.find(
      (item) => item.id === id,
    );
    if (!choreography)
      throw new SceneLayoutError(`Unknown choreography "${id}".`);
    return choreography;
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
