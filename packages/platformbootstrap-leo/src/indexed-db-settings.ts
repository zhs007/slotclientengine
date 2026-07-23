import type { LeoSettingsStore } from "./settings.js";

const DATABASE_NAME = "GameDB";
const STORE_NAME = "userSettings";

export function createIndexedDbLeoSettingsStore(
  factory: IDBFactory = globalThis.indexedDB,
): LeoSettingsStore {
  let database: IDBDatabase | null = null;
  let destroyed = false;

  const open = async (signal: AbortSignal): Promise<IDBDatabase> => {
    throwIfUnavailable(signal, destroyed);
    if (database) return database;
    const request = factory.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("gamecode", "gamecode", { unique: false });
      }
    };
    const db = await requestResult(request, signal);
    throwIfUnavailable(signal, destroyed);
    database = db;
    return db;
  };

  return Object.freeze({
    async load(gameCode: string, signal: AbortSignal): Promise<unknown> {
      const db = await open(signal);
      throwIfUnavailable(signal, destroyed);
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      if (!store.indexNames.contains("gamecode")) {
        throw new Error("Leo settings store is missing the gamecode index.");
      }
      const rows = await requestResult(
        store.index("gamecode").getAll(gameCode),
        signal,
        transaction,
      );
      const result = Object.create(null) as Record<string, unknown>;
      for (const value of rows as unknown[]) {
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          throw new Error("Leo IndexedDB setting row is invalid.");
        }
        const row = value as Record<string, unknown>;
        const prefix = `${gameCode}:`;
        if (
          row.gamecode !== gameCode ||
          typeof row.key !== "string" ||
          !row.key.startsWith(prefix) ||
          row.key.length === prefix.length
        ) {
          throw new Error("Leo IndexedDB setting row identity is invalid.");
        }
        result[row.key.slice(prefix.length)] = row.value;
      }
      return result;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      database?.close();
      database = null;
    },
  });
}

function requestResult<T>(
  request: IDBRequest<T>,
  signal: AbortSignal,
  transaction?: IDBTransaction,
): Promise<T> {
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", handleAbort);
      callback();
    };
    const handleAbort = () => {
      try {
        transaction?.abort();
      } catch {
        // A completed transaction no longer needs cancellation.
      }
      settle(() => reject(createAbortError()));
    };
    request.onsuccess = () => settle(() => resolve(request.result));
    request.onerror = () =>
      settle(() => reject(new Error("Leo IndexedDB request failed.")));
    if (transaction) {
      transaction.onabort = () =>
        settle(() =>
          reject(new Error("Leo IndexedDB transaction was aborted.")),
        );
      transaction.onerror = () =>
        settle(() => reject(new Error("Leo IndexedDB transaction failed.")));
    }
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function throwIfUnavailable(signal: AbortSignal, destroyed: boolean): void {
  if (signal.aborted) throw createAbortError();
  if (destroyed) throw new Error("Leo settings store has been destroyed.");
}

function createAbortError(): DOMException {
  return new DOMException("Leo settings request was aborted.", "AbortError");
}
