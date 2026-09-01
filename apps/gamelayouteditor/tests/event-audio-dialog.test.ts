import { describe, expect, it, vi } from "vitest";
import type { SceneLayoutEventAudioBindingV1 } from "@slotclientengine/rendercore/scene-layout/data";
import { manifestToEditorProject } from "../src/model/editor-project.js";
import { mountProjectEventAudioDialog } from "../src/ui/event-audio-dialog.js";
import { assetBytes, imageManifest } from "./fixtures.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

function createSymbolEventProject(
  renderMode: "standard" | "grid-cell" = "standard",
) {
  const manifest = {
    ...imageManifest,
    nodes: imageManifest.nodes.map((node) => ({
      ...node,
      resource: { ...node.resource, path: "bg.png" },
    })),
    reels: {
      main: { ...imageManifest.reels.main, order: 1 },
    },
    symbolPackages: {
      base: {
        manifest: "symbols.package.json",
        reel: "main" as const,
        reelSet: "main",
        renderMode,
      },
    },
    gameModes: {
      initialMode: "BaseGame",
      modes: [
        {
          id: "BaseGame",
          backgroundNodes: { default: "bg" },
          nodeStates: {},
          symbolPackage: "base",
        },
      ],
      transitions: [],
    },
  };
  const assets = new Map([["bg.png", assetBytes.get("assets/bg.png")!]]);
  assets.set(
    "symbols.package.json",
    encode({
      version: 1,
      kind: "symbol-package",
      id: "base",
      cellSize: { width: 20, height: 20 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources: ["a.png"],
    }),
  );
  assets.set(
    "gameconfig.json",
    encode({
      paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
      symbolCodes: { A: 0 },
      reels: { main: [[0], [0]] },
    }),
  );
  assets.set(
    "symbol-state-textures.manifest.json",
    encode({
      version: 1,
      states: ["win"],
      symbols: {
        A: { normal: "./a.png", win: "./a.png", scale: 1 },
      },
    }),
  );
  assets.set("a.png", new Uint8Array([1]));
  return manifestToEditorProject(manifest, assets);
}

describe("project event audio dialog", () => {
  it("inspects the referenced package closure while retaining unbound workspace audio", async () => {
    const project = createSymbolEventProject();
    project.assets.set("assets/unbound.mp3", new Uint8Array([1, 2, 3]));
    project.resources.set("assets/unbound.mp3", {
      id: "assets/unbound.mp3",
      kind: "audio",
      path: "assets/unbound.mp3",
      mediaType: "audio/mpeg",
    });
    const root = document.createElement("div");
    document.body.append(root);
    const dialog = mountProjectEventAudioDialog({
      root,
      project,
      onConfirm: vi.fn(),
    });

    dialog.open();

    await vi.waitFor(() => {
      expect(dialog.element.textContent).toContain("个可侦听 event");
    });
    expect(dialog.element.textContent).not.toContain(
      "无法读取 Game Layout event",
    );
    const add = dialog.element.querySelector<HTMLButtonElement>(
      '[data-event-action="add"]',
    );
    expect(add).not.toBeNull();
    add!.click();
    expect(dialog.element.textContent).toContain("Spin 生命周期");
    expect(dialog.element.textContent).toContain("Symbol 状态");
    expect(dialog.element.textContent).toContain("批量图标状态");
    const choose = (action: "family" | "pick", value: string) => {
      const button = [
        ...dialog.element.querySelectorAll<HTMLButtonElement>(
          `[data-event-action="${action}"]`,
        ),
      ].find((candidate) => candidate.dataset.value === value);
      if (!button) throw new Error(`missing ${action} choice: ${value}`);
      button.click();
    };
    choose("family", "spin-lifecycle");
    for (const value of ["main", "reel-spin", "spin", "started"])
      choose("pick", value);
    expect(
      dialog.element.querySelector<HTMLSelectElement>(
        '[data-event-audio-field="category"]',
      )?.value,
    ).toBe("effect");
    expect(
      dialog.element.querySelector<HTMLSelectElement>(
        '[data-event-audio-field="playback"]',
      )?.value,
    ).toBe("once");
    expect(project.assets.has("assets/unbound.mp3")).toBe(true);
    dialog.destroy();
  });

  it.each([
    {
      name: "ReelSpin all axes",
      renderMode: "standard" as const,
      start: ["main", "reel-spin", "all", "started"],
      end: ["main", "reel-spin", "all", "stopped"],
      startAddress:
        "gamelayout:/reel/main/spin/reel-spin/x/*/lifecycle/started",
      endAddress: "gamelayout:/reel/main/spin/reel-spin/x/*/lifecycle/stopped",
    },
    {
      name: "GridCell column",
      renderMode: "grid-cell" as const,
      start: ["main", "grid-cell", "column", "1", "started"],
      end: ["main", "grid-cell", "column", "1", "stopped"],
      startAddress:
        "gamelayout:/reel/main/spin/grid-cell/x/1/y/*/lifecycle/started",
      endAddress:
        "gamelayout:/reel/main/spin/grid-cell/x/1/y/*/lifecycle/stopped",
    },
    {
      name: "CellSpin all cells",
      renderMode: "standard" as const,
      start: ["main", "cell-spin", "all", "started"],
      end: ["main", "cell-spin", "all", "stopped"],
      startAddress:
        "gamelayout:/reel/main/spin/cell-spin/x/*/y/*/lifecycle/started",
      endAddress:
        "gamelayout:/reel/main/spin/cell-spin/x/*/y/*/lifecycle/stopped",
    },
  ])(
    "commits $name wildcard start and end events through the formal dialog",
    async ({ renderMode, start, end, startAddress, endAddress }) => {
      const project = createSymbolEventProject(renderMode);
      project.assets.set("assets/spin.mp3", new Uint8Array([1, 2, 3]));
      project.resources.set("assets/spin.mp3", {
        id: "assets/spin.mp3",
        kind: "audio",
        path: "assets/spin.mp3",
        mediaType: "audio/mpeg",
      });
      const root = document.createElement("div");
      document.body.append(root);
      let confirmed: readonly SceneLayoutEventAudioBindingV1[] = [];
      const dialog = mountProjectEventAudioDialog({
        root,
        project,
        onConfirm(bindings) {
          confirmed = bindings;
        },
      });

      try {
        dialog.open();
        await vi.waitFor(() => {
          expect(dialog.element.textContent).toContain("个可侦听 event");
        });
        clickChoice(dialog.element, "add");
        chooseEventPath(dialog.element, start);
        expect(dialog.element.textContent).toContain(startAddress);
        changeSelect(
          dialog.element,
          '[data-event-audio-field="asset"]',
          "assets/spin.mp3",
        );
        changeSelect(
          dialog.element,
          '[data-event-audio-field="playback"]',
          "loop",
        );

        const endTrigger = dialog.element.querySelector<HTMLButtonElement>(
          "[data-event-audio-end-event] .editor-event-dialog-trigger",
        );
        if (!endTrigger) throw new Error("missing end Event picker trigger");
        endTrigger.click();
        const endDialog = await waitForEndEventDialog();
        chooseEventPath(endDialog, end);
        expect(endDialog.textContent).toContain(endAddress);
        clickChoice(endDialog, "save-row");
        await vi.waitFor(() => {
          expect(dialog.element.textContent).toContain(endAddress);
        });

        clickChoice(dialog.element, "save-row");
        expect(dialog.element.textContent).toContain(startAddress);
        clickChoice(dialog.element, "confirm");
        await vi.waitFor(() => expect(confirmed).toHaveLength(1));
        expect(confirmed).toEqual([
          expect.objectContaining({
            event: startAddress,
            endEvent: endAddress,
            audio: expect.objectContaining({
              category: "effect",
              playback: "loop",
              asset: {
                sources: [{ path: "assets/spin.mp3", mediaType: "audio/mpeg" }],
              },
            }),
          }),
        ]);
        expect(project.assets.has("assets/spin.mp3")).toBe(true);
      } finally {
        dialog.destroy();
      }
    },
  );
});

function chooseEventPath(root: ParentNode, values: readonly string[]): void {
  clickChoice(root, "family", "spin-lifecycle");
  for (const value of values) clickChoice(root, "pick", value);
}

function clickChoice(
  root: ParentNode,
  action: "add" | "confirm" | "family" | "pick" | "save-row",
  value?: string,
): void {
  const selector =
    action === "confirm"
      ? "[data-event-confirm]"
      : `[data-event-action="${action}"]${value === undefined ? "" : `[data-value="${value}"]`}`;
  const button = [...root.querySelectorAll<HTMLButtonElement>(selector)][0];
  if (!button)
    throw new Error(`missing Event action: ${action}:${value ?? ""}`);
  button.click();
}

function changeSelect(root: ParentNode, selector: string, value: string): void {
  const select = root.querySelector<HTMLSelectElement>(selector);
  if (!select) throw new Error(`missing select: ${selector}`);
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

async function waitForEndEventDialog(): Promise<HTMLDialogElement> {
  let endDialog: HTMLDialogElement | null = null;
  await vi.waitFor(() => {
    endDialog = document.body.querySelector<HTMLDialogElement>(
      'dialog[aria-label="选择结束 Event"]',
    );
    expect(endDialog?.textContent).toContain("选择 Event");
  });
  if (!endDialog) throw new Error("missing end Event dialog");
  return endDialog;
}
