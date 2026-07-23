import { createIndexedDbLeoSettingsStore } from "../src/index.js";

describe("Leo IndexedDB settings store", () => {
  it("loads only the bound game rows and closes per instance", async () => {
    const fake = createFakeIndexedDb([
      { key: "GAME_A:sound", gamecode: "GAME_A", value: 0 },
      { key: "GAME_A:fastplays", gamecode: "GAME_A", value: true },
      { key: "GAME_B:sound", gamecode: "GAME_B", value: 80 },
    ]);
    const first = createIndexedDbLeoSettingsStore(fake.factory);
    expect(await first.load("GAME_A", new AbortController().signal)).toEqual({
      sound: 0,
      fastplays: true,
    });

    const second = createIndexedDbLeoSettingsStore(fake.factory);
    expect(await second.load("GAME_B", new AbortController().signal)).toEqual({
      sound: 80,
    });
    first.destroy();
    first.destroy();
    expect(fake.closeSpies[0]).toHaveBeenCalledOnce();
    await expect(
      first.load("GAME_A", new AbortController().signal),
    ).rejects.toThrow(/destroyed/);
    expect(await second.load("GAME_B", new AbortController().signal)).toEqual({
      sound: 80,
    });
    expect(fake.closeSpies[1]).not.toHaveBeenCalled();
    second.destroy();
    expect(fake.closeSpies[1]).toHaveBeenCalledOnce();
  });

  it("rejects already-aborted requests", async () => {
    const fake = createFakeIndexedDb([]);
    const store = createIndexedDbLeoSettingsStore(fake.factory);
    const controller = new AbortController();
    controller.abort();
    await expect(store.load("GAME", controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    store.destroy();
  });
});

function createFakeIndexedDb(rows: readonly Record<string, unknown>[]): {
  readonly factory: IDBFactory;
  readonly closeSpies: ReturnType<typeof vi.fn>[];
} {
  const closeSpies: ReturnType<typeof vi.fn>[] = [];
  const factory = {
    open: vi.fn(() => {
      const request = createRequest<IDBDatabase>();
      const close = vi.fn();
      closeSpies.push(close);
      const index = {
        getAll: (gameCode: string) =>
          successfulRequest(rows.filter((row) => row.gamecode === gameCode)),
      } as unknown as IDBIndex;
      const store = {
        indexNames: { contains: (name: string) => name === "gamecode" },
        index: () => index,
        createIndex: vi.fn(),
      } as unknown as IDBObjectStore;
      const database = {
        objectStoreNames: { contains: () => false },
        createObjectStore: () => store,
        transaction: () =>
          ({
            objectStore: () => store,
            abort: vi.fn(),
          }) as unknown as IDBTransaction,
        close,
      } as unknown as IDBDatabase;
      request.result = database;
      queueMicrotask(() => {
        request.onupgradeneeded?.(new Event("upgradeneeded") as never);
        request.onsuccess?.(new Event("success") as never);
      });
      return request as unknown as IDBOpenDBRequest;
    }),
  } as unknown as IDBFactory;
  return { factory, closeSpies };
}

function successfulRequest<T>(result: T): IDBRequest<T> {
  const request = createRequest<T>();
  request.result = result;
  queueMicrotask(() => request.onsuccess?.(new Event("success") as never));
  return request as unknown as IDBRequest<T>;
}

function createRequest<T>(): {
  result: T;
  error: DOMException | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onupgradeneeded: ((event: Event) => void) | null;
} {
  return {
    result: undefined as T,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
}
