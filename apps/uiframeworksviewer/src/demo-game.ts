import type {
  SlotGameAdapter,
  SlotGameMountContext,
  SlotInitialState,
  SlotUiSpinResult,
  SlotUiStateSnapshot
} from "@slotclientengine/uiframeworks";

export class DemoSlotGameAdapter implements SlotGameAdapter {
  #root: HTMLElement | null = null;
  #reels: HTMLElement | null = null;
  #summary: HTMLElement | null = null;
  #state: HTMLElement | null = null;

  mount(root: HTMLElement, context: SlotGameMountContext): void {
    this.#root = root;
    root.replaceChildren();
    root.dataset.viewerGame = "demo";

    const game = element("div", "ui-viewer-game");
    const header = element("div", "ui-viewer-game-header");
    const title = textElement("div", "ui-viewer-game-title", "DOM SLOT");
    this.#state = textElement("div", "ui-viewer-game-state", "Waiting");
    header.append(title, this.#state);

    this.#reels = element("div", "ui-viewer-reels");
    renderScene(this.#reels, [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9]
    ]);

    this.#summary = textElement(
      "div",
      "ui-viewer-game-summary",
      `${context.designSize.width} x ${context.designSize.height}`,
    );

    game.append(header, this.#reels, this.#summary);
    root.append(game);
  }

  applyInitialState(state: SlotInitialState): void {
    if (this.#summary) {
      this.#summary.textContent = `Balance ${state.balance.toFixed(2)}`;
    }
    if (state.defaultScene && this.#reels) {
      renderScene(this.#reels, state.defaultScene);
    }
  }

  applySpinResult(result: SlotUiSpinResult): void {
    if (this.#summary) {
      this.#summary.textContent = `Win ${result.totalwin.toFixed(2)} / steps ${result.results}`;
    }
    if (this.#reels) {
      renderScene(this.#reels, result.logic.getDefaultScene());
    }
  }

  setUiState(state: SlotUiStateSnapshot): void {
    if (this.#root) {
      this.#root.dataset.viewerSpinState = state.spinState;
    }
    if (this.#state) {
      this.#state.textContent = state.error ?? state.spinState;
    }
  }

  destroy(): void {
    this.#root?.replaceChildren();
    this.#root = null;
    this.#reels = null;
    this.#summary = null;
    this.#state = null;
  }
}

export function createDemoSlotGameAdapter(): DemoSlotGameAdapter {
  return new DemoSlotGameAdapter();
}

function renderScene(
  root: HTMLElement,
  scene: readonly (readonly number[])[],
): void {
  root.replaceChildren();
  for (const column of scene) {
    const columnElement = element("div", "ui-viewer-reel-column");
    for (const symbol of column) {
      columnElement.append(textElement("span", "ui-viewer-symbol", String(symbol)));
    }
    root.append(columnElement);
  }
}

function textElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const item = element(tag, className);
  item.textContent = text;
  return item;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag);
  item.className = className;
  return item;
}
