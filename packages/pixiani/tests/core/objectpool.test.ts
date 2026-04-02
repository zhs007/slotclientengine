import { describe, expect, it } from "vitest";
import gsap from "gsap";
import { ObjectPool } from "../../src/core/objectpool";
import { VisualEntity } from "../../src/core/visualentity";

class PooledEntity extends VisualEntity {
  initCount = 0;
  resetCount = 0;

  init(_config?: unknown) {
    this.initCount += 1;
    this.finished = false;
    this.killTimeline();
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
    const pool = new ObjectPool(() => new PooledEntity(), 1);
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
