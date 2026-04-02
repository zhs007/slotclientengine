import { describe, expect, it } from "vitest";
import gsap from "gsap";
import { Container } from "pixi.js";
import { EntityManager } from "../../src/core/entitymanager";
import { ObjectPool } from "../../src/core/objectpool";
import { VisualEntity } from "../../src/core/visualentity";

class ManagedEntity extends VisualEntity {
  updates: number[] = [];

  init(_config?: unknown) {
    this.finished = false;
    this.killTimeline();
    this.timeline = gsap.timeline();
  }

  update(delta: number) {
    this.updates.push(delta);
  }

  reset() {
    this.killTimeline();
  }
}

describe("EntityManager", () => {
  it("updates entities and sweeps finished ones", () => {
    const manager = new EntityManager();
    const pool = new ObjectPool(() => new ManagedEntity(), 0);
    const parent = new Container();

    const entity = pool.get({});
    parent.addChild(entity);
    manager.add(entity, pool, parent);

    manager.update(0.5);
    expect(entity.updates).toEqual([0.5]);
    expect(manager.count).toBe(1);

    entity.finished = true;
    manager.update(0.1);

    expect(manager.count).toBe(0);
    expect(parent.children.includes(entity)).toBe(false);
    expect(pool.available).toBe(1);
  });

  it("falls back to entity parent when parent not provided", () => {
    const manager = new EntityManager();
    const pool = new ObjectPool(() => new ManagedEntity(), 0);
    const parent = new Container();

    const entity = pool.get({});
    parent.addChild(entity);
    manager.add(entity, pool);

    entity.finished = true;
    manager.update(0.16);

    expect(parent.children.includes(entity)).toBe(false);
    expect(manager.count).toBe(0);
  });

  it("clear removes all active entities", () => {
    const manager = new EntityManager();
    const pool = new ObjectPool(() => new ManagedEntity(), 0);

    const first = pool.get({});
    const second = pool.get({});
    manager.add(first, pool);
    manager.add(second, pool);

    expect(manager.count).toBe(2);
    manager.clear();
    expect(manager.count).toBe(0);
  });
});
