import { act } from "react";
import {
  createSlotGameFramework,
  type GameLogic,
  type SlotGameAdapter,
  type SlotGameFramework,
  type SlotGameLiveSessionLike,
  type SlotGameMountContext,
} from "@slotclientengine/gameframeworks";
import { createLeoSlotGameUiFactory } from "../src/index.js";

describe("Leo UI with the public gameframeworks contract", () => {
  it("mounts the adapter host and reflects connect, spin, present, collect, and idle", async () => {
    const root = document.createElement("div");
    const spin = deferred<unknown>();
    const play = deferred<void>();
    const collect = deferred<Readonly<Record<string, unknown>>>();
    const session = new IntegrationSession(spin.promise, collect.promise);
    const adapter = new IntegrationAdapter(play.promise);
    let framework: SlotGameFramework | undefined;
    await act(async () => {
      framework = createSlotGameFramework({
        root,
        gameAdapter: adapter,
        live: { serverUrl: "wss://gameserv.rgstest.slammerstudios.com/" },
        liveSession: session,
        betOptions: [{ bet: 5, lines: 30 }],
        currency: "USD",
        locale: "en-US",
        uiFactory: createLeoSlotGameUiFactory(),
        logicFactory: (_gmi, meta) =>
          ({ getTotalWin: () => meta.totalwin }) as GameLogic,
      });
    });
    if (!framework) throw new Error("Framework was not created.");
    const createdFramework = framework;

    expect(adapter.context?.gameLayer.dataset.integrationMounted).toBe("true");
    expect(status(root)).toBe("Disconnected");
    await act(async () => createdFramework.connect());
    expect(status(root)).toBe("Ready");
    expect(button(root, "Spin").disabled).toBe(false);

    await act(async () => {
      button(root, "Spin").click();
      button(root, "Spin").click();
      await Promise.resolve();
    });
    expect(session.spinCalls).toBe(1);
    expect(status(root)).toBe("Spinning");
    expect(button(root, "Spin").disabled).toBe(true);

    await act(async () => {
      spin.resolve({
        gmi: { replyPlay: { results: [{}] } },
        totalwin: 25,
        results: 1,
      });
      await waitUntil(() => adapter.playCalls === 1);
    });
    expect(status(root)).toBe("Presenting");

    await act(async () => {
      play.resolve();
      await waitUntil(() => session.collectCalls === 1);
    });
    expect(status(root)).toBe("Collecting");

    await act(async () => {
      collect.resolve(Object.freeze({ balance: 1075, gameid: 69002 }));
      await waitUntil(() => createdFramework.getState().spinState === "idle");
    });
    expect(status(root)).toBe("Ready");
    expect(root.querySelector(".slot-leo-ui-win")?.textContent).toContain(
      "$25.00",
    );
    expect(root.querySelector(".slot-leo-ui-balance")?.textContent).toContain(
      "$1,075.00",
    );

    await act(async () => createdFramework.destroy());
    expect(root.children).toHaveLength(0);
    expect(session.disconnectCalls).toBe(1);
    expect(adapter.destroyCalls).toBe(1);
  });
});

class IntegrationSession implements SlotGameLiveSessionLike {
  spinCalls = 0;
  collectCalls = 0;
  disconnectCalls = 0;
  #userInfo: Readonly<Record<string, unknown>> = Object.freeze({
    balance: 1000,
    gameid: 69002,
  });

  constructor(
    readonly spinPromise: Promise<unknown>,
    readonly collectPromise: Promise<Readonly<Record<string, unknown>>>,
  ) {}

  getUserInfo() {
    return this.#userInfo;
  }

  async connect() {
    return this.#userInfo;
  }

  async spin() {
    this.spinCalls += 1;
    return this.spinPromise;
  }

  async collect() {
    this.collectCalls += 1;
    this.#userInfo = await this.collectPromise;
    return this.#userInfo;
  }

  disconnect(): void {
    this.disconnectCalls += 1;
  }
}

class IntegrationAdapter implements SlotGameAdapter {
  context: SlotGameMountContext | null = null;
  playCalls = 0;
  destroyCalls = 0;

  constructor(readonly playPromise: Promise<void>) {}

  mount(context: SlotGameMountContext): void {
    this.context = context;
    context.gameLayer.dataset.integrationMounted = "true";
  }

  async playSpin(): Promise<void> {
    this.playCalls += 1;
    await this.playPromise;
  }

  destroy(): void {
    this.destroyCalls += 1;
  }
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

function status(root: HTMLElement): string | null | undefined {
  return root.querySelector(".slot-leo-ui-status")?.textContent;
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("Expected integration state was not reached.");
}
