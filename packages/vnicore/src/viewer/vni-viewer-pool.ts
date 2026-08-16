import type { VNIPlaybackCompleteContext } from "../core/vni-runtime.js";
import {
  VNIRuntimePoolManager,
  type VNIParticleComboLeaseOptions,
  type VNIParticleComboPlayerLease,
  type VNIRuntimePool,
  type VNIRuntimePoolManagerOptions,
  type VNIRuntimePoolStats,
} from "../core/vni-runtime-pool.js";
import type { VNIParticleComboAnimationDescriptor } from "../core/particle-combo-variant.js";
import type { VNIRuntime } from "../core/vni-runtime.js";
import type { VNIViewer } from "./vni-viewer.js";

export type VNIViewerPoolManagerOptions = VNIRuntimePoolManagerOptions;
export type VNIViewerPoolStats = VNIRuntimePoolStats;

export interface VNIParticleComboViewerLease {
  readonly runtime: VNIRuntime;
  readonly timing: VNIParticleComboPlayerLease["timing"];
  playOnce(): Promise<VNIPlaybackCompleteContext>;
  release(): void;
}

export interface VNIViewerPool {
  listParticleComboAnimations(): readonly VNIParticleComboAnimationDescriptor[];
  getStats(): VNIViewerPoolStats;
  acquire(
    options: VNIParticleComboLeaseOptions,
  ): Promise<VNIParticleComboViewerLease>;
}

const managersByViewer = new WeakMap<VNIViewer, VNIViewerPoolManager>();

export class VNIViewerPoolManager {
  private readonly coreManager: VNIRuntimePoolManager;
  private readonly pools = new Map<VNIViewer, VNIViewerPoolImpl>();
  private destroyed = false;

  constructor(options: VNIViewerPoolManagerOptions = {}) {
    this.coreManager = new VNIRuntimePoolManager(options);
  }

  getPool(viewer: VNIViewer): VNIViewerPool {
    if (this.destroyed) {
      throw new Error(
        "Cannot get a pool from a destroyed VNIViewerPoolManager.",
      );
    }
    const existing = this.pools.get(viewer);
    if (existing) return existing;
    const currentManager = managersByViewer.get(viewer);
    if (currentManager && currentManager !== this) {
      throw new Error(
        "A VNIViewer cannot be registered with multiple live pool managers.",
      );
    }
    const pool = new VNIViewerPoolImpl(
      viewer,
      this.coreManager.getPool(viewer.getCoreRuntime()),
    );
    managersByViewer.set(viewer, this);
    this.pools.set(viewer, pool);
    return pool;
  }

  destroyPool(viewer: VNIViewer): void {
    const pool = this.pools.get(viewer);
    if (!pool) return;
    pool.destroy();
    this.pools.delete(viewer);
    managersByViewer.delete(viewer);
    this.coreManager.destroyPool(viewer.getCoreRuntime());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const [viewer, pool] of this.pools) {
      pool.destroy();
      managersByViewer.delete(viewer);
    }
    this.pools.clear();
    this.coreManager.destroy();
  }
}

class VNIViewerPoolImpl implements VNIViewerPool {
  private readonly leases = new Set<VNIParticleComboViewerLeaseImpl>();
  private destroyed = false;

  constructor(
    private readonly viewer: VNIViewer,
    private readonly corePool: VNIRuntimePool,
  ) {}

  listParticleComboAnimations(): readonly VNIParticleComboAnimationDescriptor[] {
    return this.corePool.listParticleComboAnimations();
  }

  getStats(): VNIViewerPoolStats {
    return this.corePool.getStats();
  }

  async acquire(
    options: VNIParticleComboLeaseOptions,
  ): Promise<VNIParticleComboViewerLease> {
    if (this.destroyed) throw new Error("VNIViewer pool has been destroyed.");
    const coreLease = await this.corePool.acquire(options);
    this.viewer.applyViewportToRuntime(coreLease.player);
    const lease = new VNIParticleComboViewerLeaseImpl(
      this.viewer,
      coreLease,
      () => this.leases.delete(lease),
    );
    this.leases.add(lease);
    return lease;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const lease of [...this.leases]) lease.release();
    this.leases.clear();
  }
}

class VNIParticleComboViewerLeaseImpl implements VNIParticleComboViewerLease {
  private stopDriver: (() => void) | null = null;
  private released = false;

  constructor(
    private readonly viewer: VNIViewer,
    private readonly coreLease: VNIParticleComboPlayerLease,
    private readonly onRelease: () => void,
  ) {}

  get runtime(): VNIRuntime {
    return this.coreLease.player;
  }

  get timing(): VNIParticleComboPlayerLease["timing"] {
    return this.coreLease.timing;
  }

  async playOnce(): Promise<VNIPlaybackCompleteContext> {
    if (this.released) {
      throw new Error("VNIViewer pool lease was released.");
    }
    const completion = this.coreLease.playOnce();
    this.stopDriver = this.viewer.driveRuntime(this.runtime);
    try {
      return await completion;
    } finally {
      this.releaseDriver();
      this.released = true;
      this.onRelease();
    }
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.releaseDriver();
    this.coreLease.release();
    this.onRelease();
  }

  private releaseDriver(): void {
    this.stopDriver?.();
    this.stopDriver = null;
  }
}
