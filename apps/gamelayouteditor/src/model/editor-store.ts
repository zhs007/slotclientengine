import { assertSceneLayoutGeometryCompatible } from "@slotclientengine/rendercore/scene-layout/data";
import {
  cloneEditorProject,
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
}

export class EditorStore {
  #project: EditorProject;
  #errors: readonly string[] = [];
  #externalError: string | null = null;
  #revision = 0;
  #changeKind: EditorStoreSnapshot["changeKind"] = "initial";
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
    });
  }

  transact(update: (draft: EditorProject) => void): void {
    const previous = this.#project;
    const draft = cloneEditorProject(this.#project);
    update(draft);
    synchronizeGameModeNodeStates(draft);
    normalizeGameModeNodeOrders(draft);
    this.#changeKind = classifyProjectChange(previous, draft);
    this.#project = draft;
    this.#externalError = null;
    this.#revision += 1;
    this.validate();
    this.emit();
  }

  replace(project: EditorProject): void {
    this.#project = cloneEditorProject(project);
    normalizeGameModeNodeOrders(this.#project);
    this.#changeKind = "structural";
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
  if (left.size !== right.size) return false;
  for (const [path, bytes] of left) {
    const candidate = right.get(path);
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
  const message = error instanceof Error ? error.message : String(error);
  if (message === "adaptation.artSize.width must be positive.")
    return "背景 art size 尚未完成：width 必须是有限正数；选择 Spine 背景时可在 Resource Picker 填写。";
  if (message === "adaptation.artSize.height must be positive.")
    return "背景 art size 尚未完成：height 必须是有限正数；选择 Spine 背景时可在 Resource Picker 填写。";
  if (
    /^scene layout (default|landscape|portrait) has no valid background node\.$/u.test(
      message,
    )
  )
    return "背景 art size 尚未完成：width 必须是有限正数；选择 Spine 背景时可在 Resource Picker 填写。";
  return message;
}
