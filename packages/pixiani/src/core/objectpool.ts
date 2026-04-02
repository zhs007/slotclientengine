import { VisualEntity } from "./visualentity";

export class ObjectPool<T extends VisualEntity> {
  private pool: T[] = [];
  private factory: () => T;

  constructor(factory: () => T, initialSize = 0) {
    this.factory = factory;
    for (let i = 0; i < initialSize; i += 1) {
      this.pool.push(factory());
    }
  }

  get(config: unknown) {
    const entity = this.pool.pop() ?? this.factory();
    entity.init(config);
    return entity;
  }

  return(entity: T) {
    entity.reset();
    this.pool.push(entity);
  }

  get available() {
    return this.pool.length;
  }
}
