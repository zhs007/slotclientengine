import { Container } from "pixi.js";
import { ObjectPool } from "./objectpool.js";
import { VisualEntity } from "./visualentity.js";

type ManagedEntity<TConfig, TEntity extends VisualEntity<TConfig>> = {
  entity: TEntity;
  pool: ObjectPool<TConfig, TEntity>;
  parent?: Container | null;
};

export class EntityManager {
  private active: ManagedEntity<unknown, VisualEntity<unknown>>[] = [];

  add<TConfig, TEntity extends VisualEntity<TConfig>>(
    entity: TEntity,
    pool: ObjectPool<TConfig, TEntity>,
    parent?: Container | null
  ) {
    this.active.push({
      entity,
      pool,
      parent: parent ?? entity.parent
    });
  }

  update(deltaSeconds: number) {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const record = this.active[i];
      record.entity.update(deltaSeconds);

      if (record.entity.finished) {
        const parent = record.parent ?? record.entity.parent;
        parent?.removeChild(record.entity);
        record.pool.return(record.entity);
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
