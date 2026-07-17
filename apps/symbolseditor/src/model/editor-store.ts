import {
  cloneSymbolEditorProject,
  getProjectDiagnostics,
  type SymbolEditorProject,
} from "./editor-project.js";

export interface SymbolEditorStoreSnapshot {
  readonly project: SymbolEditorProject | null;
  readonly diagnostics: readonly string[];
  readonly revision: number;
}

export class SymbolEditorStore {
  #project: SymbolEditorProject | null = null;
  #diagnostics: readonly string[] = Object.freeze([]);
  #revision = 0;
  readonly #listeners = new Set<
    (snapshot: SymbolEditorStoreSnapshot) => void
  >();

  getSnapshot(): SymbolEditorStoreSnapshot {
    return Object.freeze({
      project: this.#project,
      diagnostics: this.#diagnostics,
      revision: this.#revision,
    });
  }

  replace(project: SymbolEditorProject): void {
    this.#project = cloneSymbolEditorProject(project);
    this.#revision += 1;
    this.validate();
    this.emit();
  }

  transact(update: (draft: SymbolEditorProject) => void): void {
    if (!this.#project)
      throw new Error("请先上传 gameconfig.json 或导入 symbols ZIP。");
    const draft = cloneSymbolEditorProject(this.#project);
    update(draft);
    this.#project = draft;
    this.#revision += 1;
    this.validate();
    this.emit();
  }

  setExternalError(error: unknown): void {
    this.#diagnostics = Object.freeze([
      error instanceof Error ? error.message : String(error),
    ]);
    this.emit();
  }

  subscribe(
    listener: (snapshot: SymbolEditorStoreSnapshot) => void,
  ): () => void {
    this.#listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.#listeners.delete(listener);
  }

  private validate(): void {
    this.#diagnostics = this.#project
      ? getProjectDiagnostics(this.#project)
      : Object.freeze([]);
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}
