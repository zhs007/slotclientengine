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
}

export class EditorStore {
  #project: EditorProject;
  #errors: readonly string[] = [];
  #externalError: string | null = null;
  #revision = 0;
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
    });
  }

  transact(update: (draft: EditorProject) => void): void {
    const draft = cloneEditorProject(this.#project);
    update(draft);
    synchronizeGameModeNodeStates(draft);
    normalizeGameModeNodeOrders(draft);
    this.#project = draft;
    this.#externalError = null;
    this.#revision += 1;
    this.validate();
    this.emit();
  }

  replace(project: EditorProject): void {
    this.#project = cloneEditorProject(project);
    normalizeGameModeNodeOrders(this.#project);
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

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "adaptation.artSize.width must be positive.")
    return "背景 art size 尚未完成：width 必须是有限正数；选择 Spine 背景时可在 Resource Picker 填写。";
  if (message === "adaptation.artSize.height must be positive.")
    return "背景 art size 尚未完成：height 必须是有限正数；选择 Spine 背景时可在 Resource Picker 填写。";
  return message;
}
