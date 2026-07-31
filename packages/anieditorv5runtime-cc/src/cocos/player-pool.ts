import type { Node, SpriteFrame } from "cc";
import {
  createVNIParticleComboTargetVariant,
  listVNIParticleComboTargetAnimations,
  type VNIParticleComboAnimationDescriptor,
  type VNIParticleComboAnimationRef,
  type VNIParticleComboTarget,
  type VNIParticleComboTimingDescriptor,
  type VNIParticleComboTimingMode,
} from "../core/particle-combo-variant.js";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GProjectConfig,
} from "../core/types.js";
import { V5GCocosPlayer } from "./player.js";
import type { V5GCocosPlaybackCompleteContext } from "./types.js";

export interface V5GCocosPlayerPoolManagerOptions {
  readonly maxIdleInstancesPerPlayer?: number;
}

export interface V5GCocosParticleComboLeaseOptions {
  readonly animation: VNIParticleComboAnimationRef;
  readonly target: VNIParticleComboTarget;
  readonly timing?: VNIParticleComboTimingMode;
}

export interface V5GCocosPlayerPoolStats {
  readonly active: number;
  readonly idle: number;
  readonly created: number;
  readonly reused: number;
}

export interface V5GCocosParticleComboPlayerLease<
  TNode = Node,
  TSpriteFrame = SpriteFrame,
> {
  readonly player: V5GCocosPlayer<TNode, TSpriteFrame>;
  readonly timing: VNIParticleComboTimingDescriptor;
  playOnce(): Promise<V5GCocosPlaybackCompleteContext>;
  release(): void;
}

export interface V5GCocosPlayerPool<TNode = Node, TSpriteFrame = SpriteFrame> {
  listParticleComboAnimations(): readonly VNIParticleComboAnimationDescriptor[];
  getStats(): V5GCocosPlayerPoolStats;
  acquire(
    options: V5GCocosParticleComboLeaseOptions,
  ): V5GCocosParticleComboPlayerLease<TNode, TSpriteFrame>;
}

interface PoolEntry<TNode, TSpriteFrame> {
  readonly player: V5GCocosPlayer<TNode, TSpriteFrame>;
  readonly project: V5GProjectConfig;
  generation: number;
  lease: V5GCocosParticleComboPlayerLeaseImpl<TNode, TSpriteFrame> | null;
}

const managersByTemplate = new WeakMap<object, object>();

export class V5GCocosPlayerPoolManager<
  TNode = Node,
  TSpriteFrame = SpriteFrame,
> {
  private readonly pools = new Map<
    V5GCocosPlayer<TNode, TSpriteFrame>,
    V5GCocosPlayerPoolImpl<TNode, TSpriteFrame>
  >();
  private readonly maxIdleInstancesPerPlayer: number;
  private destroyed = false;

  constructor(options: V5GCocosPlayerPoolManagerOptions = {}) {
    this.maxIdleInstancesPerPlayer = normalizeMaxIdleInstances(
      options.maxIdleInstancesPerPlayer ?? 2,
    );
  }

  getPool(
    template: V5GCocosPlayer<TNode, TSpriteFrame>,
  ): V5GCocosPlayerPool<TNode, TSpriteFrame> {
    if (this.destroyed) {
      throw new Error(
        "Cannot get a pool from a destroyed V5GCocosPlayerPoolManager.",
      );
    }
    const existing = this.pools.get(template);
    if (existing) return existing;
    const currentManager = managersByTemplate.get(template);
    if (currentManager && currentManager !== this) {
      throw new Error(
        "A V5GCocosPlayer template cannot be registered with multiple live pool managers.",
      );
    }
    const pool = new V5GCocosPlayerPoolImpl(
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

  destroyPool(template: V5GCocosPlayer<TNode, TSpriteFrame>): void {
    this.pools.get(template)?.destroy();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const pool of [...this.pools.values()]) pool.destroy();
    this.pools.clear();
  }
}

class V5GCocosPlayerPoolImpl<TNode, TSpriteFrame> implements V5GCocosPlayerPool<
  TNode,
  TSpriteFrame
> {
  private readonly authoredProject: V5GProjectConfig;
  private readonly idle: PoolEntry<TNode, TSpriteFrame>[] = [];
  private readonly active = new Set<PoolEntry<TNode, TSpriteFrame>>();
  private readonly disposeTemplateDestroy: () => void;
  private created = 0;
  private reused = 0;
  private destroyed = false;

  constructor(
    private readonly template: V5GCocosPlayer<TNode, TSpriteFrame>,
    private readonly maxIdleInstances: number,
    private readonly onDestroy: () => void,
  ) {
    template.assertPoolTemplateAttached();
    this.authoredProject = template.getProjectSnapshot();
    this.disposeTemplateDestroy = template.onDestroy(() => this.destroy());
  }

  listParticleComboAnimations(): readonly VNIParticleComboAnimationDescriptor[] {
    this.assertAvailable();
    return listVNIParticleComboTargetAnimations(this.authoredProject);
  }

  getStats(): V5GCocosPlayerPoolStats {
    return Object.freeze({
      active: this.active.size,
      idle: this.idle.length,
      created: this.created,
      reused: this.reused,
    });
  }

  acquire(
    options: V5GCocosParticleComboLeaseOptions,
  ): V5GCocosParticleComboPlayerLease<TNode, TSpriteFrame> {
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
        entry.player.resetForPoolReuse();
        entry.player.attachForPoolReuse();
        this.reused += 1;
      } catch (error) {
        entry.player.destroy();
        throw error;
      }
    } else {
      const project = structuredClone(variant.project);
      const player = this.template.createPoolClone(project);
      try {
        player.init();
        player.resetForPoolReuse();
      } catch (error) {
        player.destroy();
        throw error;
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
    const lease = new V5GCocosParticleComboPlayerLeaseImpl(
      this,
      entry,
      entry.generation,
      variant.timing,
    );
    entry.lease = lease;
    this.active.add(entry);
    return lease;
  }

  releaseEntry(
    entry: PoolEntry<TNode, TSpriteFrame>,
    generation: number,
    lease: V5GCocosParticleComboPlayerLeaseImpl<TNode, TSpriteFrame>,
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
      applyProjectVariant(entry.project, this.authoredProject);
      entry.player.resetForPoolReuse();
      entry.player.detachForPoolReuse();
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
      throw new Error("V5GCocosPlayer pool has been destroyed.");
    }
  }
}

class V5GCocosParticleComboPlayerLeaseImpl<
  TNode,
  TSpriteFrame,
> implements V5GCocosParticleComboPlayerLease<TNode, TSpriteFrame> {
  private released = false;
  private started = false;
  private disposeCompletion: (() => void) | null = null;
  private rejectPending: ((error: Error) => void) | null = null;

  constructor(
    private readonly pool: V5GCocosPlayerPoolImpl<TNode, TSpriteFrame>,
    private readonly entry: PoolEntry<TNode, TSpriteFrame>,
    private readonly generation: number,
    readonly timing: VNIParticleComboTimingDescriptor,
  ) {}

  get player(): V5GCocosPlayer<TNode, TSpriteFrame> {
    return this.entry.player;
  }

  playOnce(): Promise<V5GCocosPlaybackCompleteContext> {
    if (this.released) {
      return Promise.reject(
        new Error("V5G Cocos player pool lease was released."),
      );
    }
    if (this.started) {
      return Promise.reject(
        new Error(
          "V5G Cocos player pool lease playOnce() may only be called once.",
        ),
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
        "V5G Cocos player pool lease was released before playback completed.",
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
      new Error(
        "V5G Cocos player pool was destroyed before playback completed.",
      ),
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
  target: V5GProjectConfig,
  source: V5GProjectConfig,
): void {
  target.stage.duration = source.stage.duration;
  for (const targetLayer of target.layers) {
    const sourceLayer = findLayer(source, targetLayer.id);
    for (const targetAnimation of targetLayer.animations) {
      const sourceAnimation = findAnimation(sourceLayer, targetAnimation.id);
      if (targetAnimation.type !== sourceAnimation.type) {
        throw new Error(
          `V5G Cocos pool animation type changed for "${targetAnimation.id}".`,
        );
      }
      if (targetAnimation.type !== "particle_combo") continue;
      targetAnimation.duration = sourceAnimation.duration;
      targetAnimation.params.targetX = sourceAnimation.params.targetX;
      targetAnimation.params.targetY = sourceAnimation.params.targetY;
    }
  }
}

function findLayer(project: V5GProjectConfig, layerId: string): V5GLayerConfig {
  const layer = project.layers.find((candidate) => candidate.id === layerId);
  if (!layer) {
    throw new Error(`V5G Cocos pool project is missing layer "${layerId}".`);
  }
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
      `V5G Cocos pool layer "${layer.id}" is missing animation "${animationId}".`,
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
