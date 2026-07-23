import { describe, expect, it, vi } from "vitest";

const facade = vi.hoisted(() => ({
  inspectSceneLayoutPackageInput: vi.fn(),
  inspectSceneLayoutTemplateInputs: vi.fn(),
  parseServerGameAuthoringSummary: vi.fn(),
  getServerBetMethodComponentCatalog: vi.fn(),
  suggestSlotRoundFlow: vi.fn(),
  launchRuntimeWindow: vi.fn(),
}));

vi.mock(
  "@slotclientengine/gameframeworks/scene-layout-template",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@slotclientengine/gameframeworks/scene-layout-template")
    >()),
    inspectSceneLayoutPackageInput: facade.inspectSceneLayoutPackageInput,
    inspectSceneLayoutTemplateInputs: facade.inspectSceneLayoutTemplateInputs,
    parseServerGameAuthoringSummary: facade.parseServerGameAuthoringSummary,
    getServerBetMethodComponentCatalog:
      facade.getServerBetMethodComponentCatalog,
    suggestSlotRoundFlow: facade.suggestSlotRoundFlow,
  }),
);
vi.mock("../src/runtime/launch-channel.js", () => ({
  launchRuntimeWindow: facade.launchRuntimeWindow,
}));

import { createGameViewerAppShell } from "../src/ui/app-shell.js";

const serverSummary = {
  gameName: "sample",
  gamecode: "code",
  parameters: [],
  betMethods: [
    {
      id: "normal",
      label: "Normal",
      bet: 1,
      totalBetInWins: 1,
      components: [
        {
          nodeId: "node-spin",
          nodeType: "BasicReels2",
          componentName: "spin",
          role: "spin",
          configuration: {},
        },
      ],
    },
  ],
} as const;

function setFiles(input: HTMLInputElement, files: readonly File[]): void {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: files,
  });
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index += 1)
    await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("gameviewer configurator shell", () => {
  it("renders all stages and invalidates conditional/readiness UI safely", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    createGameViewerAppShell(root);

    expect(root.querySelectorAll("section.panel")).toHaveLength(6);
    expect(root.textContent).toContain("Game Viewer");
    const reelKind = root.querySelector<HTMLSelectElement>("[name=reelKind]")!;
    const cascade = root.querySelector<HTMLInputElement>(
      "[name=cascadeEnabled]",
    )!;
    const standardFields = root.querySelector<HTMLElement>(
      "[data-standard-fields]",
    )!;
    const gridFields = root.querySelector<HTMLElement>("[data-grid-fields]")!;
    const cascadeFields = root.querySelector<HTMLElement>(
      "[data-cascade-fields]",
    )!;

    expect(gridFields.hasAttribute("data-visible")).toBe(true);
    reelKind.value = "standard";
    reelKind.dispatchEvent(new Event("change"));
    expect(standardFields.hasAttribute("data-visible")).toBe(true);
    expect(gridFields.hasAttribute("data-visible")).toBe(false);
    cascade.checked = false;
    cascade.dispatchEvent(new Event("change"));
    expect(cascadeFields.hasAttribute("data-visible")).toBe(false);

    root.querySelector<HTMLButtonElement>("[data-readiness]")!.click();
    root
      .querySelector<HTMLButtonElement>("[data-confirm-suggestions]")!
      .click();
    root.querySelector<HTMLButtonElement>("[data-launch]")!.disabled = false;
    root.querySelector<HTMLButtonElement>("[data-launch]")!.click();
    expect(root.querySelector("[data-toast-stack]")!.textContent).toContain(
      "当前配置没有有效 readiness snapshot",
    );

    const title = root.querySelector<HTMLInputElement>("[name=title]")!;
    title.value = "edited";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    expect(
      root.querySelector<HTMLButtonElement>("[data-launch]")!.disabled,
    ).toBe(true);
    expect(
      root.querySelector("[data-readiness-output]")!.textContent,
    ).toContain("snapshot 失效");
    root.remove();
  });

  it("imports inputs, reviews suggestions, compiles readiness, and launches", async () => {
    facade.inspectSceneLayoutPackageInput.mockResolvedValue({
      sha256: "a".repeat(64),
      id: "layout",
      entryCount: 2,
      totalBytes: 2048,
      modes: ["Base"],
      symbolPackages: ["symbols"],
      popups: ["popup"],
    });
    facade.parseServerGameAuthoringSummary.mockReturnValue(serverSummary);
    facade.getServerBetMethodComponentCatalog.mockReturnValue(
      serverSummary.betMethods[0],
    );
    facade.suggestSlotRoundFlow.mockReturnValue({
      betMethodId: "normal",
      requiresReview: true,
      components: {
        spin: "spin",
        wins: ["wins"],
        valueUpdates: ["values"],
      },
      cascade: {
        remove: "remove",
        dropdown: "dropdown",
        refill: "refill",
        stepMarker: null,
        emptyCode: -1,
        removeExcludedSymbols: ["A"],
        dropHeldSymbols: ["A"],
        valueSymbols: ["V"],
      },
      unsupported: [],
    });
    facade.inspectSceneLayoutTemplateInputs.mockImplementation(
      async (options: { config: unknown }) => ({
        kind: "scene-layout-template-readiness",
        version: 1,
        layout: {
          sha256: "a".repeat(64),
          id: "layout",
          entryCount: 2,
          totalBytes: 2048,
          modes: ["Base"],
          symbolPackages: ["symbols"],
          popups: ["popup"],
        },
        compatibility: {
          renderMode: "grid-cell",
          reelKind: "grid-cell",
          cascadeEnabled: true,
          capabilities: {
            spinToScene: true,
            visibleSymbolStates: true,
            removeOccurrences: true,
            dropdownOccurrences: true,
            refillOccurrences: true,
          },
          columns: 6,
          rows: 9,
          initialMode: "Base",
          popupAvailable: true,
        },
        normalizedConfig: options.config,
        warnings: ["warning"],
      }),
    );
    facade.launchRuntimeWindow.mockResolvedValue(undefined);

    const root = document.createElement("div");
    document.body.appendChild(root);
    createGameViewerAppShell(root);
    const layoutInput = root.querySelector<HTMLInputElement>(
      "[data-layout-input]",
    )!;
    setFiles(layoutInput, [new File([new Uint8Array([1, 2])], "layout.zip")]);
    layoutInput.dispatchEvent(new Event("change"));
    await flush();
    expect(root.querySelector("[data-layout-summary]")!.textContent).toContain(
      "layout",
    );

    const serverInput = root.querySelector<HTMLInputElement>(
      "[data-server-input]",
    )!;
    setFiles(serverInput, [new File(["{}"], "server.json")]);
    serverInput.dispatchEvent(new Event("change"));
    await flush();
    expect(
      root.querySelector<HTMLSelectElement>("[data-bet-method]")!.value,
    ).toBe("normal");
    root
      .querySelector<HTMLButtonElement>("[data-confirm-suggestions]")!
      .click();
    expect(
      root.querySelector<HTMLInputElement>("[name=spinComponent]")!.value,
    ).toBe("spin");

    root.querySelector<HTMLInputElement>("[name=serverUrl]")!.value =
      "wss://example.com/";
    root.querySelector<HTMLButtonElement>("[data-readiness]")!.click();
    await flush();
    expect(
      root.querySelector("[data-readiness-output]")!.textContent,
    ).toContain("READY");
    const launch = root.querySelector<HTMLButtonElement>("[data-launch]")!;
    expect(launch.disabled).toBe(false);
    launch.click();
    await flush();
    expect(facade.launchRuntimeWindow).toHaveBeenCalledOnce();
    expect(root.querySelector("[data-toast-stack]")!.textContent).toContain(
      "已安全接收",
    );
    root.remove();
  });
});
