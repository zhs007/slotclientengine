import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const previewSpies = vi.hoisted(() => ({
  replay: vi.fn(),
  destroy: vi.fn(),
  setResource: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock("../src/preview/symbol-preview.js", () => ({
  SymbolEditorPreview: class {
    async init() {}
    destroy() {
      previewSpies.destroy();
    }
    clearResource() {}
    replay() {
      previewSpies.replay();
    }
    async setResource(...args: unknown[]) {
      return previewSpies.setResource(...args);
    }
    fitAll() {
      return 1;
    }
    getZoom() {
      return 1;
    }
    setZoom(value: number) {
      return value;
    }
  },
}));

import { SymbolsEditorApp } from "../src/ui/app-shell.js";

const gameConfig = {
  paytable: {
    "2": { code: 2, symbol: "B", pays: [1] },
    "1": { code: 1, symbol: "A", pays: [1] },
  },
  symbolCodes: { B: 2, A: 1 },
  reels: { main: [[1, 2]] },
};

describe("symbols editor app shell", () => {
  let root: HTMLElement;
  let app: SymbolsEditorApp;

  beforeEach(async () => {
    root = document.createElement("div");
    document.body.append(root);
    app = new SymbolsEditorApp(root);
    await app.init();
  });

  afterEach(() => app.destroy());

  it("keeps project-only actions disabled before a project exists", () => {
    expect(
      root.querySelector<HTMLButtonElement>("[data-upload]")?.disabled,
    ).toBe(false);
    expect(
      root.querySelector<HTMLButtonElement>("[data-export]")?.disabled,
    ).toBe(true);
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(root.textContent).toContain("建立 Symbols 项目");
  });

  it("creates into the assets workspace and renders only the active workspace", async () => {
    await createProject(root);
    expect(selectedTab(root, "workspace")).toBe("assets");
    expect(root.textContent).toContain("上传不会按文件名自动匹配");
    expect(root.querySelector("[data-symbol-query]")).toBeNull();
    expect(root.querySelector("[data-project-id]")).toBeNull();

    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    expect(root.querySelector("[data-symbol-query]")).not.toBeNull();
    expect(root.querySelector("[data-asset-query]")).toBeNull();
    expect(root.querySelector("[data-project-id]")).toBeNull();
  });

  it("exposes ARIA tabs and preserves inspector selection across transactions", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    expect(selectedTab(root, "inspector")).toBe("states");
    const included = root.querySelector<HTMLInputElement>(
      '[data-symbol-included="A"]',
    )!;
    included.checked = false;
    included.dispatchEvent(new Event("change", { bubbles: true }));
    expect(selectedTab(root, "workspace")).toBe("symbols");
    expect(selectedTab(root, "inspector")).toBe("states");
  });

  it("adds one state, synchronizes preview, focuses it and shows success feedback", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    click(root, "[data-toggle-add-state]");
    click(root, '[data-add-state-id="win"]');
    await Promise.resolve();
    expect(root.querySelector(".single-state-inspector h2")?.textContent).toBe(
      "win",
    );
    expect(
      root.querySelector<HTMLSelectElement>("[data-preview-state]")?.value,
    ).toBe("win");
    expect(root.querySelector("[data-feedback]")?.textContent).toContain(
      "已为 A 添加 win 状态",
    );
    expect(document.activeElement).toBe(
      root.querySelector("[data-visual-kind]"),
    );
    expect(root.textContent).toContain("explicit empty");
  });

  it("offers VNI for normal, once and stable loop states", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    expect(
      root
        .querySelector<HTMLSelectElement>("[data-visual-kind]")
        ?.querySelector('option[value="vni"]'),
    ).not.toBeNull();

    for (const state of ["win", "dropdown"]) {
      click(root, "[data-toggle-add-state]");
      click(root, `[data-add-state-id="${state}"]`);
      expect(
        root
          .querySelector<HTMLSelectElement>("[data-visual-kind]")
          ?.querySelector('option[value="vni"]'),
      ).not.toBeNull();
    }
  });

  it("defaults the only ready Spine atlas and derives its texture without another picker", async () => {
    await createProject(root);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    const files = ["H1.json", "Symbol.atlas", "Symbol.png"].map(
      (name) =>
        new File(
          [
            readFileSync(
              resolve(process.cwd(), `../../assets/game003-s1/${name}`),
            ),
          ],
          name,
        ),
    );
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: files,
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("已上传 3 个资源"),
    );

    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    const kind = root.querySelector<HTMLSelectElement>("[data-visual-kind]")!;
    kind.value = "spine";
    kind.dispatchEvent(new Event("change", { bubbles: true }));

    expect(root.textContent).toContain("Symbol.atlas");
    expect(root.textContent).toContain("Texture · 由 Atlas page 自动解析");
    expect(root.textContent).toContain("Symbol.png");
    expect(
      root.querySelector('[data-open-picker*="spine-texture"]'),
    ).toBeNull();
  });

  it("imports multiple Spine skeletons that share one atlas and texture", async () => {
    await createProject(root);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    const names = [
      "CN_1.json",
      "CN_2.json",
      "CN_3.json",
      "CN_4.json",
      "Symbol.atlas",
      "Symbol.png",
    ];
    const files = names.map(
      (name) =>
        new File(
          [
            readFileSync(
              resolve(process.cwd(), `../../assets/game002-s3/${name}`),
            ),
          ],
          name,
        ),
    );
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: files,
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("已上传 6 个资源"),
    );

    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    const kind = root.querySelector<HTMLSelectElement>("[data-visual-kind]")!;
    kind.value = "spine";
    kind.dispatchEvent(new Event("change", { bubbles: true }));
    click(root, '[data-open-picker*="spine-skeleton"]');

    expect(
      [...root.querySelectorAll<HTMLElement>("[data-picker-candidate]")].map(
        (candidate) => candidate.dataset.pickerCandidate,
      ),
    ).toEqual(["CN_1.json", "CN_2.json", "CN_3.json", "CN_4.json"]);
    expect(root.textContent).toContain("Symbol.atlas");
    expect(root.textContent).toContain("Symbol.png");
  });

  it("still rejects a Spine import when multiple atlases make the closure ambiguous", async () => {
    await createProject(root);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    const skeleton = readFileSync(
      resolve(process.cwd(), "../../assets/game002-s3/CN_1.json"),
    );
    const atlas = readFileSync(
      resolve(process.cwd(), "../../assets/game002-s3/Symbol.atlas"),
    );
    const texture = readFileSync(
      resolve(process.cwd(), "../../assets/game002-s3/Symbol.png"),
    );
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [
        new File([skeleton], "CN_1.json"),
        new File([atlas], "Symbol.atlas"),
        new File([atlas], "Other.atlas"),
        new File([texture], "Symbol.png"),
      ],
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() =>
      expect(root.textContent).toContain("1 skeleton / 2 atlas"),
    );
    expect(root.textContent).not.toContain("已上传 4 个资源");
  });

  it("supports keyboard tab navigation and idempotent destroy", async () => {
    await createProject(root);
    const assets = root.querySelector<HTMLElement>(
      '[data-workspace-tab][data-tab-value="assets"]',
    )!;
    assets.focus();
    assets.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await Promise.resolve();
    expect(selectedTab(root, "workspace")).toBe("symbols");
    expect(document.activeElement?.getAttribute("data-tab-value")).toBe(
      "symbols",
    );
    app.destroy();
    app.destroy();
    expect(root.childElementCount).toBe(0);
  });

  it("keeps picker cancel mutation-free and binds only after confirmation", async () => {
    await createProject(root);
    const upload = root.querySelector<HTMLInputElement>("[data-upload-input]")!;
    const bytes = readFileSync(
      resolve(process.cwd(), "../../assets/game003-s1/H1.png"),
    );
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File([bytes], "H1.png", { type: "image/png" })],
    });
    upload.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(root.textContent).toContain("已上传 1 个资源"),
    );
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    const kind = root.querySelector<HTMLSelectElement>("[data-visual-kind]")!;
    kind.value = "image";
    kind.dispatchEvent(new Event("change", { bubbles: true }));

    click(root, "[data-open-picker]");
    expect(
      root.querySelector<HTMLDialogElement>("[data-resource-picker]")?.open,
    ).toBe(true);
    click(root, '[data-picker-candidate="H1.png"]');
    click(root, "[data-picker-cancel]");
    expect(root.querySelector(".binding-path")?.textContent).toContain(
      "未选择资源",
    );

    click(root, "[data-open-picker]");
    click(root, '[data-picker-candidate="H1.png"]');
    click(root, "[data-picker-confirm]");
    expect(root.querySelector(".binding-path")?.textContent).toBe("H1.png");
  });

  it("keeps project state definitions separate and exposes new custom states", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="project"]');
    expect(root.querySelector("[data-symbol-query]")).toBeNull();
    const id = root.querySelector<HTMLInputElement>("[data-custom-id]")!;
    id.value = "celebrate";
    click(root, "[data-add-custom]");
    expect(root.querySelector("[data-feedback]")?.textContent).toContain(
      "已添加项目状态 celebrate",
    );

    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    click(root, "[data-toggle-add-state]");
    expect(
      root.querySelector('[data-add-state-id="celebrate"]'),
    ).not.toBeNull();
  });

  it("keeps Value and Cascade compact until explicitly enabled", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="value"]');
    expect(root.querySelector("[data-enable-value]")).not.toBeNull();
    expect(root.querySelector(".tier-list")).toBeNull();
    click(root, "[data-enable-value]");
    expect(root.querySelectorAll("[data-tier-index]")).toHaveLength(1);
    expect(root.textContent).toContain("Texture · 由 Atlas page 自动解析");
    expect(
      [...root.querySelectorAll("[data-open-picker]")].some((element) =>
        element.getAttribute("data-open-picker")?.includes('"field":"texture"'),
      ),
    ).toBe(false);

    click(root, '[data-inspector-tab][data-tab-value="states"]');
    for (const state of ["win", "remove"]) {
      click(root, "[data-toggle-add-state]");
      click(root, `[data-add-state-id="${state}"]`);
    }
    click(root, '[data-inspector-tab][data-tab-value="cascade"]');
    const mode = root.querySelector<HTMLSelectElement>("[data-cascade-mode]")!;
    mode.value = "group";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.textContent).toContain("groupAmount");
  });

  it("keeps ImgNumber bindings aligned with tiers and removes inactive mode fields", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="value"]');
    click(root, "[data-enable-value]");
    click(
      root,
      '[data-value-action="text-type"][data-text-type="image-string"]',
    );
    expect(root.querySelectorAll(".value-number-tier")).toHaveLength(1);
    expect(root.querySelector('[data-value-field="text.prefix"]')).toBeNull();
    expect(root.textContent).toContain("未完成");

    click(root, '[data-value-action="add-tier"]');
    expect(root.querySelectorAll("[data-tier-index]")).toHaveLength(2);
    expect(root.querySelectorAll(".value-number-tier")).toHaveLength(2);
    click(root, '[data-value-action="remove-tier"][data-value-index="1"]');
    expect(root.querySelectorAll(".value-number-tier")).toHaveLength(1);

    click(root, '[data-value-action="text-type"][data-text-type="image"]');
    expect(root.querySelector(".value-number-tier")).toBeNull();
    expect(
      root.querySelector('[data-value-field="text.prefix"]'),
    ).not.toBeNull();
    expect(root.querySelector('[data-value-field^="text.tiers."]')).toBeNull();
  });

  it("surfaces protected state deletion as an error without fake success", async () => {
    await createProject(root);
    click(root, '[data-workspace-tab][data-tab-value="symbols"]');
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    for (const state of ["win", "remove"]) {
      click(root, "[data-toggle-add-state]");
      click(root, `[data-add-state-id="${state}"]`);
    }
    click(root, '[data-inspector-tab][data-tab-value="cascade"]');
    const mode = root.querySelector<HTMLSelectElement>("[data-cascade-mode]")!;
    mode.value = "group";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    click(root, '[data-inspector-tab][data-tab-value="states"]');
    click(root, '[data-select-state="win"]');
    click(root, '[data-state-action="remove"]');
    expect(root.querySelector("[data-errors]")?.textContent).toContain(
      "仍被引用",
    );
    expect(root.querySelector(".single-state-inspector h2")?.textContent).toBe(
      "win",
    );
    expect(root.querySelector("[data-feedback]")?.textContent).not.toContain(
      "删除",
    );
  });
});

async function createProject(root: HTMLElement): Promise<void> {
  const input = root.querySelector<HTMLInputElement>("[data-new-input]")!;
  const file = new File([JSON.stringify(gameConfig)], "test-game.json", {
    type: "application/json",
  });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() =>
    expect(
      root.querySelector('[data-workspace-tab][aria-selected="true"]'),
    ).not.toBeNull(),
  );
}

function click(root: HTMLElement, selector: string): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing test element ${selector}`);
  element.click();
}

function selectedTab(root: HTMLElement, group: string): string | undefined {
  return (
    root
      .querySelector<HTMLElement>(`[data-${group}-tab][aria-selected="true"]`)
      ?.getAttribute("data-tab-value") ?? undefined
  );
}
