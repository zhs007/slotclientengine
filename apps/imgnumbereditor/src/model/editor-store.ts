import {
  cloneEditorProject,
  createDefaultEditorProject,
  freezeEditorProject,
  type ImageStringEditorProject,
} from "./editor-project.js";

export type EditorProjectMutation = (draft: ImageStringEditorProject) => void;

export class ImageStringEditorStore {
  #project: ImageStringEditorProject;
  readonly #listeners = new Set<(project: ImageStringEditorProject) => void>();

  constructor(
    project: ImageStringEditorProject = createDefaultEditorProject(),
  ) {
    this.#project = freezeEditorProject(project);
  }
  get project(): ImageStringEditorProject {
    return this.#project;
  }
  subscribe(listener: (project: ImageStringEditorProject) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  transact(
    mutate: EditorProjectMutation,
    validate?: (draft: ImageStringEditorProject) => void,
  ): void {
    const draft = cloneEditorProject(this.#project);
    mutate(draft);
    validate?.(draft);
    this.replace(draft);
  }
  replace(project: ImageStringEditorProject): void {
    const next = freezeEditorProject(project);
    this.#project = next;
    for (const listener of this.#listeners) listener(next);
  }
}
