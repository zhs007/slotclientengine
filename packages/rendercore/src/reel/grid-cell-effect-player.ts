import { Container, Graphics } from "pixi.js";
import {
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
} from "../spine/runtime-player.js";
import { ReelError } from "./errors.js";
import type {
  GridCellEffectResource,
  GridCellEffectResourceMap,
} from "./grid-cell-effect-resource.js";

const EFFECT_SCHEDULE_BOUNDARY_TOLERANCE_SECONDS = 1e-12;

export interface GridCellEffectSnapshot {
  readonly prepared: boolean;
  readonly active: readonly Readonly<{
    effectId: string;
    x: number;
    y: number;
    completedLoops: number;
  }>[];
  readonly activeCount: number;
  readonly idleCount: number;
  readonly capacity: number;
}

export interface GridCellEffectUpdateResult {
  readonly completed: readonly Readonly<{
    effectId: string;
    x: number;
    y: number;
  }>[];
}

export interface GridCellEffectController {
  readonly container: Container;
  prepare(): Promise<void> | void;
  startScheduledEffect(options: {
    readonly effectId: string;
    readonly position: Readonly<{ x: number; y: number }>;
    readonly loopCount: number;
  }): void;
  update(deltaSeconds: number): GridCellEffectUpdateResult;
  isActive(
    effectId: string,
    position: Readonly<{ x: number; y: number }>,
  ): boolean;
  cancelAll(): void;
  getSnapshot(): GridCellEffectSnapshot;
  destroy(): void;
}

interface PoolEntry {
  readonly resource: GridCellEffectResource;
  readonly player: RendercoreSpinePlayer;
  active: boolean;
  x: number;
  y: number;
  completedLoops: number;
  requiredLoops: number;
  elapsedSeconds: number;
}

export function createGridCellEffectController(options: {
  readonly resources: GridCellEffectResourceMap;
  readonly capacities: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly createPlayer?: (
    resource: GridCellEffectResource,
  ) => RendercoreSpinePlayer;
}): GridCellEffectController {
  return new GridCellEffectControllerImpl(options);
}

class GridCellEffectControllerImpl implements GridCellEffectController {
  readonly container = new Container();
  readonly #entries: readonly PoolEntry[];
  readonly #entriesByEffect: ReadonlyMap<string, readonly PoolEntry[]>;
  readonly #columns: number;
  readonly #rows: number;
  readonly #cellWidth: number;
  readonly #cellHeight: number;
  readonly #mask: Graphics;
  #prepared = false;
  #preparing = false;
  #destroyed = false;

  constructor(options: {
    readonly resources: GridCellEffectResourceMap;
    readonly capacities: Readonly<Record<string, number>>;
    readonly columns: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
    readonly createPlayer?: (
      resource: GridCellEffectResource,
    ) => RendercoreSpinePlayer;
  }) {
    this.#columns = assertPositiveSafeInteger(options.columns, "columns");
    this.#rows = assertPositiveSafeInteger(options.rows, "rows");
    this.#cellWidth = assertPositiveFinite(options.cellWidth, "cellWidth");
    this.#cellHeight = assertPositiveFinite(options.cellHeight, "cellHeight");
    const createPlayer =
      options.createPlayer ??
      ((resource: GridCellEffectResource) =>
        createOfficialSpinePlayer({
          resource: resource.playerResource,
          createError: (message) => new ReelError(message),
        }));
    const entries: PoolEntry[] = [];
    const byEffect = new Map<string, readonly PoolEntry[]>();
    for (const [effectId, resource] of Object.entries(options.resources)) {
      const capacity = options.capacities[effectId];
      if (!Number.isSafeInteger(capacity) || capacity! <= 0) {
        throw new ReelError(
          `grid cell effect "${effectId}" pool capacity must be positive.`,
        );
      }
      const pool = Array.from({ length: capacity! }, () => {
        const player = createPlayer(resource);
        player.view.renderable = false;
        player.view.visible = true;
        this.container.addChild(player.view);
        const entry: PoolEntry = {
          resource,
          player,
          active: false,
          x: -1,
          y: -1,
          completedLoops: 0,
          requiredLoops: 0,
          elapsedSeconds: 0,
        };
        entries.push(entry);
        return entry;
      });
      byEffect.set(effectId, Object.freeze(pool));
    }
    if (entries.length === 0)
      throw new ReelError("grid cell effect resources must not be empty.");
    this.#entries = Object.freeze(entries);
    this.#entriesByEffect = byEffect;
    this.#mask = new Graphics()
      .rect(
        0,
        0,
        this.#columns * this.#cellWidth,
        this.#rows * this.#cellHeight,
      )
      .fill({ color: 0xffffff, alpha: 1 });
    this.#mask.visible = true;
    this.#mask.renderable = true;
    this.#mask.includeInBuild = false;
    this.#mask.measurable = false;
    this.container.addChild(this.#mask);
    this.container.mask = this.#mask;
    this.container.sortableChildren = false;
  }

  prepare(): Promise<void> | void {
    this.assertNotDestroyed();
    if (this.#prepared) return;
    if (this.#preparing)
      throw new ReelError("grid cell effect controller is already preparing.");
    this.#preparing = true;
    const pending: Promise<void>[] = [];
    try {
      for (const entry of this.#entries) {
        const result = entry.player.init();
        if (result && typeof (result as Promise<void>).then === "function") {
          pending.push(result as Promise<void>);
        }
      }
    } catch (error) {
      this.#preparing = false;
      throw error;
    }
    if (pending.length === 0) {
      this.#preparing = false;
      this.#prepared = true;
      return;
    }
    return Promise.all(pending).then(
      () => {
        this.assertNotDestroyed();
        this.#preparing = false;
        this.#prepared = true;
      },
      (error) => {
        this.#preparing = false;
        throw error;
      },
    );
  }

  startScheduledEffect(options: {
    readonly effectId: string;
    readonly position: Readonly<{ x: number; y: number }>;
    readonly loopCount: number;
  }): void {
    this.assertReady();
    if (!Number.isSafeInteger(options.loopCount) || options.loopCount <= 0) {
      throw new ReelError(
        "grid cell effect loopCount must be a positive safe integer.",
      );
    }
    const { x, y } = parsePosition(options.position, this.#columns, this.#rows);
    if (this.isActive(options.effectId, { x, y })) {
      throw new ReelError(
        `grid cell effect "${options.effectId}" is already active at (${x},${y}).`,
      );
    }
    const entry = this.#entriesByEffect
      .get(options.effectId)
      ?.find((candidate) => !candidate.active);
    if (!entry) {
      throw new ReelError(
        `grid cell effect "${options.effectId}" player pool is exhausted.`,
      );
    }
    entry.active = true;
    entry.x = x;
    entry.y = y;
    entry.completedLoops = 0;
    entry.requiredLoops = options.loopCount;
    entry.elapsedSeconds = 0;
    entry.player.view.position.set(
      x * this.#cellWidth + this.#cellWidth / 2 + entry.resource.transform.x,
      y * this.#cellHeight + this.#cellHeight / 2 + entry.resource.transform.y,
    );
    entry.player.view.scale.set(entry.resource.transform.scale);
    entry.player.view.renderable = true;
    entry.player.play({
      animationName: entry.resource.animationName,
      loop: true,
    });
  }

  update(deltaSeconds: number): GridCellEffectUpdateResult {
    this.assertReady();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new ReelError(
        "grid cell effect deltaSeconds must be non-negative and finite.",
      );
    }
    const completed: Array<{ effectId: string; x: number; y: number }> = [];
    for (const entry of this.#entries) {
      if (!entry.active) continue;
      let remainingSeconds = deltaSeconds;
      let firstSlice = true;
      while (entry.active && (firstSlice || remainingSeconds > 0)) {
        firstSlice = false;
        const secondsToBoundary = Math.max(
          0,
          entry.resource.durationSeconds - entry.elapsedSeconds,
        );
        const sliceSeconds = Math.min(remainingSeconds, secondsToBoundary);
        entry.elapsedSeconds += sliceSeconds;
        remainingSeconds -= sliceSeconds;
        const reachesBoundary =
          entry.elapsedSeconds + EFFECT_SCHEDULE_BOUNDARY_TOLERANCE_SECONDS >=
          entry.resource.durationSeconds;
        const result = entry.player.update(
          sliceSeconds +
            (reachesBoundary
              ? entry.resource.completionBoundaryAdjustmentSeconds
              : 0),
        );
        if (result.loopCompleted) {
          entry.completedLoops += 1;
          entry.elapsedSeconds = 0;
          if (entry.completedLoops === entry.requiredLoops) {
            completed.push({
              effectId: entry.resource.id,
              x: entry.x,
              y: entry.y,
            });
            this.release(entry);
          }
          continue;
        }
        if (reachesBoundary) {
          throw new ReelError(
            `grid cell effect "${entry.resource.id}" did not report a real loop completion at its official boundary.`,
          );
        }
        if (sliceSeconds === 0) break;
      }
    }
    return Object.freeze({
      completed: Object.freeze(completed.map((item) => Object.freeze(item))),
    });
  }

  isActive(
    effectId: string,
    position: Readonly<{ x: number; y: number }>,
  ): boolean {
    const { x, y } = parsePosition(position, this.#columns, this.#rows);
    return (
      this.#entriesByEffect
        .get(effectId)
        ?.some((entry) => entry.active && entry.x === x && entry.y === y) ??
      false
    );
  }

  cancelAll(): void {
    if (this.#destroyed) return;
    for (const entry of this.#entries) {
      if (entry.active) this.release(entry);
    }
  }

  getSnapshot(): GridCellEffectSnapshot {
    const active = this.#entries.filter((entry) => entry.active);
    return Object.freeze({
      prepared: this.#prepared,
      active: Object.freeze(
        active.map((entry) =>
          Object.freeze({
            effectId: entry.resource.id,
            x: entry.x,
            y: entry.y,
            completedLoops: entry.completedLoops,
          }),
        ),
      ),
      activeCount: active.length,
      idleCount: this.#entries.length - active.length,
      capacity: this.#entries.length,
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.cancelAll();
    this.#destroyed = true;
    for (const entry of this.#entries) entry.player.destroy();
    this.container.mask = null;
    this.#mask.destroy();
    this.container.destroy({ children: true });
  }

  private release(entry: PoolEntry): void {
    entry.player.reset();
    entry.player.view.renderable = false;
    entry.active = false;
    entry.x = -1;
    entry.y = -1;
    entry.requiredLoops = 0;
    entry.elapsedSeconds = 0;
  }

  private assertReady(): void {
    this.assertNotDestroyed();
    if (!this.#prepared)
      throw new ReelError("grid cell effect controller is not prepared.");
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed)
      throw new ReelError("grid cell effect controller was destroyed.");
  }
}

function parsePosition(
  position: Readonly<{ x: number; y: number }>,
  columns: number,
  rows: number,
): { x: number; y: number } {
  if (
    !Number.isSafeInteger(position.x) ||
    position.x < 0 ||
    position.x >= columns ||
    !Number.isSafeInteger(position.y) ||
    position.y < 0 ||
    position.y >= rows
  ) {
    throw new ReelError("grid cell effect position is out of range.");
  }
  return { x: position.x, y: position.y };
}

function assertPositiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ReelError(`${label} must be a positive safe integer.`);
  }
  return value as number;
}

function assertPositiveFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ReelError(`${label} must be a positive finite number.`);
  }
  return value;
}
