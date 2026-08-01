import { beforeEach, describe, expect, it, vi } from "vitest";

const summary = {
  kind: "scene-other-scene-flow-package-summary",
  version: 1,
  sha256: "a".repeat(64),
  layoutId: "layout",
  initialMode: null,
  columns: 2,
  rows: 1,
  renderMode: "standard",
  symbolPackageId: "symbols",
  reelSet: "main",
  publicReels: [
    [1, 2],
    [2, 1],
  ],
  symbols: [
    {
      code: 1,
      name: "A",
      valueCapable: true,
      supportedStates: ["normal", "appear"],
    },
    {
      code: 2,
      name: "B",
      valueCapable: true,
      supportedStates: ["normal", "appear"],
    },
  ],
  states: [
    { id: "normal", phase: "stable", playback: "loop" },
    { id: "appear", phase: "once", playback: "once" },
  ],
  numberWeightTables: { values: [{ value: 5, weight: 1 }] },
} as const;

const flow = {
  kind: "scene-other-scene-flow",
  version: 1,
  spin: {
    kind: "standard",
    version: 1,
    direction: "forward",
    speedSymbolsPerSecond: 20,
    minimumSpinCycles: 1,
    baseDurationMs: 100,
    startDelayMs: 0,
    stopDelayMs: 0,
    bounceStrength: 0,
  },
  choreographies: [
    { id: "normal", name: "Normal", steps: [{ state: "normal" }] },
    {
      id: "landing",
      name: "Landing",
      steps: [{ state: "appear" }, { state: "normal" }],
    },
  ],
  snapshots: [1, 2].map((index) => ({
    id: `s${index}`,
    name: `S${index}`,
    scene: [[1], [2]],
    otherScene: [[null], [null]],
    choreographies:
      index === 1 ? [["normal"], ["normal"]] : [["landing"], ["landing"]],
  })),
} as const;

const mocks = vi.hoisted(() => ({ launch: vi.fn(), download: vi.fn() }));

vi.mock("@slotclientengine/rendercore/scene-layout", () => ({
  inspectSceneOtherSceneFlowPackage: vi.fn(async () => summary),
  createDefaultSceneOtherSceneFlowProject: vi.fn(() => structuredClone(flow)),
  inspectSceneOtherSceneFlowReadiness: vi.fn(async ({ project }) => ({
    layout: summary,
    project,
  })),
  parseSceneOtherSceneFlowProject: vi.fn((project) => project),
  rollSceneFromPublicReels: vi.fn(() => [[2], [1]]),
  rollOtherSceneValues: vi.fn(() => [[7], [7]]),
}));
vi.mock("../src/runtime/launch-channel.js", () => ({
  launchRuntimeWindow: mocks.launch,
}));
vi.mock("../src/model/project.js", () => ({
  downloadProject: mocks.download,
  parseGameViewer2ProjectFile: vi.fn((project) => project),
}));

import { createGameViewer2AppShell } from "../src/ui/app-shell.js";

describe("gameviewer2 app shell", () => {
  beforeEach(() => vi.clearAllMocks());

  it("authors scene chains, cell values, choreography steps and launches preview", async () => {
    const root = document.createElement("div");
    createGameViewer2AppShell(root);
    expect(root.textContent).toContain("导入 production ZIP");

    const layoutInput = root.querySelector<HTMLInputElement>("#layout-file")!;
    Object.defineProperty(layoutInput, "files", {
      configurable: true,
      value: [new File(["zip"], "layout.zip")],
    });
    layoutInput.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(root.querySelectorAll(".snapshot")).toHaveLength(2),
    );

    click(root, "add-snapshot");
    expect(root.querySelectorAll(".snapshot")).toHaveLength(3);
    click(root, "roll-scene");
    const card = root.querySelector<HTMLElement>("[data-snapshot]")!;
    card.querySelector<HTMLInputElement>("[data-roll-fixed]")!.value = "7";
    click(card, "roll-other");
    change(root.querySelector<HTMLSelectElement>('[data-edit="scene"]')!, "2");
    change(root.querySelector<HTMLInputElement>('[data-edit="other"]')!, "8");
    change(
      root.querySelector<HTMLSelectElement>('[data-edit="cell-choreography"]')!,
      "landing",
    );
    change(
      root.querySelector<HTMLInputElement>('[data-edit="snapshot-name"]')!,
      "Opening",
    );

    click(root, "tab-states");
    expect(root.querySelector(".state-workspace")).not.toBeNull();
    click(root, "add-choreography");
    change(
      root.querySelector<HTMLInputElement>('[data-edit="choreography-name"]')!,
      "Custom",
    );
    click(root, "step-add");
    click(root, "step-up");
    click(root, "step-down");
    change(
      root.querySelector<HTMLSelectElement>('[data-edit="step-state"]')!,
      "appear",
    );
    change(
      root.querySelector<HTMLInputElement>('[data-edit="step-hold"]')!,
      "0.2",
    );
    click(root, "step-delete");
    click(root, "copy-choreography");
    click(root, "tab-scenes");
    click(root, "export");
    expect(mocks.download).toHaveBeenCalledOnce();
    click(root, "preview");
    await vi.waitFor(() => expect(mocks.launch).toHaveBeenCalledOnce());
  });

  it("reports a mismatched imported project", async () => {
    const root = document.createElement("div");
    createGameViewer2AppShell(root);
    const input = root.querySelector<HTMLInputElement>("#project-file")!;
    const project = {
      kind: "gameviewer2-project",
      version: 1,
      layoutSha256: "b".repeat(64),
      flow,
    };
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([JSON.stringify(project)], "project.json")],
    });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("本地项目已导入"),
    );
  });
});

function click(root: ParentNode, action: string): void {
  root
    .querySelector<
      HTMLButtonElement | HTMLElement
    >(`[data-action="${action}"]`)!
    .click();
}

function change(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
): void {
  element.value = value;
  element.dispatchEvent(new Event("change"));
}
