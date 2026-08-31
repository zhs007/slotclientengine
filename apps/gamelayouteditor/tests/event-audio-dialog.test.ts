import { describe, expect, it, vi } from "vitest";
import { manifestToEditorProject } from "../src/model/editor-project.js";
import { mountProjectEventAudioDialog } from "../src/ui/event-audio-dialog.js";
import { assetBytes, imageManifest } from "./fixtures.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

function createSymbolEventProject() {
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
        renderMode: "standard" as const,
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
});
