import { createGameLoading } from "../src/index.js";

describe("game loading controller", () => {
  it("advances weighted resources to 99 before completing at 100", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const first = createDeferred("a");
    const second = createDeferred("b");
    const events: string[] = [];
    const loading = createGameLoading({
      root,
      resources: [
        { id: "a", weight: 1, load: () => first.promise },
        { id: "b", weight: 3, load: () => second.promise },
      ],
      onBeforeComplete: ({ loadedResources }) => {
        events.push(
          `before:${progressText(root)}:${loadedResources.get("a")}:${loadedResources.get("b")}`,
        );
        return "prepared";
      },
      onEnterGame: ({ prepareResult }) => {
        events.push(`enter:${progressText(root)}:${prepareResult}`);
      },
    });

    const start = loading.start();
    first.resolve();
    await waitForProgress(root, "25%");
    expect(progressText(root)).toBe("25%");

    second.resolve();
    await start;

    expect(progressText(root)).toBe("100%");
    expect(events).toEqual(["before:99%:a:b", "enter:100%:prepared"]);
    expect(loading.loadedResources.get("a")).toBe("a");
    expect(loading.loadedResources.get("b")).toBe("b");
  });

  it("stops before callbacks when a resource or 99 percent callback fails", async () => {
    const resourceRoot = document.createElement("div");
    const resourceEvents: string[] = [];
    document.body.append(resourceRoot);
    await createGameLoading({
      root: resourceRoot,
      resources: [{ id: "bad", load: () => Promise.reject(new Error("bad")) }],
      onBeforeComplete: () => {
        resourceEvents.push("before");
      },
      onEnterGame: () => {
        resourceEvents.push("enter");
      },
      onError: (error) => {
        resourceEvents.push(`error:${error.message}`);
      },
    }).start();

    expect(resourceEvents).toEqual(["error:bad"]);
    expect(resourceRoot.querySelector('[role="alert"]')?.textContent).toBe(
      "bad",
    );

    const beforeRoot = document.createElement("div");
    const beforeEvents: string[] = [];
    document.body.append(beforeRoot);
    await createGameLoading({
      root: beforeRoot,
      resources: [{ id: "ok", load: () => undefined }],
      onBeforeComplete: () => {
        beforeEvents.push(`before:${progressText(beforeRoot)}`);
        throw new Error("live failed");
      },
      onEnterGame: () => {
        beforeEvents.push("enter");
      },
      onError: (error) => {
        beforeEvents.push(`error:${error.message}`);
      },
    }).start();

    expect(beforeEvents).toEqual(["before:99%", "error:live failed"]);
    expect(progressText(beforeRoot)).toBe("99%");
  });

  it("does not update DOM or call later callbacks after destroy", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const resource = createDeferred("done");
    const events: string[] = [];
    const loading = createGameLoading({
      root,
      resources: [{ id: "slow", load: () => resource.promise }],
      onBeforeComplete: () => {
        events.push("before");
      },
      onEnterGame: () => {
        events.push("enter");
      },
      onError: () => {
        events.push("error");
      },
    });
    const start = loading.start();

    loading.destroy();
    resource.resolve();
    await start;

    expect(events).toEqual([]);
    expect(root.childElementCount).toBe(0);
  });

  it("validates root, ids, duplicate ids, URL contracts and weights", () => {
    const root = document.createElement("div");
    const base = {
      root,
      onBeforeComplete: () => undefined,
      onEnterGame: () => undefined,
    };

    expect(() =>
      createGameLoading({ ...base, root: null as never, resources: [] }),
    ).toThrow(/HTMLElement/);
    expect(() =>
      createGameLoading({
        ...base,
        onBeforeComplete: null as never,
        resources: [{ id: "a", load: () => undefined }],
      }),
    ).toThrow(/onBeforeComplete/);
    expect(() =>
      createGameLoading({
        ...base,
        onEnterGame: null as never,
        resources: [{ id: "a", load: () => undefined }],
      }),
    ).toThrow(/onEnterGame/);
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
        resources: [{ id: "a", weight: 0, load: () => undefined }],
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
  });
});

function progressText(root: HTMLElement): string {
  return (
    root.querySelector(".sce-game-loading__meta span:last-child")
      ?.textContent ?? ""
  );
}

async function waitForProgress(
  root: HTMLElement,
  expected: string,
): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
    if (progressText(root) === expected) {
      return;
    }
  }
}

function createDeferred(value: string): {
  readonly promise: Promise<string>;
  resolve(): void;
} {
  let resolve: (value: string) => void = () => undefined;
  const promise = new Promise<string>((innerResolve) => {
    resolve = innerResolve;
  });
  return {
    promise,
    resolve: () => resolve(value),
  };
}
