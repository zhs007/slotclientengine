import { assertSceneLayoutGeometryCompatible } from "@slotclientengine/rendercore/scene-layout/data";
import {
  cloneEditorProject,
  activateEditorGameMode,
  editorProjectToManifest,
  type EditorProject,
} from "./editor-project.js";
import {
  normalizeGameModeNodeOrders,
  synchronizeGameModeNodeStates,
} from "./game-mode-commands.js";

export interface EditorStoreSnapshot {
  readonly project: EditorProject;
  readonly errors: readonly string[];
  readonly externalError: string | null;
  readonly revision: number;
  readonly changeKind: "initial" | "geometry" | "structural";
  readonly changeSource: "initial" | "transaction" | "replace";
}

export class EditorStore {
  #project: EditorProject;
  #errors: readonly string[] = [];
  #externalError: string | null = null;
  #revision = 0;
  #changeKind: EditorStoreSnapshot["changeKind"] = "initial";
  #changeSource: EditorStoreSnapshot["changeSource"] = "initial";
  readonly #listeners = new Set<(snapshot: EditorStoreSnapshot) => void>();

  constructor(project: EditorProject) {
    this.#project = project;
    normalizeGameModeNodeOrders(this.#project);
    this.validate();
  }

  getSnapshot(): EditorStoreSnapshot {
    return Object.freeze({
      project: this.#project,
      errors: this.#errors,
      externalError: this.#externalError,
      revision: this.#revision,
      changeKind: this.#changeKind,
      changeSource: this.#changeSource,
    });
  }

  transact(update: (draft: EditorProject) => void): void {
    const draft = cloneEditorProject(this.#project);
    update(draft);
    this.commitTransaction(draft);
  }

  /** Configuration commands cannot access payloads; resource edits use transact/replace. */
  transactConfiguration(update: (draft: EditorProject) => void): void {
    const draft = cloneEditorProject({ ...this.#project, assets: new Map() });
    Object.defineProperty(draft, "assets", {
      configurable: true,
      get() {
        throw new Error("配置事务不能访问资源 bytes；请使用资源事务。");
      },
      set() {
        throw new Error("配置事务不能修改资源 bytes；请使用资源事务。");
      },
    });
    update(draft);
    Object.defineProperty(draft, "assets", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: this.#project.assets,
    });
    this.commitTransaction(draft);
  }

  private commitTransaction(draft: EditorProject): void {
    const previous = this.#project;
    synchronizeGameModeNodeStates(draft);
    normalizeGameModeNodeOrders(draft);
    this.#changeKind = classifyProjectChange(previous, draft);
    this.#changeSource = "transaction";
    this.#project = draft;
    this.#externalError = null;
    this.#revision += 1;
    this.validate();
    this.emit();
  }

  selectGameMode(modeId: string): void {
    if (this.#project.gameModes.activeModeId === modeId) return;
    // Selection is editor state, not a resource or geometry transaction.
    const project = {
      ...this.#project,
      gameModes: { ...this.#project.gameModes },
    };
    activateEditorGameMode(project, modeId);
    this.#project = project;
    this.emit();
  }

  replace(project: EditorProject): void {
    this.#project = cloneEditorProject(project);
    normalizeGameModeNodeOrders(this.#project);
    this.#changeKind = "structural";
    this.#changeSource = "replace";
    this.#externalError = null;
    this.#revision += 1;
    this.validate();
    this.emit();
  }

  setExternalError(error: unknown): void {
    const message = formatError(error);
    if (this.#externalError === message) return;
    this.#externalError = message;
    this.emit();
  }

  clearExternalError(): void {
    if (this.#externalError === null) return;
    this.#externalError = null;
    this.emit();
  }

  subscribe(listener: (snapshot: EditorStoreSnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.#listeners.delete(listener);
  }

  private validate(): void {
    try {
      editorProjectToManifest(this.#project);
      this.#errors = Object.freeze([]);
    } catch (error) {
      this.#errors = Object.freeze([formatError(error)]);
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}

function classifyProjectChange(
  previous: EditorProject,
  next: EditorProject,
): "geometry" | "structural" {
  if (!sameAssetBytes(previous.assets, next.assets)) return "structural";
  try {
    assertSceneLayoutGeometryCompatible(
      editorProjectToManifest(previous),
      editorProjectToManifest(next),
    );
    return "geometry";
  } catch {
    return "structural";
  }
}

function sameAssetBytes(
  left: ReadonlyMap<string, Uint8Array>,
  right: ReadonlyMap<string, Uint8Array>,
): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const [path, bytes] of left) {
    const candidate = right.get(path);
    if (candidate === bytes) continue;
    if (
      !candidate ||
      candidate.byteLength !== bytes.byteLength ||
      !bytes.every((byte, index) => candidate[index] === byte)
    )
      return false;
  }
  return true;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
