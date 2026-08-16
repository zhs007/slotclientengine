import type * as PIXI from "pixi.js";
import {
  createVNIParticleComboTargetVariant,
  listVNIParticleComboTargetAnimations,
  type VNIParticleComboAnimationDescriptor,
  type VNIParticleComboAnimationRef,
  type VNIParticleComboTarget,
  type VNIParticleComboTimingDescriptor,
  type VNIParticleComboTimingMode,
} from "./particle-combo-variant.js";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  VNIProjectConfig,
} from "../data/types.js";
import { VNIRuntime, type VNIPlaybackCompleteContext } from "./vni-runtime.js";

export interface VNIRuntimePoolManagerOptions {
  readonly maxIdleInstancesPerPlayer?: number;
}

export interface VNIParticleComboLeaseOptions {
  readonly animation: VNIParticleComboAnimationRef;
  readonly target: VNIParticleComboTarget;
  readonly timing?: VNIParticleComboTimingMode;
}

export interface VNIRuntimePoolStats {
  readonly active: number;
  readonly idle: number;
  readonly created: number;
  readonly reused: number;
}

export interface VNIParticleComboPlayerLease {
  readonly player: VNIRuntime;
  readonly timing: VNIParticleComboTimingDescriptor;
  playOnce(): Promise<VNIPlaybackCompleteContext>;
  release(): void;
}

export interface VNIRuntimePool {
  listParticleComboAnimations(): readonly VNIParticleComboAnimationDescriptor[];
  getStats(): VNIRuntimePoolStats;
  acquire(
    options: VNIParticleComboLeaseOptions,
  ): Promise<VNIParticleComboPlayerLease>;
}

interface PoolEntry {
  readonly player: VNIRuntime;
  readonly project: VNIProjectConfig;
  generation: number;
  lease: VNIParticleComboPlayerLeaseImpl | null;
}

const managersByTemplate = new WeakMap<VNIRuntime, VNIRuntimePoolManager>();

export class VNIRuntimePoolManager {
  private readonly pools = new Map<VNIRuntime, VNIRuntimePoolImpl>();
  private readonly maxIdleInstancesPerPlayer: number;
  private destroyed = false;

  constructor(options: VNIRuntimePoolManagerOptions = {}) {
    this.maxIdleInstancesPerPlayer = normalizeMaxIdleInstances(
      options.maxIdleInstancesPerPlayer ?? 2,
    );
  }

  getPool(template: VNIRuntime): VNIRuntimePool {
    if (this.destroyed) {
      throw new Error(
        "Cannot get a pool from a destroyed VNIRuntimePoolManager.",
      );
    }
    const existing = this.pools.get(template);
    if (existing) return existing;
    const currentManager = managersByTemplate.get(template);
    if (currentManager && currentManager !== this) {
      throw new Error(
        "A VNIRuntime template cannot be registered with multiple live pool managers.",
      );
    }
    const pool = new VNIRuntimePoolImpl(
      template,
      this.maxIdleInstancesPerPlayer,
      () => {
        this.pools.delete(template);
        if (managersByTemplate.get(template) === this) {
          managersByTemplate.delete(template);
        }
      },
    );
    managersByTemplate.set(template, this);
    this.pools.set(template, pool);
    return pool;
  }

  destroyPool(template: VNIRuntime): void {
    this.pools.get(template)?.destroy();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const pool of [...this.pools.values()]) pool.destroy();
    this.pools.clear();
  }
}

class VNIRuntimePoolImpl implements VNIRuntimePool {
  private readonly authoredProject: VNIProjectConfig;
  private readonly parent: PIXI.Container;
  private readonly idle: PoolEntry[] = [];
  private readonly active = new Set<PoolEntry>();
  private readonly disposeTemplateDestroy: () => void;
  private created = 0;
  private reused = 0;
  private destroyed = false;

  constructor(
    private readonly template: VNIRuntime,
    private readonly maxIdleInstances: number,
    private readonly onDestroy: () => void,
  ) {
    this.authoredProject = template.getProjectSnapshot();
    const parent = template.getDisplayObject().parent;
    if (!parent) {
      throw new Error(
        "VNIRuntime pool template must be initialized and attached to a parent.",
      );
    }
    this.parent = parent;
    this.disposeTemplateDestroy = template.onDestroy(() => this.destroy());
  }

  listParticleComboAnimations(): readonly VNIParticleComboAnimationDescriptor[] {
    this.assertAvailable();
    return listVNIParticleComboTargetAnimations(this.authoredProject);
  }

  getStats(): VNIRuntimePoolStats {
    return Object.freeze({
      active: this.active.size,
      idle: this.idle.length,
      created: this.created,
      reused: this.reused,
    });
  }

  async acquire(
    options: VNIParticleComboLeaseOptions,
  ): Promise<VNIParticleComboPlayerLease> {
    this.assertAvailable();
    const variant = createVNIParticleComboTargetVariant({
      project: this.authoredProject,
      animation: options.animation,
      target: options.target,
      timing: options.timing,
    });

    let entry = this.idle.pop();
    if (entry) {
      try {
        applyProjectVariant(entry.project, variant.project);
        this.parent.addChild(entry.player.getDisplayObject());
        entry.player.resetForPoolReuse();
        this.reused += 1;
      } catch (error) {
        entry.player.destroy();
        throw error;
      }
    } else {
      const project = structuredClone(variant.project);
      const player = this.template.createLoadedClone(project);
      try {
        await player.init();
      } catch (error) {
        player.destroy();
        throw error;
      }
      if (this.destroyed) {
        player.destroy();
        throw new Error("VNIRuntime pool was destroyed during acquire().");
      }
      entry = {
        player,
        project,
        generation: 0,
        lease: null,
      };
      this.created += 1;
    }

    entry.generation += 1;
    const lease = new VNIParticleComboPlayerLeaseImpl(
      this,
      entry,
      entry.generation,
      variant.timing,
    );
    entry.lease = lease;
    this.active.add(entry);
    entry.player.getDisplayObject().visible = true;
    return lease;
  }

  releaseEntry(
    entry: PoolEntry,
    generation: number,
    lease: VNIParticleComboPlayerLeaseImpl,
  ): void {
    if (
      entry.generation !== generation ||
      entry.lease !== lease ||
      !this.active.delete(entry)
    ) {
      return;
    }
    entry.lease = null;
    if (this.destroyed) {
      entry.player.destroy();
      return;
    }
    try {
      entry.player
        .getDisplayObject()
        .parent?.removeChild(entry.player.getDisplayObject());
      applyProjectVariant(entry.project, this.authoredProject);
      entry.player.resetForPoolReuse();
      if (this.idle.length < this.maxIdleInstances) {
        this.idle.push(entry);
      } else {
        entry.player.destroy();
      }
    } catch (error) {
      entry.player.destroy();
      throw error;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.disposeTemplateDestroy();
    for (const entry of this.active) {
      entry.lease?.invalidate();
      entry.lease = null;
      entry.player.destroy();
    }
    for (const entry of this.idle) entry.player.destroy();
    this.active.clear();
    this.idle.length = 0;
    this.onDestroy();
  }

  private assertAvailable(): void {
    if (this.destroyed) {
      throw new Error("VNIRuntime pool has been destroyed.");
    }
  }
}

class VNIParticleComboPlayerLeaseImpl implements VNIParticleComboPlayerLease {
  private released = false;
  private started = false;
  private disposeCompletion: (() => void) | null = null;
  private rejectPending: ((error: Error) => void) | null = null;

  constructor(
    private readonly pool: VNIRuntimePoolImpl,
    private readonly entry: PoolEntry,
    private readonly generation: number,
    readonly timing: VNIParticleComboTimingDescriptor,
  ) {}

  get player(): VNIRuntime {
    return this.entry.player;
  }

  playOnce(): Promise<VNIPlaybackCompleteContext> {
    if (this.released) {
      return Promise.reject(new Error("VNI player pool lease was released."));
    }
    if (this.started) {
      return Promise.reject(
        new Error("VNI player pool lease playOnce() may only be called once."),
      );
    }
    this.started = true;
    return new Promise((resolve, reject) => {
      this.rejectPending = reject;
      this.disposeCompletion = this.player.onPlaybackComplete((event) => {
        if (this.released) return;
        this.disposeCompletion?.();
        this.disposeCompletion = null;
        try {
          this.releaseInternal();
          this.rejectPending = null;
          resolve(event);
        } catch (error) {
          this.rejectPending = null;
          reject(error);
        }
      });
      try {
        this.player.playRange({
          range: this.timing.range,
          loop: false,
        });
      } catch (error) {
        this.disposeCompletion?.();
        this.disposeCompletion = null;
        this.rejectPending = null;
        this.releaseInternal();
        reject(error);
      }
    });
  }

  release(): void {
    if (this.released) return;
    this.rejectPending?.(
      new Error(
        "VNI player pool lease was released before playback completed.",
      ),
    );
    this.rejectPending = null;
    this.disposeCompletion?.();
    this.disposeCompletion = null;
    this.releaseInternal();
  }

  invalidate(): void {
    if (this.released) return;
    this.released = true;
    this.rejectPending?.(
      new Error("VNI player pool was destroyed before playback completed."),
    );
    this.rejectPending = null;
    this.disposeCompletion?.();
    this.disposeCompletion = null;
  }

  private releaseInternal(): void {
    if (this.released) return;
    this.released = true;
    this.pool.releaseEntry(this.entry, this.generation, this);
  }
}

function applyProjectVariant(
  target: VNIProjectConfig,
  source: VNIProjectConfig,
): void {
  target.stage.duration = source.stage.duration;
  for (const targetLayer of target.layers) {
    const sourceLayer = findLayer(source, targetLayer.id);
    for (const targetAnimation of targetLayer.animations) {
      const sourceAnimation = findAnimation(sourceLayer, targetAnimation.id);
      if (targetAnimation.type !== sourceAnimation.type) {
        throw new Error(
          `VNI pool animation type changed for "${targetAnimation.id}".`,
        );
      }
      if (targetAnimation.type !== "particle_combo") continue;
      targetAnimation.duration = sourceAnimation.duration;
      targetAnimation.params.targetX = sourceAnimation.params.targetX;
      targetAnimation.params.targetY = sourceAnimation.params.targetY;
    }
  }
}

function findLayer(project: VNIProjectConfig, layerId: string): V5GLayerConfig {
  const layer = project.layers.find((candidate) => candidate.id === layerId);
  if (!layer)
    throw new Error(`VNI pool project is missing layer "${layerId}".`);
  return layer;
}

function findAnimation(
  layer: V5GLayerConfig,
  animationId: string,
): V5GAnimationConfig {
  const animation = layer.animations.find(
    (candidate) => candidate.id === animationId,
  );
  if (!animation) {
    throw new Error(
      `VNI pool layer "${layer.id}" is missing animation "${animationId}".`,
    );
  }
  return animation;
}

function normalizeMaxIdleInstances(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      "maxIdleInstancesPerPlayer must be a non-negative integer.",
    );
  }
  return value;
}
