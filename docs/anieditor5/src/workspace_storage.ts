import type {
  V5GProjectConfig,
  V5GRuntimeAsset,
  V5GViewportState,
} from "./types";

const DB_NAME = "victory_editor_v5_g_workspace";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const ASSET_STORE = "assets";
const INDEX_KEY = "victory_editor_v5_g_workspace_index";
const IDB_TIMEOUT_MS = 12000;

export interface V5GProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  viewport?: V5GViewportState;
}

export interface V5GWorkspaceIndex {
  currentProjectId: string;
  projects: V5GProjectSummary[];
}

interface StoredProjectRecord {
  id: string;
  project: V5GProjectConfig;
  createdAt: number;
  updatedAt: number;
}

interface StoredAssetRecord {
  key: string;
  projectId: string;
  assetId: string;
  file: File;
  updatedAt: number;
}

export interface LoadedWorkspaceProject {
  index: V5GWorkspaceIndex;
  project: V5GProjectConfig;
  runtimeAssets: V5GRuntimeAsset[];
}

export function createWorkspaceProjectId(): string {
  return `project_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function cloneProjectConfig(
  project: V5GProjectConfig,
): V5GProjectConfig {
  return JSON.parse(JSON.stringify(project)) as V5GProjectConfig;
}

export async function loadOrCreateWorkspace(
  defaultProject: V5GProjectConfig,
): Promise<LoadedWorkspaceProject> {
  const savedIndex = readWorkspaceIndex();
  if (!savedIndex || savedIndex.projects.length === 0) {
    const projectId = createWorkspaceProjectId();
    const now = Date.now();
    const index: V5GWorkspaceIndex = {
      currentProjectId: projectId,
      projects: [
        {
          id: projectId,
          name: defaultProject.name,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    await saveProjectRecord(projectId, defaultProject, now, now);
    saveWorkspaceIndex(index);
    return { index, project: defaultProject, runtimeAssets: [] };
  }

  const currentProjectId = savedIndex.projects.some(
    (project) => project.id === savedIndex.currentProjectId,
  )
    ? savedIndex.currentProjectId
    : savedIndex.projects[0].id;
  const project = await loadProjectConfig(currentProjectId);
  if (!project) {
    const repairedIndex: V5GWorkspaceIndex = {
      currentProjectId,
      projects: savedIndex.projects,
    };
    await saveProjectRecord(currentProjectId, defaultProject);
    saveWorkspaceIndex(repairedIndex);
    return { index: repairedIndex, project: defaultProject, runtimeAssets: [] };
  }

  const runtimeAssets = await loadRuntimeAssets(currentProjectId, project);
  const normalizedIndex = {
    ...savedIndex,
    currentProjectId,
  };
  saveWorkspaceIndex(normalizedIndex);
  return { index: normalizedIndex, project, runtimeAssets };
}

export function readWorkspaceIndex(): V5GWorkspaceIndex | null {
  const raw = localStorage.getItem(INDEX_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as V5GWorkspaceIndex;
    if (!parsed.currentProjectId || !Array.isArray(parsed.projects)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveWorkspaceIndex(index: V5GWorkspaceIndex): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export async function saveProjectRecord(
  projectId: string,
  project: V5GProjectConfig,
  createdAt = Date.now(),
  updatedAt = Date.now(),
): Promise<void> {
  const existing = await loadProjectRecord(projectId);
  const record: StoredProjectRecord = {
    id: projectId,
    project: cloneProjectConfig(project),
    createdAt: existing?.createdAt ?? createdAt,
    updatedAt,
  };
  const db = await openDB();
  await runTransaction(db, PROJECT_STORE, "readwrite", (store) => {
    store.put(record);
  });
}

export async function loadProjectConfig(
  projectId: string,
): Promise<V5GProjectConfig | null> {
  const record = await loadProjectRecord(projectId);
  return record ? cloneProjectConfig(record.project) : null;
}

export async function saveRuntimeAssets(
  projectId: string,
  runtimeAssets: V5GRuntimeAsset[],
  options: { skipExisting?: boolean } = {},
): Promise<void> {
  if (runtimeAssets.length === 0) return;
  const db = await openDB();
  let assetsToSave = runtimeAssets;
  if (options.skipExisting) {
    const existingFlags = await Promise.all(
      runtimeAssets.map((asset) => getAssetRecord(db, projectId, asset.id)),
    );
    assetsToSave = runtimeAssets.filter((_, index) => !existingFlags[index]);
    if (assetsToSave.length === 0) return;
  }
  await runTransaction(db, ASSET_STORE, "readwrite", (store) => {
    const now = Date.now();
    for (const runtimeAsset of assetsToSave) {
      const record: StoredAssetRecord = {
        key: buildAssetKey(projectId, runtimeAsset.id),
        projectId,
        assetId: runtimeAsset.id,
        file: runtimeAsset.file,
        updatedAt: now,
      };
      store.put(record);
    }
  });
}

export async function loadRuntimeAssets(
  projectId: string,
  project: V5GProjectConfig,
): Promise<V5GRuntimeAsset[]> {
  const db = await openDB();
  const results = await Promise.all(
    project.assets.map(async (asset) => {
      const record = await getAssetRecord(db, projectId, asset.id);
      if (!record) return null;
      return {
        id: asset.id,
        file: record.file,
        objectUrl: URL.createObjectURL(record.file),
      } satisfies V5GRuntimeAsset;
    }),
  );
  return results.filter((item): item is V5GRuntimeAsset => item !== null);
}

export async function deleteProjectFromWorkspace(
  projectId: string,
): Promise<void> {
  const db = await openDB();
  await runTransaction(db, PROJECT_STORE, "readwrite", (store) => {
    store.delete(projectId);
  });
  await deleteAssetsForProject(db, projectId);
}

export async function clearRuntimeAssetsForProject(
  projectId: string,
): Promise<void> {
  const db = await openDB();
  await deleteAssetsForProject(db, projectId);
}

async function loadProjectRecord(
  projectId: string,
): Promise<StoredProjectRecord | null> {
  const db = await openDB();
  return withTimeout(
    new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECT_STORE, "readonly");
      const request = tx.objectStore(PROJECT_STORE).get(projectId);
      request.onsuccess = () =>
        resolve((request.result as StoredProjectRecord | undefined) ?? null);
      request.onerror = () => reject(request.error);
      tx.onabort = () =>
        reject(tx.error ?? new Error("读取本地项目记录已中止"));
    }),
    "读取本地项目记录",
  );
}

function getAssetRecord(
  db: IDBDatabase,
  projectId: string,
  assetId: string,
): Promise<StoredAssetRecord | null> {
  return withTimeout(
    new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, "readonly");
      const request = tx
        .objectStore(ASSET_STORE)
        .get(buildAssetKey(projectId, assetId));
      request.onsuccess = () =>
        resolve((request.result as StoredAssetRecord | undefined) ?? null);
      request.onerror = () => reject(request.error);
      tx.onabort = () =>
        reject(tx.error ?? new Error("读取本地资源记录已中止"));
    }),
    "读取本地资源记录",
  );
}

function deleteAssetsForProject(
  db: IDBDatabase,
  projectId: string,
): Promise<void> {
  return withTimeout(
    new Promise((resolve, reject) => {
      const tx = db.transaction(ASSET_STORE, "readwrite");
      const store = tx.objectStore(ASSET_STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value as StoredAssetRecord;
        if (record.projectId === projectId) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("删除本地资源失败"));
      tx.onabort = () => reject(tx.error ?? new Error("删除本地资源已中止"));
    }),
    "删除本地资源",
  );
}

function buildAssetKey(projectId: string, assetId: string): string {
  return `${projectId}:${assetId}`;
}

function openDB(): Promise<IDBDatabase> {
  return withTimeout(
    new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT_STORE)) {
          db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(ASSET_STORE)) {
          db.createObjectStore(ASSET_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(
          new Error(
            "本地工作区数据库被其他页面占用，请关闭重复打开的 VNI 页面后重试",
          ),
        );
    }),
    "打开本地工作区数据库",
  );
}

function runTransaction(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => void,
): Promise<void> {
  return withTimeout(
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      callback(tx.objectStore(storeName));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("本地工作区写入失败"));
      tx.onabort = () => reject(tx.error ?? new Error("本地工作区写入已中止"));
    }),
    "写入本地工作区",
  );
}

function withTimeout<T>(promise: Promise<T>, action: string): Promise<T> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(
        new Error(
          `${action}超时。可能是浏览器本地存储繁忙、空间不足，或同时打开了多个编辑器页面；请稍后重试，必要时刷新页面或清理旧项目。`,
        ),
      );
    }, IDB_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}
