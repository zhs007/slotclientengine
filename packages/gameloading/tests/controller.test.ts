import {
  createGameLoading,
  type GameLoadingUi,
  type GameLoadingUiFactory,
  type GameLoadingUiSnapshot,
} from "../src/index.js";

describe("game loading controller", () => {
  it("starts readiness with resources and keeps 99 as a join barrier", async () => {
    const readiness = createDeferred<string>();
    const resource = createDeferred<string>();
    const events: string[] = [];
    const before = vi.fn((_readinessResult: string) => "prepared");
    const fake = createFakeUi();
    const loading = createGameLoading({
      root: createRoot(),
      ui: fake.factory,
      readiness: {
        start: ({ signal }) => {
          events.push(`readiness:${signal.aborted}`);
          return readiness.promise;
        },
        dispose: vi.fn(),
      },
      resources: [
        {
          id: "resource",
          load: ({ signal }) => {
            events.push(`resource:${signal.aborted}`);
            return resource.promise;
          },
        },
      ],
      onBeforeComplete: ({ readinessResult }) => before(readinessResult),
      onEnterGame: () => undefined,
    });
    const start = loading.start();
    expect(events).toEqual(["readiness:false", "resource:false"]);
    resource.resolve("loaded");
    await waitFor(() => fake.snapshots.at(-1)?.phase === "preparing");
    expect(fake.snapshots.at(-1)?.progress).toBe(99);
    expect(before).not.toHaveBeenCalled();
    readiness.resolve("ready");
    await start;
    expect(before).toHaveBeenCalledWith("ready");
  });

  it("aborts resources on an early readiness failure", async () => {
    const failure = new Error("readiness failed");
    const pending = createDeferred<void>();
    let resourceSignal: AbortSignal | undefined;
    const loading = createGameLoading({
      root: createRoot(),
      ui: createFakeUi().factory,
      readiness: {
        start: () => Promise.reject(failure),
        dispose: vi.fn(),
      },
      resources: [
        {
          id: "resource",
          load: ({ signal }) => {
            resourceSignal = signal;
            return pending.promise;
          },
        },
      ],
      onBeforeComplete: () => undefined,
      onEnterGame: () => undefined,
    });
    await expect(loading.start()).rejects.toBe(failure);
    expect(resourceSignal?.aborted).toBe(true);
  });

  it("aborts readiness on resource failure and disposes a late fulfillment", async () => {
    const readiness = createDeferred<{ readonly id: string }>();
    const dispose = vi.fn();
    let readinessSignal: AbortSignal | undefined;
    const failure = new Error("resource failed");
    const loading = createGameLoading({
      root: createRoot(),
      ui: createFakeUi().factory,
      readiness: {
        start: ({ signal }) => {
          readinessSignal = signal;
          return readiness.promise;
        },
        dispose,
      },
      resources: [{ id: "resource", load: () => Promise.reject(failure) }],
      onBeforeComplete: () => undefined,
      onEnterGame: () => undefined,
    });
    await expect(loading.start()).rejects.toBe(failure);
    expect(readinessSignal?.aborted).toBe(true);
    const result = Object.freeze({ id: "late" });
    readiness.resolve(result);
    await waitFor(() => dispose.mock.calls.length === 1);
    expect(dispose).toHaveBeenCalledWith(result);
  });

  it.each(["visual", "prepare"] as const)(
    "disposes fulfilled readiness exactly once after a %s failure",
    async (stage) => {
      const result = Object.freeze({ id: "ready" });
      const dispose = vi.fn(async () => {
        throw new Error("cleanup failure");
      });
      const failure = new Error(`${stage} failed`);
      const loading = createGameLoading({
        root: createRoot(),
        ui: createFakeUi({
          readyToComplete:
            stage === "visual" ? Promise.reject(failure) : Promise.resolve(),
        }).factory,
        readiness: { start: () => result, dispose },
        resources: [{ id: "resource", load: () => "loaded" }],
        onBeforeComplete: () => {
          if (stage === "prepare") throw failure;
        },
        onEnterGame: () => undefined,
      });
      await expect(loading.start()).rejects.toBe(failure);
      expect(dispose).toHaveBeenCalledOnce();
      expect(dispose).toHaveBeenCalledWith(result);
      loading.destroy();
      expect(dispose).toHaveBeenCalledOnce();
    },
  );

  it("transfers readiness ownership after successful finalization", async () => {
    const result = Object.freeze({ id: "ready" });
    const dispose = vi.fn();
    const loading = createGameLoading({
      root: createRoot(),
      ui: createFakeUi().factory,
      readiness: { start: () => result, dispose },
      resources: [{ id: "resource", load: () => "loaded" }],
      onBeforeComplete: ({ readinessResult }) => {
        expect(readinessResult).toBe(result);
        return "prepared";
      },
      onEnterGame: () => {
        throw new Error("entered owner failed");
      },
    });
    await expect(loading.start()).rejects.toThrow(/entered owner failed/);
    loading.destroy();
    expect(dispose).not.toHaveBeenCalled();
  });

  it("publishes immutable weighted snapshots and waits for both completion gates", async () => {
    const root = createRoot();
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    const prepare = createDeferred<string>();
    const visual = createDeferred<void>();
    const enter = createDeferred<void>();
    const fake = createFakeUi({ readyToComplete: visual.promise });
    const events: string[] = [];
    const loading = createGameLoading({
      root,
      ui: fake.factory,
      resources: [
        { id: "a", weight: 1, load: () => first.promise },
        { id: "b", weight: 3, load: () => second.promise },
      ],
      onBeforeComplete: ({ loadedResources, signal }) => {
        events.push(
          `prepare:${loadedResources.get("a")}:${loadedResources.get("b")}:${signal.aborted}`,
        );
        return prepare.promise;
      },
      onEnterGame: ({ prepareResult, signal }) => {
        events.push(`enter:${prepareResult}:${signal.aborted}`);
        return enter.promise;
      },
    });

    expect(fake.snapshots).toEqual([
      { phase: "loading-resources", progress: 0, error: null },
    ]);
    expect(Object.isFrozen(fake.snapshots[0])).toBe(true);
    const start = loading.start();
    first.resolve("a");
    await waitFor(() => fake.snapshots.length === 2);
    expect(fake.snapshots.at(-1)?.progress).toBe(24.75);
    second.resolve("b");
    await waitFor(() => fake.snapshots.at(-1)?.phase === "preparing");
    expect(fake.snapshots.at(-1)).toEqual({
      phase: "preparing",
      progress: 99,
      error: null,
    });
    expect(events).toHaveLength(0);

    visual.resolve();
    await waitFor(() => events.length === 1);
    prepare.resolve("prepared");
    expect(events).toHaveLength(1);
    await waitFor(() => events.length === 2);
    expect(fake.snapshots.at(-1)).toEqual({
      phase: "entering-game",
      progress: 100,
      error: null,
    });
    expect(fake.events).not.toContain("exit");

    enter.resolve();
    await start;
    expect(fake.events.slice(-2)).toEqual(["exit", "destroy"]);
    expect(root.hidden).toBe(true);
    expect(loading.loadedResources).toEqual(
      new Map([
        ["a", "a"],
        ["b", "b"],
      ]),
    );
  });

  it("does not enter when visual readiness finishes before business preparation", async () => {
    const prepare = createDeferred<string>();
    const fake = createFakeUi({ readyToComplete: Promise.resolve() });
    const enter = vi.fn();
    const start = createGameLoading({
      root: createRoot(),
      ui: fake.factory,
      resources: [{ id: "resource", load: () => "ok" }],
      onBeforeComplete: () => prepare.promise,
      onEnterGame: enter,
    }).start();

    await waitFor(() => fake.snapshots.at(-1)?.phase === "preparing");
    expect(enter).not.toHaveBeenCalled();
    prepare.resolve("prepared");
    await start;
    expect(enter).toHaveBeenCalledOnce();
  });

  it("limits resource concurrency and reuses the same start promise", async () => {
    const first = createDeferred<void>();
    const second = createDeferred<void>();
    const third = createDeferred<void>();
    const events: string[] = [];
    const loading = createGameLoading({
      root: createRoot(),
      ui: createFakeUi().factory,
      maxConcurrentResources: 2,
      resources: [first, second, third].map((deferred, index) => ({
        id: String(index),
        load: () => {
          events.push(`start:${index}`);
          return deferred.promise;
        },
      })),
      onBeforeComplete: () => undefined,
      onEnterGame: () => undefined,
    });

    const firstStart = loading.start();
    expect(loading.start()).toBe(firstStart);
    await waitFor(() => events.length === 2);
    expect(events).toEqual(["start:0", "start:1"]);
    first.resolve();
    await waitFor(() => events.length === 3);
    second.resolve();
    third.resolve();
    await firstStart;
  });

  it.each([
    ["resource", "resource failed"],
    ["prepare", "prepare failed"],
    ["visual", "visual failed"],
    ["enter", "enter failed"],
    ["exit", "exit failed"],
  ] as const)(
    "rejects the same Error and preserves visible UI after a %s failure",
    async (stage, message) => {
      const failure = new Error(message);
      const fake = createFakeUi({
        readyToComplete:
          stage === "visual" ? Promise.reject(failure) : Promise.resolve(),
        exitError: stage === "exit" ? failure : undefined,
      });
      const root = createRoot();
      const onError = vi.fn();
      const before = vi.fn(() => {
        if (stage === "prepare") {
          throw failure;
        }
      });
      const enter = vi.fn(() => {
        if (stage === "enter") {
          throw failure;
        }
      });
      const start = createGameLoading({
        root,
        ui: fake.factory,
        resources: [
          {
            id: "resource",
            load: () => {
              if (stage === "resource") {
                throw failure;
              }
              return "ok";
            },
          },
        ],
        onBeforeComplete: before,
        onEnterGame: enter,
        onError,
      }).start();

      await expect(start).rejects.toBe(failure);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(failure);
      expect(fake.snapshots.at(-1)).toMatchObject({
        phase: "error",
        error: message,
      });
      expect(root.hidden).toBe(false);
      expect(fake.events).not.toContain("destroy");
      if (stage === "resource") {
        expect(before).not.toHaveBeenCalled();
      }
      if (["resource", "prepare", "visual"].includes(stage)) {
        expect(enter).not.toHaveBeenCalled();
      }
    },
  );

  it("aborts immediately, destroys idempotently, and suppresses later work", async () => {
    const never = createDeferred<void>();
    const fake = createFakeUi();
    const events: string[] = [];
    let receivedSignal: AbortSignal | undefined;
    const root = createRoot();
    const loading = createGameLoading({
      root,
      ui: fake.factory,
      maxConcurrentResources: 1,
      resources: [
        {
          id: "first",
          load: ({ signal }) => {
            receivedSignal = signal;
            events.push("first");
            return never.promise;
          },
        },
        { id: "second", load: () => events.push("second") },
      ],
      onBeforeComplete: () => {
        events.push("prepare");
      },
      onEnterGame: () => {
        events.push("enter");
      },
      onError: () => {
        events.push("error");
      },
    });
    const start = loading.start();
    await waitFor(() => events.length === 1);

    loading.destroy();
    loading.destroy();
    await start;
    expect(receivedSignal?.aborted).toBe(true);
    expect(events).toEqual(["first"]);
    expect(fake.events.filter((event) => event === "destroy")).toHaveLength(1);
    expect(root.hidden).toBe(true);
    const snapshotCount = fake.snapshots.length;
    never.resolve();
    await flush();
    expect(fake.snapshots).toHaveLength(snapshotCount);
  });

  it.each(["prepare", "enter"] as const)(
    "settles immediately when destroyed during %s",
    async (stage) => {
      const pending = createDeferred<void>();
      const fake = createFakeUi();
      const loading = createGameLoading({
        root: createRoot(),
        ui: fake.factory,
        resources: [{ id: "resource", load: () => undefined }],
        onBeforeComplete: () =>
          stage === "prepare" ? pending.promise : undefined,
        onEnterGame: () => (stage === "enter" ? pending.promise : undefined),
      });
      const start = loading.start();
      await waitFor(
        () =>
          fake.snapshots.at(-1)?.phase ===
          (stage === "prepare" ? "preparing" : "entering-game"),
      );
      loading.destroy();
      await expect(start).resolves.toBeUndefined();
      pending.resolve();
    },
  );

  it("keeps multiple instances isolated", async () => {
    const first = createFakeUi();
    const second = createFakeUi();
    const options = {
      resources: [{ id: "resource", load: () => "ok" }],
      onBeforeComplete: () => undefined,
      onEnterGame: () => undefined,
    };
    await Promise.all([
      createGameLoading({
        ...options,
        root: createRoot(),
        ui: first.factory,
      }).start(),
      createGameLoading({
        ...options,
        root: createRoot(),
        ui: second.factory,
      }).start(),
    ]);
    expect(first.ui).not.toBe(second.ui);
    expect(first.snapshots).toEqual(second.snapshots);
    expect(first.events).toEqual(["create", "exit", "destroy"]);
  });

  it("validates options, resources, concurrency, and UI factories", () => {
    const root = createRoot();
    const ui = createFakeUi().factory;
    const base = {
      root,
      ui,
      onBeforeComplete: () => undefined,
      onEnterGame: () => undefined,
    };
    expect(() =>
      createGameLoading({ ...base, root: null as never, resources: [] }),
    ).toThrow(/HTMLElement/);
    expect(() =>
      createGameLoading({ ...base, ui: null as never, resources: [] }),
    ).toThrow(/ui/);
    expect(() =>
      createGameLoading({
        ...base,
        onBeforeComplete: null as never,
        resources: [],
      }),
    ).toThrow(/onBeforeComplete/);
    expect(() =>
      createGameLoading({ ...base, onEnterGame: null as never, resources: [] }),
    ).toThrow(/onEnterGame/);
    expect(() =>
      createGameLoading({ ...base, onError: "bad" as never, resources: [] }),
    ).toThrow(/onError/);
    expect(() =>
      createGameLoading({
        ...base,
        readiness: { start: vi.fn() } as never,
        resources: [],
      }),
    ).toThrow(/readiness/);
    expect(() => createGameLoading({ ...base, resources: [] })).toThrow(
      /non-empty/,
    );
    expect(() =>
      createGameLoading({
        ...base,
        resources: [{ id: " a", load: () => undefined }],
      }),
    ).toThrow(/whitespace/);
    expect(() =>
      createGameLoading({
        ...base,
        resources: [
          { id: "a", load: () => undefined },
          { id: "a", load: () => undefined },
        ],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      createGameLoading({
        ...base,
        resources: [{ id: "a", weight: Number.NaN, load: () => undefined }],
      }),
    ).toThrow(/weight/);
    expect(() =>
      createGameLoading({ ...base, resources: [{ id: "a" }] }),
    ).toThrow(/URL or custom load/);
    expect(() =>
      createGameLoading({
        ...base,
        resources: [{ id: "", load: () => undefined }],
      }),
    ).toThrow(/needs an id/);
    expect(() =>
      createGameLoading({
        ...base,
        maxConcurrentResources: 0,
        resources: [{ id: "a", load: () => undefined }],
      }),
    ).toThrow(/maxConcurrentResources/);
    expect(() =>
      createGameLoading({
        ...base,
        maxConcurrentResources: 1.5,
        resources: [{ id: "a", load: () => undefined }],
      }),
    ).toThrow(/maxConcurrentResources/);
    expect(() =>
      createGameLoading({
        ...base,
        ui: { create: () => ({}) as never },
        resources: [{ id: "a", load: () => undefined }],
      }),
    ).toThrow(/invalid UI/);
  });
});

function createRoot(): HTMLDivElement {
  const root = document.createElement("div");
  root.hidden = true;
  document.body.append(root);
  return root;
}

function createFakeUi(
  options: {
    readonly readyToComplete?: Promise<void>;
    readonly exitError?: Error;
  } = {},
): {
  readonly factory: GameLoadingUiFactory;
  readonly snapshots: GameLoadingUiSnapshot[];
  readonly events: string[];
  ui?: GameLoadingUi;
} {
  const result: {
    factory: GameLoadingUiFactory;
    snapshots: GameLoadingUiSnapshot[];
    events: string[];
    ui?: GameLoadingUi;
  } = {
    factory: undefined as never,
    snapshots: [],
    events: [],
  };
  result.factory = {
    create: () => {
      result.events.push("create");
      result.ui = {
        readyToComplete: options.readyToComplete,
        update: (snapshot) => result.snapshots.push(snapshot),
        playExit: async () => {
          result.events.push("exit");
          if (options.exitError) {
            throw options.exitError;
          }
        },
        destroy: () => result.events.push("destroy"),
      };
      return result.ui;
    },
  };
  return result;
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value?: T): void;
  reject(error: unknown): void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve: (value) => resolve(value as T), reject };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let index = 0; index < 30; index += 1) {
    await flush();
    if (condition()) {
      return;
    }
  }
  expect(condition()).toBe(true);
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
