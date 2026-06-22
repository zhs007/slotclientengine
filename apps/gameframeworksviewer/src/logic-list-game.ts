import type {
  GameLogic,
  SlotGameAdapter,
  SlotGameInitialState,
  SlotGameMountContext,
  SlotGameStateSnapshot,
} from "@slotclientengine/gameframeworks";
import { formatLogicMessage } from "./message-format.js";

export interface LogicListGameOptions {
  readonly componentNames: readonly string[];
}

export class LogicListGameAdapter implements SlotGameAdapter {
  readonly #componentNames: readonly string[];
  #root: HTMLElement | null = null;
  #state: HTMLElement | null = null;
  #list: HTMLOListElement | null = null;
  #context: SlotGameMountContext | null = null;
  #spinId = 0;

  constructor(options: LogicListGameOptions) {
    this.#componentNames = options.componentNames;
  }

  mount(context: SlotGameMountContext): void {
    this.#context = context;
    this.#root = context.gameLayer;
    context.gameLayer.replaceChildren();
    context.gameLayer.dataset.gameframeworksViewer = "logic-list";

    const panel = element("section", "gfv-logic-panel");
    const header = element("div", "gfv-logic-header");
    const title = textElement("h2", "gfv-logic-title", "Logic list");
    this.#state = textElement("span", "gfv-logic-state", "idle");
    header.append(title, this.#state);
    this.#list = document.createElement("ol");
    this.#list.className = "gfv-logic-list slot-gameframeworks-logic-list";
    panel.append(header, this.#list);
    context.gameLayer.append(panel);
  }

  applyInitialState(state: SlotGameInitialState): void {
    if (this.#state) {
      this.#state.textContent = `balance ${state.balance}`;
    }
  }

  playSpin(logic: GameLogic): void {
    if (!this.#list || !this.#context) {
      throw new Error("logic list game is not mounted.");
    }
    const spinId = ++this.#spinId;
    const message = formatLogicMessage({
      spinId,
      logic,
      betOption: this.#context.getState().betOption,
      componentNames: this.#componentNames,
    });
    const item = document.createElement("li");
    item.className = "gfv-logic-item";
    item.dataset.spinId = String(spinId);
    item.append(
      ...message.map((line) => textElement("div", "gfv-logic-line", line)),
    );
    this.#list.append(item);
  }

  setFrameworkState(state: SlotGameStateSnapshot): void {
    if (this.#root) {
      this.#root.dataset.spinState = state.spinState;
    }
    if (this.#state) {
      this.#state.textContent = state.error ?? state.spinState;
    }
  }

  destroy(): void {
    this.#root?.replaceChildren();
    this.#root = null;
    this.#state = null;
    this.#list = null;
    this.#context = null;
  }
}

export function createLogicListGameAdapter(
  options: LogicListGameOptions,
): LogicListGameAdapter {
  return new LogicListGameAdapter(options);
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
