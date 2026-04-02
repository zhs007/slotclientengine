import { Container } from "pixi.js";
import { ObjectPool } from "./objectpool";
import { VisualEntity } from "./visualentity";

type ManagedEntity<T extends VisualEntity> = {
  entity: T;
  pool: ObjectPool<T>;
  parent?: Container | null;
};

export class EntityManager {
  private active: ManagedEntity<VisualEntity>[] = [];

  add<T extends VisualEntity>(entity: T, pool: ObjectPool<T>, parent?: Container | null) {
    this.active.push({
      entity,
      pool,
      parent: parent ?? entity.parent
    });
  }

  update(delta: number) {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const record = this.active[i];
      record.entity.update(delta);

      if (record.entity.finished) {
        record.pool.return(record.entity);
        const parent = record.parent ?? record.entity.parent;
        parent?.removeChild(record.entity);
        this.active.splice(i, 1);
      }
    }
  }

  clear() {
    this.active = [];
  }

  get count() {
    return this.active.length;
  }
}

export const entityManager = new EntityManager();
