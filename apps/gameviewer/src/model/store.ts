import type {
  SceneLayoutTemplateReadinessSnapshot,
  ServerGameAuthoringSummary,
} from "@slotclientengine/gameframeworks/scene-layout-template";

export interface ImportedLayoutState {
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly summary: SceneLayoutTemplateReadinessSnapshot["layout"];
}

export interface ImportedServerState {
  readonly fileName: string;
  readonly sha256: string;
  readonly summary: ServerGameAuthoringSummary;
}

export interface GameViewerStoreSnapshot {
  readonly revision: number;
  readonly layout: ImportedLayoutState | null;
  readonly server: ImportedServerState | null;
  readonly selectedBetMethodId: string | null;
  readonly suggestionsConfirmed: boolean;
  readonly readiness: SceneLayoutTemplateReadinessSnapshot | null;
}

export class GameViewerStore {
  #revision = 0;
  #layout: ImportedLayoutState | null = null;
  #server: ImportedServerState | null = null;
  #selectedBetMethodId: string | null = null;
  #suggestionsConfirmed = false;
  #readiness: SceneLayoutTemplateReadinessSnapshot | null = null;

  getSnapshot(): GameViewerStoreSnapshot {
    return Object.freeze({
      revision: this.#revision,
      layout: this.#layout,
      server: this.#server,
      selectedBetMethodId: this.#selectedBetMethodId,
      suggestionsConfirmed: this.#suggestionsConfirmed,
      readiness: this.#readiness,
    });
  }

  replaceLayout(layout: ImportedLayoutState): void {
    this.#layout = Object.freeze({
      ...layout,
      bytes: layout.bytes.slice(),
    });
    this.invalidate();
  }

  replaceServer(server: ImportedServerState): void {
    this.#server = server;
    this.#selectedBetMethodId = server.summary.betMethods[0]?.id ?? null;
    this.#suggestionsConfirmed = false;
    this.invalidate();
  }

  selectBetMethod(id: string): void {
    if (!this.#server?.summary.betMethods.some((method) => method.id === id))
      throw new Error(`未知下注方式 "${id}"。`);
    this.#selectedBetMethodId = id;
    this.#suggestionsConfirmed = false;
    this.invalidate();
  }

  confirmSuggestions(): void {
    if (!this.#selectedBetMethodId)
      throw new Error("确认职责建议前必须先选择下注方式。");
    this.#suggestionsConfirmed = true;
    this.invalidate();
  }

  markEdited(): void {
    this.invalidate();
  }

  commitReadiness(
    readiness: SceneLayoutTemplateReadinessSnapshot,
    revision: number,
  ): boolean {
    if (revision !== this.#revision) return false;
    this.#readiness = readiness;
    return true;
  }

  private invalidate(): void {
    this.#revision += 1;
    this.#readiness = null;
  }
}
