import { VisualEntity } from "./visualentity.js";

export class ObjectPool<TConfig, TEntity extends VisualEntity<TConfig>> {
  private pool: TEntity[] = [];
  private factory: () => TEntity;

  constructor(factory: () => TEntity, initialSize = 0) {
    this.factory = factory;
    for (let index = 0; index < initialSize; index += 1) {
      this.pool.push(factory());
    }
  }

  get(config: TConfig) {
    const entity = this.pool.pop() ?? this.factory();
    entity.init(config);
    return entity;
  }

  return(entity: TEntity) {
    entity.reset();
    this.pool.push(entity);
  }

  get available() {
    return this.pool.length;
  }
}