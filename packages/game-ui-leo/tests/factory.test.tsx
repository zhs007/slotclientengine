import { act } from "react";
import type { SlotGameUi } from "@slotclientengine/gameframeworks";
import { createLeoSlotGameUiFactory } from "../src/index.js";
import { createCommands, createContext, createState } from "./test-helpers.js";

describe("Leo slot game UI factory", () => {
  it("synchronously returns stable hosts and renders the initial snapshot", async () => {
    const root = document.createElement("div");
    const context = createContext({
      root,
      formatMoney: (amount) => `credits:${amount}`,
    });
    let ui: SlotGameUi | undefined;
    await act(async () => {
      ui = createLeoSlotGameUiFactory().create(context);
    });
    expect(ui).toBeDefined();
    if (!ui) throw new Error("Leo UI was not created.");

    const elements = ui.elements;
    expect(root.querySelector(".slot-ui-page")).toBeTruthy();
    expect(root.querySelector(".slot-leo-ui-mount")).toBeTruthy();
    expect(elements.gameLayer.parentElement).toBe(elements.frame);
    expect(elements.overlay.parentElement).toBe(elements.frame);
    expect(ui.elements).toBe(elements);
    expect(text(root, ".slot-leo-ui-brand")).toBe("game002");
    expect(text(root, ".slot-leo-ui-balance .slot-leo-ui-money-value")).toBe(
      "credits:1000",
    );
    expect(text(root, ".slot-leo-ui-bet .slot-leo-ui-money-value")).toBe(
      "credits:200",
    );
    expect(root.querySelector("time")?.dateTime).toBeTruthy();

    await act(async () => ui?.destroy());
  });

  it("updates values, status, disabled states, and error live region", async () => {
    const root = document.createElement("div");
    const ui = await createUi(root);
    await act(async () => {
      ui.update(
        createState({
          connected: true,
          spinState: "presenting",
          balance: 2500,
          win: 750,
          betIndex: 2,
          betOption: { bet: 500, lines: 30 },
          error: "presentation failed",
        }),
      );
    });

    expect(text(root, ".slot-leo-ui-balance .slot-leo-ui-money-value")).toBe(
      "$2,500.00",
    );
    expect(text(root, ".slot-leo-ui-win .slot-leo-ui-money-value")).toBe(
      "$750.00",
    );
    expect(button(root, "Spin").disabled).toBe(true);
    expect(button(root, "Increase bet").disabled).toBe(true);
    expect(button(root, "Decrease bet").disabled).toBe(true);
    const status = root.querySelector(".slot-leo-ui-status");
    expect(status?.textContent).toBe("presentation failed");
    expect(status?.getAttribute("role")).toBe("alert");
    expect(status?.getAttribute("aria-live")).toBe("assertive");
    await act(async () => ui.destroy());
  });

  it("keeps one React tree and stable hosts across updates", async () => {
    const root = document.createElement("div");
    const ui = await createUi(root);
    const reactTree = root.querySelector(".slot-leo-ui-root");
    const elements = ui.elements;
    await act(async () => ui.update(createState({ win: 75 })));
    expect(root.querySelector(".slot-leo-ui-root")).toBe(reactTree);
    expect(ui.elements).toBe(elements);
    await act(async () => ui.destroy());
  });

  it("calls typed commands and relies on authoritative snapshots for pressed state", async () => {
    const root = document.createElement("div");
    const commands = createCommands();
    const ui = await createUi(root, commands);

    await act(async () => {
      button(root, "Increase bet").click();
      button(root, "Decrease bet").click();
      button(root, "Spin").click();
      button(root, "Spin").click();
      button(root, "Fast mode").click();
      button(root, "Sound on").click();
      button(root, "Auto mode").click();
    });
    expect(commands.increaseBet).toHaveBeenCalledTimes(1);
    expect(commands.decreaseBet).toHaveBeenCalledTimes(1);
    expect(commands.requestSpin).toHaveBeenCalledTimes(2);
    expect(commands.setFastMode).toHaveBeenCalledWith(true);
    expect(commands.setMuted).toHaveBeenCalledWith(true);
    expect(commands.setAutoMode).toHaveBeenCalledWith(true);
    expect(button(root, "Fast mode").getAttribute("aria-pressed")).toBe(
      "false",
    );

    await act(async () => {
      ui.update(createState({ muted: true, fastMode: true, autoMode: true }));
    });
    expect(button(root, "Fast mode").getAttribute("aria-pressed")).toBe("true");
    expect(button(root, "Sound off").getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(button(root, "Auto mode").getAttribute("aria-pressed")).toBe("true");
    await act(async () => ui.destroy());
  });

  it("blocks spin and bet commands from disabled native buttons", async () => {
    const root = document.createElement("div");
    const commands = createCommands();
    const ui = await createUi(
      root,
      commands,
      createState({
        connected: false,
        spinState: "connecting",
        betIndex: 0,
        betOption: { bet: 100, lines: 30 },
      }),
    );
    await act(async () => {
      button(root, "Spin").click();
      button(root, "Increase bet").click();
      button(root, "Decrease bet").click();
    });
    expect(commands.requestSpin).not.toHaveBeenCalled();
    expect(commands.increaseBet).not.toHaveBeenCalled();
    expect(commands.decreaseBet).not.toHaveBeenCalled();
    await act(async () => ui.destroy());
  });

  it("forwards viewport changes and stops after idempotent unsubscribe/destroy", async () => {
    const root = sizedRoot(1000, 500);
    const ui = await createUi(root);
    const initial = ui.getViewport();
    const listener = vi.fn();
    const unsubscribe = ui.onViewportChange(listener);
    resizeRoot(root, 500, 1000);
    window.dispatchEvent(new Event("resize"));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(ui.getViewport()).not.toEqual(initial);
    unsubscribe();
    unsubscribe();
    window.dispatchEvent(new Event("resize"));
    expect(listener).toHaveBeenCalledTimes(1);

    await act(async () => {
      ui.destroy();
      ui.destroy();
    });
    expect(root.children).toHaveLength(0);
    window.dispatchEvent(new Event("resize"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("isolates multiple roots, snapshots, commands, and lifecycle", async () => {
    const firstRoot = document.createElement("div");
    const secondRoot = document.createElement("div");
    const firstCommands = createCommands();
    const secondCommands = createCommands();
    const first = await createUi(firstRoot, firstCommands);
    const second = await createUi(secondRoot, secondCommands);

    await act(async () => {
      first.update(createState({ balance: 111 }));
      button(firstRoot, "Spin").click();
    });
    expect(
      text(firstRoot, ".slot-leo-ui-balance .slot-leo-ui-money-value"),
    ).toBe("$111.00");
    expect(
      text(secondRoot, ".slot-leo-ui-balance .slot-leo-ui-money-value"),
    ).toBe("$1,000.00");
    expect(firstCommands.requestSpin).toHaveBeenCalledTimes(1);
    expect(secondCommands.requestSpin).not.toHaveBeenCalled();

    await act(async () => first.destroy());
    expect(firstRoot.children).toHaveLength(0);
    expect(secondRoot.querySelector(".slot-leo-ui-root")).toBeTruthy();
    await act(async () => second.destroy());
  });

  it("cleans React clock and ignores updates after destroy", async () => {
    const root = document.createElement("div");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const ui = await createUi(root);
    await act(async () => ui.destroy());
    expect(clearInterval).toHaveBeenCalled();
    await act(async () => ui.update(createState({ balance: 999 })));
    expect(root.children).toHaveLength(0);
  });
});

async function createUi(
  root: HTMLElement,
  commands = createCommands(),
  state = createState(),
): Promise<SlotGameUi> {
  let ui: SlotGameUi | undefined;
  await act(async () => {
    ui = createLeoSlotGameUiFactory().create(
      createContext({ root, commands, state }),
    );
  });
  if (!ui) throw new Error("Leo UI was not created.");
  return ui;
}

function text(root: HTMLElement, selector: string): string | null | undefined {
  return root.querySelector(selector)?.textContent;
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const result = [...root.querySelectorAll("button")].find(
    (item) => item.getAttribute("aria-label") === label,
  );
  if (!(result instanceof HTMLButtonElement)) {
    throw new Error(`Missing button ${label}.`);
  }
  return result;
}

function sizedRoot(width: number, height: number): HTMLElement {
  const root = document.createElement("div");
  resizeRoot(root, width, height);
  return root;
}

function resizeRoot(root: HTMLElement, width: number, height: number): void {
  Object.defineProperty(root, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(root, "clientHeight", {
    configurable: true,
    value: height,
  });
}
