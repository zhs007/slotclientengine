export interface SpinLifecycleUnit {
  readonly x: number;
  readonly y?: number;
}

export type SpinLifecycleEvent =
  | {
      readonly lifecycle: "started" | "stopped";
      readonly unit: SpinLifecycleUnit;
    }
  | {
      readonly lifecycle: "spin-started";
    }
  | {
      readonly lifecycle: "all-stopped";
      readonly unitCount: number;
    }
  | {
      readonly lifecycle: "spin-ended";
      readonly unitCount: number;
    };

export type SpinLifecycleObserver = (event: SpinLifecycleEvent) => void;

const observers = new WeakMap<object, Set<SpinLifecycleObserver>>();

export function observeSpinLifecycle(
  owner: object,
  observer: SpinLifecycleObserver,
): () => void {
  const registered = observers.get(owner) ?? new Set<SpinLifecycleObserver>();
  registered.add(observer);
  observers.set(owner, registered);
  const ownerRef = new WeakRef(owner);
  return () => {
    registered.delete(observer);
    const observed = ownerRef.deref();
    if (observed && registered.size === 0) observers.delete(observed);
  };
}

export class SpinLifecycleTracker {
  readonly #owner: object;
  readonly #pending = new Map<string, SpinLifecycleUnit>();
  readonly #started = new Set<string>();
  #unitCount = 0;
  #spinStarted = false;
  #canComplete = true;

  constructor(owner: object) {
    this.#owner = owner;
  }

  begin(units: Iterable<SpinLifecycleUnit>): void {
    const wasIdle = this.#pending.size === 0;
    if (wasIdle) {
      this.#unitCount = 0;
      this.#canComplete = true;
    }
    for (const unit of units) {
      const key = unitKey(unit);
      if (this.#pending.has(key)) continue;
      this.#pending.set(key, Object.freeze({ ...unit }));
      this.#unitCount += 1;
    }
    if (wasIdle && this.#pending.size > 0) {
      this.#spinStarted = true;
      emit(this.#owner, Object.freeze({ lifecycle: "spin-started" }));
    }
  }

  started(unit: SpinLifecycleUnit): void {
    const key = unitKey(unit);
    const registered = this.#pending.get(key);
    if (!registered || this.#started.has(key)) return;
    this.#started.add(key);
    emit(
      this.#owner,
      Object.freeze({ lifecycle: "started", unit: registered }),
    );
  }

  stopped(unit: SpinLifecycleUnit): void {
    const key = unitKey(unit);
    const registered = this.#pending.get(key);
    if (!registered) return;
    this.#pending.delete(key);
    this.#started.delete(key);
    emit(
      this.#owner,
      Object.freeze({ lifecycle: "stopped", unit: registered }),
    );
    if (this.#pending.size !== 0) return;
    const unitCount = this.#unitCount;
    const spinStarted = this.#spinStarted;
    const canComplete = this.#canComplete;
    this.reset();
    if (canComplete) {
      emit(this.#owner, Object.freeze({ lifecycle: "all-stopped", unitCount }));
      if (spinStarted)
        emit(
          this.#owner,
          Object.freeze({ lifecycle: "spin-ended", unitCount }),
        );
    }
  }

  cancel(unit?: SpinLifecycleUnit): void {
    if (this.#pending.size === 0) return;
    this.#canComplete = false;
    if (unit) {
      const key = unitKey(unit);
      this.#pending.delete(key);
      this.#started.delete(key);
      if (this.#pending.size !== 0) return;
    }
    this.reset();
  }

  private reset(): void {
    this.#pending.clear();
    this.#started.clear();
    this.#unitCount = 0;
    this.#spinStarted = false;
    this.#canComplete = true;
  }
}

function unitKey(unit: SpinLifecycleUnit): string {
  return unit.y === undefined ? String(unit.x) : `${unit.x}\u0000${unit.y}`;
}

function emit(owner: object, event: SpinLifecycleEvent): void {
  for (const observer of observers.get(owner) ?? []) observer(event);
}
