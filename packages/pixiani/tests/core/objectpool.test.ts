import { describe, expect, it } from "vitest";
import gsap from "gsap";
import { ObjectPool } from "../../src/core/objectpool.js";
import { VisualEntity } from "../../src/core/visualentity.js";

class PooledEntity extends VisualEntity<Record<string, never>> {
  initCount = 0;
  resetCount = 0;

  init(_config: Record<string, never>) {
    this.initCount += 1;
    this.beginLifecycle();
    this.timeline = gsap.timeline();
  }

  update() {}

  reset() {
    this.resetCount += 1;
    this.killTimeline();
  }
}

describe("ObjectPool", () => {
  it("reuses instances and tracks availability", () => {
    const pool = new ObjectPool<Record<string, never>, PooledEntity>(() => new PooledEntity(), 1);
    expect(pool.available).toBe(1);

    const first = pool.get({});
    expect(pool.available).toBe(0);
    expect(first.initCount).toBe(1);

    pool.return(first);
    expect(pool.available).toBe(1);
    expect(first.resetCount).toBe(1);

    const second = pool.get({});
    expect(second).toBe(first);
    expect(second.initCount).toBe(2);
  });
});
