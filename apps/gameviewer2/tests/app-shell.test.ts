import { beforeEach, describe, expect, it, vi } from "vitest";

const summary = {
  kind: "scene-other-scene-flow-package-summary",
  version: 1,
  sha256: "a".repeat(64),
  layoutId: "layout",
  initialMode: null,
  columns: 2,
  rows: 2,
  renderMode: "standard",
  symbolPackageId: "symbols",
  reelSet: "main",
  publicReels: [
    [1, 2, 1],
    [2, 1, 2],
  ],
  symbols: [
    {
      code: 1,
      name: "A",
      valueCapable: true,
      defaultValues: [1],
      supportedStates: ["normal", "spinBlur", "appear"],
      valueRequiredStates: ["normal", "appear"],
    },
    {
      code: 2,
      name: "B",
      valueCapable: true,
      defaultValues: [1],
      supportedStates: ["normal", "spinBlur", "appear"],
      valueRequiredStates: ["normal", "appear"],
    },
  ],
  states: [
    { id: "normal", phase: "stable", playback: "loop" },
    { id: "spinBlur", phase: "stable", playback: "loop" },
    { id: "appear", phase: "once", playback: "once" },
  ],
  numberWeightTables: { values: [{ value: 5, weight: 1 }] },
} as const;

const flow = {
  kind: "scene-other-scene-flow",
  version: 2,
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
    {
      kind: "spin",
      id: "spin",
      name: "Spin",
      beforeSpin: { state: "normal" },
      spinning: { state: "spinBlur" },
      stopping: [{ state: "appear" }, { state: "normal" }],
    },
    {
      kind: "sequence",
      id: "normal",
      name: "Normal",
      steps: [{ state: "normal" }],
    },
  ],
  snapshots: [
    {
      kind: "initial",
      id: "s1",
      name: "S1",
      scene: [
        [1, 2],
        [2, 1],
      ],
      otherScene: [
        [null, null],
        [null, null],
      ],
    },
    {
      kind: "scene",
      id: "s2",
      name: "S2",
      transition: "spin",
      completionPolicy: "all-cells-normal",
      scene: [
        [2, 1],
        [1, 2],
      ],
      otherScene: [
        [null, null],
        [null, null],
      ],
      choreographies: [
        ["spin", "spin"],
        ["spin", "spin"],
      ],
    },
  ],
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
  rollSceneFromPublicReels: vi.fn(() => [
    [2, 1],
    [1, 2],
  ]),
  fillMissingSymbolValues: vi.fn(({ otherScene }) => otherScene),
  rollOtherSceneValues: vi.fn(() => [
    [7, 7],
    [7, 7],
  ]),
}));
vi.mock("../src/runtime/launch-channel.js", () => ({
  launchRuntimeWindow: mocks.launch,
}));
vi.mock("../src/model/project.js", () => ({
  downloadProject: mocks.download,
  parseGameViewer2ProjectFile: vi.fn((project) => {
    if (project.version !== 3) throw new Error("v3 required");
    return project;
  }),
  parseGameViewer2ProjectFileV2: vi.fn((project) => project),
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
    expect(
      [
        ...root.querySelectorAll<HTMLElement>(
          '[data-snapshot][data-index="0"] [data-cell]',
        ),
      ].map((cell) => `${cell.dataset.x},${cell.dataset.y}`),
    ).toEqual(["0,0", "1,0", "0,1", "1,1"]);
    expect(
      root
        .querySelector<HTMLElement>(
          '[data-snapshot][data-index="0"] .cell-grid',
        )!
        .getAttribute("style"),
    ).toContain("--columns:2");

    click(root, "add-snapshot");
    expect(root.querySelectorAll(".snapshot")).toHaveLength(3);
    click(root, "roll-scene");
    const card = root.querySelector<HTMLElement>("[data-snapshot]")!;
    card.querySelector<HTMLInputElement>("[data-roll-fixed]")!.value = "7";
    click(card, "roll-other");
    change(root.querySelector<HTMLSelectElement>('[data-edit="scene"]')!, "2");
    change(root.querySelector<HTMLInputElement>('[data-edit="other"]')!, "8");
    const settled = root.querySelector<HTMLElement>(
      '[data-snapshot][data-index="2"]',
    )!;
    settled
      .querySelectorAll<HTMLInputElement>('[data-edit="other"]')
      .forEach((input) => change(input, "8"));
    change(
      settled.querySelector<HTMLSelectElement>(
        '[data-edit="cell-choreography"]',
      )!,
      "normal",
    );
    change(
      root.querySelector<HTMLSelectElement>('[data-edit="completion-policy"]')!,
      "first-cell-normal",
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
    expect(root.querySelector('[data-edit="step-hold"]')).toBeNull();
    click(root, "step-delete");
    click(root, "copy-choreography");
    click(root, "tab-operations");
    expect(root.querySelectorAll(".operation-edge")).toHaveLength(2);
    expect(root.textContent).toContain(
      "positions、pairing、result、order、amount",
    );
    expect(
      root.querySelector<HTMLTextAreaElement>(
        '[data-edit="operation-payload"]',
      )!.value,
    ).toBe("{}");
    click(root, "tab-scenes");
    expect(
      root.querySelector<HTMLButtonElement>('[data-action="export"]')!.disabled,
    ).toBe(false);
    click(root, "export");
    expect(mocks.download).toHaveBeenCalledOnce();
    click(root, "preview");
    await vi.waitFor(() => expect(mocks.launch).toHaveBeenCalledOnce());
  });

  it("requires the layout before explicitly upgrading a v2 project", async () => {
    const root = document.createElement("div");
    createGameViewer2AppShell(root);
    const input = root.querySelector<HTMLInputElement>("#project-file")!;
    const project = {
      kind: "gameviewer2-project",
      version: 2,
      layoutSha256: "b".repeat(64),
      flow,
    };
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([JSON.stringify(project)], "project.json")],
    });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("升级旧项目前必须先导入其 layout ZIP"),
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
