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
  readonly revision: number;
}

export class EditorStore {
  #project: EditorProject;
  #errors: readonly string[] = [];
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
      revision: this.#revision,
    });
  }

  transact(update: (draft: EditorProject) => void): void {
    const draft = cloneEditorProject(this.#project);
    update(draft);
    synchronizeGameModeNodeStates(draft);
    normalizeGameModeNodeOrders(draft);
    this.#project = draft;
    this.#revision += 1;
    this.validate();
    this.emit();
  }

  replace(project: EditorProject): void {
    this.#project = cloneEditorProject(project);
    normalizeGameModeNodeOrders(this.#project);
    this.#revision += 1;
    this.validate();
    this.emit();
  }

  setExternalError(error: unknown): void {
    const message = formatError(error);
    if (this.#errors.length === 1 && this.#errors[0] === message) return;
    this.#errors = Object.freeze([message]);
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
  return error instanceof Error ? error.message : String(error);
}
