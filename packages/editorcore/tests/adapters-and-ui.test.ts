import { describe, expect, it, vi } from "vitest";
import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  createEditorAssetWorkspace,
  createEditorAssetsMapFromWorkspace,
  createEmptyEditorAssetWorkspace,
  materializeEditorAssetPayloads,
  serializeEditorAssetsMap,
} from "@slotclientengine/editorresource";
import { upgradeSceneLayoutManifestToLatest } from "@slotclientengine/rendercore/scene-layout/editor";
import {
  DEFAULT_EDITOR_ASSET_INGESTION_LIMITS,
  discoverDefaultEditorAssets,
  createDefaultEditorAssetsController,
  ingestAndDiscoverDefaultEditorAssets,
  inspectEditorGameLayoutEventCatalog,
  validateEditorGameLayoutEventGroup,
  type EditorGameLayoutEventCatalog,
  type EditorGameLayoutEventGroup,
} from "../src/assets/adapters/index.js";
import { mergeEditorAssetCatalog } from "../src/assets/core/index.js";
import type {
  EditorAssetHostAdapter,
  EditorAssetRootDraft,
} from "../src/assets/data/index.js";
import {
  createDefaultEditorAssetPreview,
  mountEditorAssetsDialog,
  mountEditorGameLayoutEventDialog,
  mountEditorGameLayoutEventPickerDialog,
  mountEditorAssetsView,
} from "../src/assets/ui/index.js";

describe("default adapters", () => {
  it("allows compressed ZIP sources to reach the stricter payload limits", () => {
    expect(DEFAULT_EDITOR_ASSET_INGESTION_LIMITS.files.maxFileBytes).toBe(
      DEFAULT_EDITOR_ASSET_INGESTION_LIMITS.zip.maxCompressedBytes,
    );
    expect(DEFAULT_EDITOR_ASSET_INGESTION_LIMITS.zip.maxFileBytes).toBe(
      50 * 1024 * 1024,
    );
  });

  it("discovers supported atomic image, audio, and video signatures", async () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 1]);
    const mp4 = new Uint8Array(12);
    mp4.set(new TextEncoder().encode("ftyp"), 4);
    const result = await discoverDefaultEditorAssets({
      sources: [
        loose("coin.png", PNG),
        loose("win.mp3", mp3),
        loose("intro.mp4", mp4),
      ],
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts.map(({ kind }) => kind)).toEqual([
      "image",
      "audio",
      "video",
    ]);

    const invalid = await discoverDefaultEditorAssets({
      sources: [loose("bad.mp3", new Uint8Array([1, 2, 3]))],
    });
    expect(invalid.blockingErrors[0]).toMatch(/signature/u);
  });

  it("keeps files without a loader as opaque text or binary roots", async () => {
    const result = await discoverDefaultEditorAssets({
      sources: [
        loose("notes.custom", encode("future loader input")),
        loose("payload.custom", new Uint8Array([0, 0xff, 1])),
        loose("unknown.json", encode({ futureFormat: true })),
      ],
    });

    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts.map(({ key, kind }) => ({ key, kind }))).toEqual([
      { key: "notes.custom", kind: "text" },
      { key: "payload.custom", kind: "binary" },
      { key: "unknown.json", kind: "text" },
    ]);
    expect(result.drafts.map(({ inputs }) => inputs[0]!.mediaType)).toEqual([
      "text/plain",
      "application/octet-stream",
      "application/json",
    ]);
  });

  it("discovers a loose VNI project and rewrites its image to a flat key", async () => {
    const result = await discoverDefaultEditorAssets({
      sources: [
        loose("project.json", encode(vniProject("runtime", "runtime"))),
        loose("spark.png", PNG),
      ],
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      kind: "vni",
      key: "project.json",
      exactKeys: ["project.json", "spark.png"],
    });
    const controller = createTestController();
    const preparation = await controller.prepareImport([
      source("project.json", encode(vniProject("runtime", "runtime"))),
      source("spark.png", PNG),
    ]);
    await controller.commitImport(preparation);
    const exported = await controller.exportRoot("project.json");
    expectZipHas(exported.bytes, ["project.json", "spark.png"]);
  });

  it("ingests a mapped ImgNumber ZIP through the single public importer", async () => {
    const manifest = {
      version: 1,
      kind: "image-string",
      id: "digits",
      metrics: { lineHeight: 10, letterSpacing: 0 },
      glyphs: {
        "0": {
          path: "0.png",
          size: { width: 5, height: 10 },
          offset: { x: 0, y: 0 },
        },
      },
      fixedAdvanceGroups: [],
    };
    const entries = await mappedEntries([
      { key: "0.png", mediaType: "image/png", bytes: PNG },
    ]);
    entries.set("image-string.manifest.json", encode(manifest));
    const zip = createDeterministicZip(entries);
    const result = await ingestAndDiscoverDefaultEditorAssets({
      files: [source("digits.zip", zip)],
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({
      kind: "image-string",
      key: "digits-image-string.manifest.json",
    });
    expect(result.drafts[0]!.exactKeys).toEqual([
      "digits-image-string.manifest.json",
      "digits-0.png",
    ]);
    const controller = createTestController();
    const preparation = await controller.prepareImport([
      source("digits.zip", zip),
    ]);
    await controller.commitImport(preparation);
    const exported = await controller.exportRoot(
      "digits-image-string.manifest.json",
    );
    expect(exported.filename).toBe("digits-image-string.zip");
    expectZipHas(exported.bytes, [
      "image-string.manifest.json",
      EDITOR_ASSETS_MAP_PATH,
    ]);
  });

  it("requires an explicit runtime profile for a multi-profile VNI ZIP", async () => {
    const entries = vniBundleEntries();
    const sources = zipSources("effects.zip", entries);
    const pending = await discoverDefaultEditorAssets({ sources });
    expect(pending.drafts).toEqual([]);
    expect(pending.profiles.map(({ id }) => id)).toEqual([
      "runtime_100",
      "runtime_50",
    ]);
    expect(pending.blockingErrors[0]).toMatch(/必须明确选择/u);

    const selected = await discoverDefaultEditorAssets({
      sources,
      profileSelections: { "effects.zip": "runtime_50" },
    });
    expect(selected.blockingErrors).toEqual([]);
    expect(selected.drafts[0]).toMatchObject({
      kind: "vni",
      owner: "vni-runtime_50",
    });
  });

  it("discovers a mapped Popup package and keeps its Spine closure internal", async () => {
    const skeleton = encode({
      skeleton: { spine: "4.3.23" },
      slots: [{ name: "coin" }],
      animations: { Start: {}, Idle: {}, End: {} },
    });
    const atlas = new TextEncoder().encode(
      "page.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\n",
    );
    const entries = await mappedEntries([
      { key: "hero.json", mediaType: "application/json", bytes: skeleton },
      { key: "hero.atlas", mediaType: "text/plain", bytes: atlas },
      { key: "page.png", mediaType: "image/png", bytes: PNG },
    ]);
    entries.set(
      "popup.manifest.json",
      encode({
        version: 1,
        kind: "popup",
        id: "demo-popup",
        type: "spine",
        designViewport: { width: 100, height: 100 },
        resources: {
          "hero.json": {
            kind: "spine",
            skeleton: "hero.json",
            atlas: "hero.atlas",
            textures: { "page.png": "page.png" },
          },
        },
        spine: {
          resource: "hero.json",
          transform: { x: 0, y: 0, scale: 1 },
          playback: {
            mode: "segmented-animations",
            startAnimation: "Start",
            loopAnimation: "Idle",
            endAnimation: "End",
          },
        },
      }),
    );
    const result = await discoverDefaultEditorAssets({
      sources: zipSources("popup.zip", entries),
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts[0]).toMatchObject({ kind: "popup" });
    expect(result.drafts[0]!.nodes.some(({ kind }) => kind === "atlas")).toBe(
      true,
    );
    expect(
      result.drafts[0]!.relations.some(({ kind }) => kind === "uses-texture"),
    ).toBe(true);
    const controller = createTestController();
    const preparation = await controller.prepareImport([
      source("popup.zip", createDeterministicZip(entries)),
    ]);
    await controller.commitImport(preparation);
    const exported = await controller.exportRoot(
      "demo-popup-popup.manifest.json",
    );
    expectZipHas(exported.bytes, [
      "popup.manifest.json",
      EDITOR_ASSETS_MAP_PATH,
    ]);
    const previewRoot = document.createElement("div");
    const preview = await createDefaultEditorAssetPreview({
      snapshot: controller.snapshot,
      rootKey: "demo-popup-popup.manifest.json",
      element: previewRoot,
    });
    expect(previewRoot.textContent).toContain("暂不支持预览");
    preview.destroy();
  });

  it("discovers and namespaces a strict mapped Symbols package", async () => {
    const packageManifest = {
      version: 1,
      kind: "symbol-package",
      id: "demo-symbols",
      cellSize: { width: 100, height: 100 },
      entrypoints: {
        gameConfig: "gameconfig.json",
        symbolManifest: "symbol-state-textures.manifest.json",
      },
      resources: ["A.png"],
    };
    const entries = await mappedEntries([
      { key: "A.png", mediaType: "image/png", bytes: PNG },
      {
        key: "future-symbol.txt",
        mediaType: "text/plain",
        bytes: encode("future symbol loader"),
      },
      {
        key: "future-symbol.bin",
        mediaType: "application/octet-stream",
        bytes: new Uint8Array([0, 0xff]),
      },
    ]);
    entries.set("symbols.package.json", encode(packageManifest));
    entries.set(
      "gameconfig.json",
      encode({
        paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
        symbolCodes: { A: 0 },
        reels: { main: [[0]] },
      }),
    );
    entries.set(
      "symbol-state-textures.manifest.json",
      encode({
        version: 1,
        states: [],
        symbols: { A: { normal: "./A.png", scale: 1 } },
      }),
    );
    const result = await discoverDefaultEditorAssets({
      sources: zipSources("symbols.zip", entries),
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts.map(({ kind }) => kind)).toEqual([
      "symbols",
      "binary",
      "text",
    ]);
    expect(result.drafts[0]).toMatchObject({
      kind: "symbols",
      key: "demo-symbols-symbols.package.json",
    });
    expect(result.drafts[0]!.exactKeys).toContain("demo-symbols-A.png");
    const controller = createTestController();
    const preparation = await controller.prepareImport([
      source("symbols.zip", createDeterministicZip(entries)),
    ]);
    await controller.commitImport(preparation);
    const exported = await controller.exportRoot(
      "demo-symbols-symbols.package.json",
    );
    expectZipHas(exported.bytes, ["symbols.package.json"]);
  });

  it("discovers an existing mapped Game Layout package", async () => {
    const manifest = {
      version: 1,
      kind: "scene-layout",
      id: "demo-layout",
      adaptation: {
        mode: "maximized-focus",
        artSize: { width: 100, height: 100 },
        focusRect: { x: 0, y: 0, width: 100, height: 100 },
        backgroundNode: "bg",
      },
      nodes: [
        {
          id: "bg",
          order: 0,
          resource: {
            kind: "image",
            path: "bg.png",
            size: { width: 1, height: 1 },
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      ],
      reels: {
        main: {
          columns: 1,
          rows: 1,
          cellSize: { width: 1, height: 1 },
          gap: { x: 0, y: 0 },
          placements: { default: { x: 0, y: 0 } },
        },
      },
    };
    const entries = await mappedEntries([
      { key: "bg.png", mediaType: "image/png", bytes: PNG },
      {
        key: "future-layout.dat",
        mediaType: "application/octet-stream",
        bytes: new Uint8Array([0, 0xff]),
      },
    ]);
    entries.set("layout.manifest.json", encode(manifest));

    const result = await discoverDefaultEditorAssets({
      sources: zipSources("layout.zip", entries),
    });

    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts.map(({ kind }) => kind)).toEqual([
      "game-layout",
      "binary",
    ]);
    expect(result.drafts[0]).toMatchObject({
      kind: "game-layout",
      key: "demo-layout-layout.manifest.json",
      owner: "game-layout:demo-layout",
    });
    expect(result.drafts[0]!.exactKeys).toEqual([
      "demo-layout-layout.manifest.json",
      "bg.png",
    ]);
    const controller = createTestController();
    const preparation = await controller.prepareImport([
      source("layout.zip", createDeterministicZip(entries)),
    ]);
    await controller.commitImport(preparation);
    const exported = await controller.exportRoot(
      "demo-layout-layout.manifest.json",
    );
    expectZipHas(exported.bytes, [
      "layout.manifest.json",
      EDITOR_ASSETS_MAP_PATH,
    ]);
  });

  it("derives editable events from a complete Game Layout ZIP and rejects stale rows after replacement", async () => {
    const controller = createTestController();
    const firstZip = createDeterministicZip(
      await gameLayoutEventEntries("win"),
    );
    const first = await controller.prepareImport([
      source("event-layout.zip", firstZip),
    ]);
    expect(first.blockingErrors).toEqual([]);
    await controller.commitImport(first);

    const rootKey = "event-layout-layout.manifest.json";
    const catalog = inspectEditorGameLayoutEventCatalog(
      controller.snapshot,
      rootKey,
    );
    const columnWin = catalog.entries.find(
      (entry) =>
        entry.family === "symbol-state" &&
        entry.facets.some(
          ({ key, value }) => key === "state" && value === "win",
        ) &&
        entry.facets.some(
          ({ key, value }) => key === "scope" && value === "column",
        ) &&
        entry.facets.some(({ key, value }) => key === "x" && value === "1") &&
        entry.facets.some(
          ({ key, value }) => key === "edge" && value === "entered",
        ),
    );
    expect(columnWin).toBeDefined();
    const batchWin = catalog.entries.find(
      (entry) =>
        entry.family === "symbols-state-batch" &&
        entry.descriptor.address ===
          "gamelayout:/symbol-package/base/symbolsstatebatch/A/win",
    );
    expect(batchWin).toMatchObject({
      facets: [
        { key: "symbol-package", value: "base" },
        { key: "symbol", value: "A" },
        { key: "state", value: "win" },
      ],
    });
    expect(catalog.entries.some(({ family }) => family === "variant")).toBe(
      true,
    );
    expect(
      catalog.entries.find(
        ({ descriptor }) =>
          descriptor.address ===
          "gamelayout:/reel/main/spin/reel-spin/x/*/lifecycle/started",
      ),
    ).toMatchObject({
      family: "spin-lifecycle",
      facets: [
        { key: "reel", value: "main" },
        { key: "spin", value: "reel-spin" },
        { key: "scope", value: "all" },
        { key: "lifecycle", value: "started" },
      ],
    });
    expect(
      catalog.entries.some(
        ({ descriptor }) =>
          descriptor.address ===
          "gamelayout:/reel/main/spin/cell-spin/lifecycle/all-stopped",
      ),
    ).toBe(true);
    expect(
      catalog.entries.find(
        ({ descriptor }) =>
          descriptor.address ===
          "gamelayout:/reel/main/spin/reel-spin/lifecycle/started",
      ),
    ).toMatchObject({
      family: "spin-lifecycle",
      facets: [
        { key: "reel", value: "main" },
        { key: "spin", value: "reel-spin" },
        { key: "scope", value: "spin" },
        { key: "lifecycle", value: "started" },
      ],
    });

    const host = document.createElement("div");
    document.body.append(host);
    const confirmation: { value: EditorGameLayoutEventGroup | null } = {
      value: null,
    };
    const dialog = mountEditorGameLayoutEventDialog({
      controller,
      root: host,
      onConfirm(value) {
        confirmation.value = value;
      },
    });
    dialog.open();
    const rootSelect = required<HTMLSelectElement>(host, "[data-event-root]");
    rootSelect.value = rootKey;
    rootSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    click(required(host, '[data-event-action="add"]'));
    expect(host.textContent).toContain("Spin 生命周期");
    expect(host.textContent).toContain("Symbol 状态");
    expect(host.textContent).toContain("批量图标状态");

    const spinSearch = setEventSearch(host, " SpIn ");
    expect(document.activeElement).toBe(spinSearch);
    expect(eventChoiceValues(host, "family")).toEqual(["spin-lifecycle"]);
    expect(host.textContent).not.toContain("Symbol 状态");
    expect(host.textContent).not.toContain("批量图标状态");

    setEventSearch(host, "entered");
    expect(eventChoiceValues(host, "family")).toContain("symbol-state");
    expect(eventChoiceValues(host, "family")).not.toContain("spin-lifecycle");

    setEventSearch(host, "missing-catalog-event");
    expect(eventChoiceValues(host, "family")).toEqual([]);
    expect(host.textContent).toContain("没有匹配的 Event");
    expect(
      required<HTMLButtonElement>(host, '[data-event-action="save-row"]')
        .disabled,
    ).toBe(true);

    const addressQuery = columnWin!.descriptor.address.toUpperCase();
    setEventSearch(host, addressQuery);
    expect(eventChoiceValues(host, "family")).toEqual(["symbol-state"]);
    pickEventChoice(host, "symbol-state", "family");
    for (const value of ["base", "A", "win", "column", "1", "entered"]) {
      expect(eventChoiceValues(host, "pick")).toEqual([value]);
      pickEventChoice(host, value, "pick");
      expect(
        required<HTMLInputElement>(host, "[data-event-search]").value,
      ).toBe(addressQuery);
    }
    expect(host.textContent).toContain("选择完成");
    setEventSearch(host, "");
    expect(host.textContent).toContain("选择完成");
    click(required(host, '[data-event-action="save-row"]'));
    expect(host.textContent).toContain(columnWin!.descriptor.address);
    click(required(host, '[data-event-action="edit"]'));
    click(required(host, '[data-event-action="truncate"][data-count="5"]'));
    pickEventChoice(host, "exited", "pick");
    click(required(host, '[data-event-action="save-row"]'));
    expect(host.textContent).not.toContain(columnWin!.descriptor.address);
    click(required(host, '[data-event-action="remove"]'));
    expect(host.textContent).toContain("尚未添加 event");
    click(required(host, '[data-event-action="add"]'));
    pickEventChoice(host, "symbol-state", "family");
    for (const value of ["base", "A", "win", "column", "1", "entered"])
      pickEventChoice(host, value, "pick");
    click(required(host, '[data-event-action="save-row"]'));
    click(required(host, "[data-event-confirm]"));
    await flush();
    const confirmed = confirmation.value;
    if (!confirmed) throw new Error("event dialog did not confirm a value");
    expect(confirmed.events.map(({ address }) => address)).toEqual([
      columnWin!.descriptor.address,
    ]);
    dialog.open();
    await flush();
    click(required(host, '[data-event-action="remove"]'));
    click(required(host, "[data-event-cancel]"));
    dialog.open();
    await flush();
    expect(host.textContent).toContain(columnWin!.descriptor.address);
    dialog.close();

    const configuredHost = document.createElement("div");
    document.body.append(configuredHost);
    let configuredConfirmation: unknown = null;
    const configuredDialog = mountEditorGameLayoutEventDialog({
      root: configuredHost,
      sources: [{ key: rootKey, label: "当前项目" }],
      value: { rootKey, events: [] },
      inspectCatalog: () => catalog,
      configuration: {
        create: () => ({ gain: 50 }),
        clone: (value) => ({ ...value }),
        mount(configurationRoot, context) {
          configurationRoot.textContent = `gain:${context.value.gain}`;
          context.setValue({ gain: 25 });
        },
        validate(value) {
          if (value.gain < 0) throw new Error("gain must be non-negative");
        },
        summarize: (value) => `gain:${value.gain}`,
      },
      onConfirm(value) {
        configuredConfirmation = value;
      },
    });
    configuredDialog.open();
    await flush();
    click(required(configuredHost, '[data-event-action="add"]'));
    pickEventChoice(configuredHost, "symbol-state", "family");
    for (const value of ["base", "A", "win", "column", "1", "entered"])
      pickEventChoice(configuredHost, value, "pick");
    expect(configuredHost.textContent).toContain("gain:50");
    click(required(configuredHost, '[data-event-action="save-row"]'));
    expect(configuredHost.textContent).toContain("gain:25");
    click(required(configuredHost, "[data-event-confirm]"));
    await flush();
    expect(configuredConfirmation).toMatchObject({
      rootKey,
      events: [{ configuration: { gain: 25 } }],
    });
    configuredDialog.destroy();

    const pickerHost = document.createElement("div");
    document.body.append(pickerHost);
    let pickedAddress = "";
    const picker = mountEditorGameLayoutEventPickerDialog({
      root: pickerHost,
      rootKey,
      sources: [{ key: rootKey, label: "当前项目" }],
      inspectCatalog: () => catalog,
      onConfirm(value) {
        pickedAddress = value.address;
      },
    });
    picker.open();
    await flush();
    expect(pickerHost.querySelector('[data-event-action="add"]')).toBeNull();
    expect(pickerHost.textContent).toContain("选择 Event");
    setEventSearch(pickerHost, "spin");
    expect(eventChoiceValues(pickerHost, "family")).toEqual(["spin-lifecycle"]);
    setEventSearch(pickerHost, "");
    pickEventChoice(pickerHost, "spin-lifecycle", "family");
    for (const value of ["main", "reel-spin", "all", "started"])
      pickEventChoice(pickerHost, value, "pick");
    expect(pickerHost.textContent).toContain("全部轴（x=* 通配符）");
    click(required(pickerHost, '[data-event-action="save-row"]'));
    await flush();
    expect(pickedAddress).toBe(
      "gamelayout:/reel/main/spin/reel-spin/x/*/lifecycle/started",
    );
    picker.destroy();

    const second = await controller.prepareImport([
      source(
        "event-layout.zip",
        createDeterministicZip(await gameLayoutEventEntries("appear", "B")),
      ),
    ]);
    await controller.commitImport(
      second,
      second.review.items
        .map((item, itemIndex) => ({ item, itemIndex }))
        .filter(({ item }) => item.action === "overwrite")
        .map(({ itemIndex }) => ({
          itemIndex,
          resolution: "overwrite" as const,
        })),
    );
    const replacement = inspectEditorGameLayoutEventCatalog(
      controller.snapshot,
      rootKey,
    );
    expect(() =>
      validateEditorGameLayoutEventGroup(replacement, confirmed!),
    ).toThrow(/不属于当前 Game Layout ZIP/u);
    dialog.setValue(confirmed);
    dialog.open();
    await flush();
    expect(host.textContent).toContain("已失效");
    expect(
      required<HTMLButtonElement>(host, "[data-event-confirm]").disabled,
    ).toBe(true);
    dialog.destroy();
    controller.destroy();
  });

  it("selects exact and wildcard Spin lifecycle scopes from catalog facets", async () => {
    const standardCatalog = await inspectSpinEventCatalog("standard");
    const gridCellCatalog = await inspectSpinEventCatalog("grid-cell");

    await expectSpinSearchProjection(standardCatalog, {
      query: "通配符",
      spin: "reel-spin",
      scopes: ["all"],
      label: "全部轴（x=* 通配符）",
    });
    await expectSpinSearchProjection(gridCellCatalog, {
      query: "整列",
      spin: "grid-cell",
      scopes: ["column"],
      label: "整列（y=* 通配符）",
    });
    await expectSpinSearchProjection(gridCellCatalog, {
      query: "整行",
      spin: "cell-spin",
      scopes: ["row"],
      label: "整行（x=* 通配符）",
    });
    await expectSpinSearchProjection(gridCellCatalog, {
      query: "全部格",
      spin: "cell-spin",
      scopes: ["all"],
      label: "全部格（x=*, y=* 通配符）",
    });

    await expectSpinSelections(standardCatalog, [
      spinSelection("reel-spin", "axis", ["1"]),
      spinSelection("reel-spin", "all"),
      spinSelection("cell-spin", "cell", ["1", "1"]),
      spinSelection("cell-spin", "column", ["1"]),
      spinSelection("cell-spin", "row", ["1"]),
      spinSelection("cell-spin", "all"),
    ]);
    await expectSpinSelections(gridCellCatalog, [
      spinSelection("grid-cell", "cell", ["1", "1"]),
      spinSelection("grid-cell", "column", ["1"]),
      spinSelection("grid-cell", "row", ["1"]),
      spinSelection("grid-cell", "all"),
    ]);
  });

  it("binds Spine skeleton -> atlas -> page during prepare", async () => {
    const skeleton = new TextEncoder().encode(
      JSON.stringify({
        skeleton: { spine: "4.3.23" },
        slots: [{ name: "coin" }],
        animations: { Idle: {} },
      }),
    );
    const atlas = new TextEncoder().encode(
      "page.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\n",
    );
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const result = await discoverDefaultEditorAssets({
      sources: [
        loose("hero.json", skeleton),
        loose("hero.atlas", atlas),
        loose("page.png", png),
      ],
    });
    expect(result.blockingErrors).toEqual([]);
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]).toMatchObject({ kind: "spine", key: "hero.json" });
    expect(result.drafts[0]!.relations.map(({ kind }) => kind)).toEqual([
      "contains",
      "uses-atlas",
      "uses-texture",
    ]);
    const controller = createTestController();
    const preparation = await controller.prepareImport([
      source("hero.json", skeleton),
      source("hero.atlas", atlas),
      source("page.png", png),
    ]);
    await controller.commitImport(preparation);
    const exported = await controller.exportRoot("hero.json");
    expectZipHas(exported.bytes, ["hero.json", "hero.atlas", "page.png"]);
  });
});

describe("EditorAssetsView", () => {
  it("previews native image, audio, and video roots and releases their URLs", async () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 1]);
    const mp4 = new Uint8Array(12);
    mp4.set(new TextEncoder().encode("ftyp"), 4);
    const controller = createTestController();
    const preparation = await controller.prepareImport([
      source("coin.png", PNG),
      source("win.mp3", mp3),
      source("intro.mp4", mp4),
      source("notes.custom", new TextEncoder().encode("notes")),
    ]);
    await controller.commitImport(preparation);
    for (const [key, tag] of [
      ["coin.png", "IMG"],
      ["win.mp3", "AUDIO"],
      ["intro.mp4", "VIDEO"],
    ] as const) {
      const element = document.createElement("div");
      const preview = await createDefaultEditorAssetPreview({
        snapshot: controller.snapshot,
        rootKey: key,
        element,
      });
      expect(element.firstElementChild?.tagName).toBe(tag);
      preview.destroy();
      preview.destroy();
      expect(element.childElementCount).toBe(0);
    }
    const textElement = document.createElement("div");
    const textPreview = await createDefaultEditorAssetPreview({
      snapshot: controller.snapshot,
      rootKey: "notes.custom",
      element: textElement,
    });
    expect(textElement.textContent).toContain("没有预览");
    textPreview.destroy();
    await expect(
      createDefaultEditorAssetPreview({
        snapshot: controller.snapshot,
        rootKey: "missing.png",
        element: document.createElement("div"),
      }),
    ).rejects.toThrow(/preview root 不存在/u);
  });

  it("virtualizes a 10,000-root tree and destroys its DOM", () => {
    const drafts = Array.from({ length: 10_000 }, (_, index) =>
      atomicDraft(`asset-${String(index).padStart(5, "0")}.png`),
    );
    const catalog = mergeEditorAssetCatalog(
      { roots: new Map(), nodes: new Map(), relations: [] },
      drafts,
    );
    const host: EditorAssetHostAdapter<{ programs: Record<string, string> }> = {
      cloneProject: structuredClone,
      collectReferences: () => [],
      collectProgramBindings: () => [],
      renameReferences: (project) => project,
      setProgramBinding: (project) => project,
    };
    const controller = createDefaultEditorAssetsController({
      project: { programs: {} },
      host,
      initial: {
        catalog,
        workspace: createEmptyEditorAssetWorkspace(),
        project: { programs: {} },
      },
    });
    const root = document.createElement("div");
    document.body.append(root);
    const view = mountEditorAssetsView({ controller, root });
    expect(root.querySelectorAll(".editor-assets-row").length).toBeLessThan(40);
    expect(root.textContent).toContain("10000 roots");
    view.destroy();
    expect(root.childElementCount).toBe(0);
  });

  it("supports selection, preview, keyboard expansion, filters, binding, and deletion", async () => {
    const controller = createTestController();
    const prepared = await controller.prepareImport([source("coin.png", PNG)]);
    await controller.commitImport(prepared);
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:coin");
    const revokeUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const root = document.createElement("div");
    document.body.append(root);
    const view = mountEditorAssetsView({ controller, root });

    click(required(root, "[data-select]"));
    expect(
      root.querySelector<HTMLImageElement>(".editor-assets-preview")?.src,
    ).toContain("blob:coin");
    expect(
      root.querySelector<HTMLInputElement>(
        ".editor-assets-program-action input",
      )?.disabled,
    ).toBe(true);
    expect(root.querySelector("[data-program-cancel]")).toBeNull();
    click(required(root, "[data-program-begin]"));
    const program = required<HTMLInputElement>(root, "[data-program-name]");
    program.value = "coin";
    click(required(root, "[data-program-confirm]"));
    await flush();
    expect(controller.snapshot.project.programs).toEqual({ coin: "coin.png" });
    expect(root.textContent).toContain("程序 binding 已保存");

    const status = required<HTMLSelectElement>(root, "[data-assets-status]");
    status.value = "programmatic";
    status.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelectorAll(".editor-assets-row")).toHaveLength(1);
    status.value = "all";
    status.dispatchEvent(new Event("change", { bubbles: true }));
    required<HTMLInputElement>(root, "[data-program-name]").value = "";
    click(required(root, "[data-program-save]"));
    await flush();
    expect(controller.snapshot.project.programs).toEqual({ coin: "coin.png" });
    expect(root.textContent).toContain("程序键不能为空");

    const tree = required<HTMLElement>(root, ".editor-assets-tree");
    tree.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(root.querySelectorAll(".editor-assets-row")).toHaveLength(2);
    click(root.querySelectorAll<HTMLElement>("[data-select]")[1]!);
    expect(root.textContent).toContain("内部 leaf 只读");

    const search = required<HTMLInputElement>(root, "[data-assets-search]");
    search.value = "missing";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelectorAll(".editor-assets-row")).toHaveLength(0);
    search.value = "coin";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelectorAll(".editor-assets-row").length).toBeGreaterThan(
      0,
    );

    click(required(root, "[data-select]"));
    click(required(root, "[data-program-cancel]"));
    await flush();
    expect(controller.snapshot.project.programs).toEqual({});
    expect(root.textContent).toContain("程序 binding 已取消");
    click(required(root, "[data-root-delete]"));
    await flush();
    expect(controller.snapshot.catalog.roots.size).toBe(0);
    view.destroy();
    expect(createUrl).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith("blob:coin");
  });

  it("opens a non-invasive dialog, adjusts its splitter, exports, and destroys preview", async () => {
    const controller = createTestController();
    const prepared = await controller.prepareImport([source("coin.png", PNG)]);
    await controller.commitImport(prepared);
    const destroyPreview = vi.fn();
    const download = vi.fn();
    const root = document.createElement("div");
    document.body.append(root);
    const dialog = mountEditorAssetsDialog({
      controller,
      root,
      previewFactory: async ({ element }) => {
        element.textContent = "preview mounted";
        return { destroy: destroyPreview };
      },
      download,
    });

    expect(root.textContent).toContain("Assets 管理");
    expect(dialog.element.hasAttribute("open")).toBe(false);
    click(dialog.trigger);
    expect(dialog.element.hasAttribute("open")).toBe(true);
    click(required(root, "[data-select]"));
    await flush();
    expect(root.textContent).toContain("preview mounted");
    expect(root.textContent).not.toContain("SHA-256");

    const splitter = required<HTMLElement>(root, ".editor-assets-splitter");
    splitter.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(
      required<HTMLElement>(root, ".editor-assets-body").style.getPropertyValue(
        "--assets-tree-width",
      ),
    ).toBe("316px");

    click(required(root, "[data-root-export]"));
    await flush();
    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "coin.png", bytes: PNG }),
    );
    click(required(root, "[data-assets-dialog-close]"));
    await flush();
    expect(dialog.element.hasAttribute("open")).toBe(false);
    expect(destroyPreview).toHaveBeenCalledTimes(1);
    Object.defineProperty(dialog.element, "showModal", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(dialog.element, "close", {
      configurable: true,
      value: undefined,
    });
    dialog.open();
    expect(dialog.element.hasAttribute("open")).toBe(true);
    dialog.close();
    expect(dialog.element.hasAttribute("open")).toBe(false);
    dialog.destroy();
    expect(root.childElementCount).toBe(0);
    expect(() => dialog.open()).toThrow(/已销毁/u);
  });

  it("runs import prepare, review, commit, and cancel from the single file input", async () => {
    const controller = createTestController();
    const root = document.createElement("div");
    document.body.append(root);
    mountEditorAssetsView({ controller, root });
    const input = required<HTMLInputElement>(root, "[data-assets-input]");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [source("first.png", PNG)],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(
      root.querySelector("[data-assets-review]")?.hasAttribute("hidden"),
    ).toBe(false);
    click(required(root, "[data-review-commit]"));
    await flush();
    expect(controller.snapshot.catalog.roots.has("first.png")).toBe(true);

    Object.defineProperty(input, "files", {
      configurable: true,
      value: [source("second.png", PNG)],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    click(required(root, "[data-review-cancel]"));
    expect(controller.snapshot.catalog.roots.has("second.png")).toBe(false);
    expect(root.textContent).toContain("已取消导入");
  });
});

function loose(sourcePath: string, bytes: Uint8Array) {
  return {
    sourcePath,
    key: sourcePath,
    bytes,
    container: "file" as const,
    containerName: sourcePath,
  };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TEST_ZIP_LIMITS = Object.freeze({
  maxEntries: 1024,
  maxCompressedBytes: 20 * 1024 * 1024,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 40 * 1024 * 1024,
});

function source(name: string, bytes: Uint8Array) {
  return {
    name,
    size: bytes.byteLength,
    async arrayBuffer() {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return copy.buffer;
    },
  };
}

async function mappedEntries(
  inputs: readonly { key: string; mediaType: string; bytes: Uint8Array }[],
): Promise<Map<string, Uint8Array>> {
  const workspace = await createEditorAssetWorkspace(inputs);
  const map = createEditorAssetsMapFromWorkspace(workspace);
  return new Map([
    ...materializeEditorAssetPayloads(workspace),
    [EDITOR_ASSETS_MAP_PATH, serializeEditorAssetsMap(map)] as const,
  ]);
}

async function gameLayoutEventEntries(
  state: "win" | "appear",
  symbol = "A",
  renderMode: "standard" | "grid-cell" = "standard",
) {
  const packageManifest = {
    version: 1,
    kind: "symbol-package",
    id: "base",
    cellSize: { width: 1, height: 1 },
    entrypoints: {
      gameConfig: "base-gameconfig.json",
      symbolManifest: "base-symbols.manifest.json",
    },
    resources: ["base-symbol-state.png", "base-symbol.png"],
  };
  const symbolManifest = {
    version: 1,
    states: [state],
    symbols: {
      [symbol]: {
        normal: "./base-symbol.png",
        [state]: "./base-symbol-state.png",
        scale: 1,
      },
    },
  };
  const layoutManifest = upgradeSceneLayoutManifestToLatest({
    version: 1,
    kind: "scene-layout",
    id: "event-layout",
    adaptation: {
      mode: "maximized-focus",
      artSize: { width: 100, height: 100 },
      focusRect: { x: 0, y: 0, width: 100, height: 100 },
      backgroundNode: "bg",
    },
    nodes: [
      {
        id: "bg",
        order: 0,
        resource: {
          kind: "image",
          path: "event-bg.png",
          size: { width: 1, height: 1 },
        },
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
    ],
    reels: {
      main: {
        order: 1,
        columns: 3,
        rows: 2,
        cellSize: { width: 1, height: 1 },
        gap: { x: 0, y: 0 },
        placements: { default: { x: 0, y: 0 } },
      },
    },
    symbolPackages: {
      base: {
        manifest: "base-symbols.package.json",
        reel: "main",
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
    },
  });
  const entries = await mappedEntries([
    { key: "event-bg.png", mediaType: "image/png", bytes: PNG },
    {
      key: "base-symbols.package.json",
      mediaType: "application/json",
      bytes: encode(packageManifest),
    },
    {
      key: "base-gameconfig.json",
      mediaType: "application/json",
      bytes: encode({
        paytable: { "0": { code: 0, symbol, pays: [1] } },
        symbolCodes: { [symbol]: 0 },
        reels: { main: [[0], [0], [0]] },
      }),
    },
    {
      key: "base-symbols.manifest.json",
      mediaType: "application/json",
      bytes: encode(symbolManifest),
    },
    { key: "base-symbol.png", mediaType: "image/png", bytes: PNG },
    {
      key: "base-symbol-state.png",
      mediaType: "image/png",
      bytes: new Uint8Array([...PNG, state === "win" ? 1 : 2]),
    },
  ]);
  entries.set("layout.manifest.json", encode(layoutManifest));
  return entries;
}

function zipSources(
  containerName: string,
  entries: ReadonlyMap<string, Uint8Array>,
) {
  return [...entries].map(([sourcePath, bytes]) => ({
    sourcePath,
    key: sourcePath.replace(/^.*\//u, ""),
    bytes,
    container: "zip" as const,
    containerName,
  }));
}

function vniBundleEntries(): Map<string, Uint8Array> {
  const exports = [
    {
      id: "edit_full",
      purpose: "editing",
      assetScale: 1,
      path: "edit_full/project.json",
      label: "editing backup",
    },
    {
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
      path: "runtime_100/project.json",
      label: "100%",
    },
    {
      id: "runtime_50",
      purpose: "runtime",
      assetScale: 0.5,
      path: "runtime_50/project.json",
      label: "50%",
    },
  ];
  const editing = vniProject("edit_full", "editing");
  editing.stage.width = 0;
  return new Map([
    [
      "manifest.json",
      encode({ type: "vni_export_bundle", version: "VNI_0.087", exports }),
    ],
    ["edit_full/project.json", encode(editing)],
    ["edit_full/assets/spark.png", PNG],
    ["runtime_100/project.json", encode(vniProject("runtime_100", "runtime"))],
    ["runtime_100/assets/spark.png", PNG],
    ["runtime_50/project.json", encode(vniProject("runtime_50", "runtime"))],
    ["runtime_50/assets/spark.png", PNG],
  ]);
}

function vniProject(id: string, purpose: "editing" | "runtime") {
  return {
    schemaVersion: "VNI_0.087",
    editor: { name: "VNI", version: "VNI_0.087" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: "spark",
    stage: {
      width: 100,
      height: 100,
      coordinate: "center",
      duration: 1,
      backgroundColor: "#000000",
    },
    assets: [
      {
        id: "spark",
        type: "image",
        path: "assets/spark.png",
        originalName: "spark.png",
        width: 1,
        height: 1,
        fileWidth: 1,
        fileHeight: 1,
        fileScale: 1,
      },
    ],
    layerGroups: [
      {
        id: "group_default",
        name: "默认组",
        visible: true,
        collapsed: false,
        order: 0,
      },
    ],
    layers: [],
    particles: [],
    exportProfile: { id, purpose, assetScale: id === "runtime_50" ? 0.5 : 1 },
    maskCompositeMode: "precompose_light_alpha",
  };
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function atomicDraft(key: string): EditorAssetRootDraft {
  const rootId = `root:image:${key}`;
  return {
    key,
    kind: "image",
    nodeId: rootId,
    owner: `image:${key}`,
    exactKeys: [key],
    inputs: [],
    nodes: [
      { id: rootId, kind: "image", key, label: key, metadata: {} },
      { id: `file:${key}`, kind: "texture", key, label: key, metadata: {} },
    ],
    relations: [{ from: rootId, to: `file:${key}`, kind: "uses-payload" }],
  };
}

function createTestController() {
  const host: EditorAssetHostAdapter<{ programs: Record<string, string> }> = {
    cloneProject: structuredClone,
    collectReferences: () => [],
    collectProgramBindings: (project) =>
      Object.entries(project.programs).map(([name, rootKey]) => ({
        name,
        rootKey,
        location: `programs.${name}`,
      })),
    renameReferences: (project) => project,
    setProgramBinding: (project, rootKey, name) => ({
      programs: name ? { [name]: rootKey } : {},
    }),
  };
  return createDefaultEditorAssetsController({
    project: { programs: {} },
    host,
  });
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`test missing ${selector}`);
  return element;
}

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function pickEventChoice(
  root: ParentNode,
  value: string,
  action: "family" | "pick",
): void {
  const button = [
    ...root.querySelectorAll<HTMLButtonElement>(
      `[data-event-action="${action}"]`,
    ),
  ].find((candidate) => candidate.dataset.value === value);
  if (!button) throw new Error(`test missing event choice ${action}:${value}`);
  click(button);
}

function eventChoiceValues(
  root: ParentNode,
  action: "family" | "pick",
): string[] {
  return [
    ...root.querySelectorAll<HTMLButtonElement>(
      `[data-event-action="${action}"]`,
    ),
  ].map((button) => button.dataset.value ?? "");
}

function setEventSearch(root: ParentNode, query: string): HTMLInputElement {
  const input = required<HTMLInputElement>(root, "[data-event-search]");
  input.focus();
  input.value = query;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return required<HTMLInputElement>(root, "[data-event-search]");
}

function expectZipHas(bytes: Uint8Array, paths: readonly string[]): void {
  const files = extractBoundedZip(bytes, { limits: TEST_ZIP_LIMITS });
  for (const path of paths) expect(files.has(path), path).toBe(true);
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

interface SpinSelection {
  readonly spin: "reel-spin" | "grid-cell" | "cell-spin";
  readonly scope: "axis" | "cell" | "column" | "row" | "all";
  readonly coordinates: readonly string[];
}

function spinSelection(
  spin: SpinSelection["spin"],
  scope: SpinSelection["scope"],
  coordinates: readonly string[] = [],
): SpinSelection {
  return { spin, scope, coordinates };
}

async function inspectSpinEventCatalog(
  renderMode: "standard" | "grid-cell",
): Promise<EditorGameLayoutEventCatalog> {
  const controller = createTestController();
  try {
    const preparation = await controller.prepareImport([
      source(
        `${renderMode}-event-layout.zip`,
        createDeterministicZip(
          await gameLayoutEventEntries("win", "A", renderMode),
        ),
      ),
    ]);
    expect(preparation.blockingErrors).toEqual([]);
    await controller.commitImport(preparation);
    return inspectEditorGameLayoutEventCatalog(
      controller.snapshot,
      "event-layout-layout.manifest.json",
    );
  } finally {
    controller.destroy();
  }
}

async function expectSpinSearchProjection(
  catalog: EditorGameLayoutEventCatalog,
  options: {
    readonly query: string;
    readonly spin: SpinSelection["spin"];
    readonly scopes: readonly SpinSelection["scope"][];
    readonly label: string;
  },
): Promise<void> {
  const root = document.createElement("div");
  document.body.append(root);
  const dialog = mountEditorGameLayoutEventDialog({
    root,
    sources: [{ key: catalog.rootKey, label: "Spin Layout" }],
    value: { rootKey: catalog.rootKey, events: [] },
    inspectCatalog: () => catalog,
    onConfirm() {},
  });
  try {
    dialog.open();
    await flush();
    click(required(root, '[data-event-action="add"]'));
    setEventSearch(root, options.query);
    expect(eventChoiceValues(root, "family")).toEqual(["spin-lifecycle"]);
    pickEventChoice(root, "spin-lifecycle", "family");
    pickEventChoice(root, "main", "pick");
    expect(eventChoiceValues(root, "pick")).toContain(options.spin);
    pickEventChoice(root, options.spin, "pick");
    expect(eventChoiceValues(root, "pick")).toEqual(options.scopes);
    expect(root.textContent).toContain(options.label);
  } finally {
    dialog.destroy();
  }
}

async function expectSpinSelections(
  catalog: EditorGameLayoutEventCatalog,
  selections: readonly SpinSelection[],
): Promise<void> {
  const root = document.createElement("div");
  document.body.append(root);
  const confirmation: { value: EditorGameLayoutEventGroup | null } = {
    value: null,
  };
  const dialog = mountEditorGameLayoutEventDialog({
    root,
    sources: [{ key: catalog.rootKey, label: "Spin Layout" }],
    value: { rootKey: catalog.rootKey, events: [] },
    inspectCatalog: () => catalog,
    onConfirm(value) {
      confirmation.value = value;
    },
  });
  const expectedAddresses: string[] = [];
  try {
    dialog.open();
    await flush();
    for (const selection of selections) {
      for (const lifecycle of ["started", "stopped"] as const) {
        const values = [
          "main",
          selection.spin,
          selection.scope,
          ...selection.coordinates,
          lifecycle,
        ];
        const expected = catalog.entries.find(
          (entry) =>
            entry.family === "spin-lifecycle" &&
            entry.facets.map(({ value }) => value).join("\u0000") ===
              values.join("\u0000"),
        );
        if (!expected)
          throw new Error(`missing Spin catalog entry: ${values.join("/")}`);
        expectedAddresses.push(expected.descriptor.address);
        click(required(root, '[data-event-action="add"]'));
        pickEventChoice(root, "spin-lifecycle", "family");
        for (const value of values) pickEventChoice(root, value, "pick");
        expect(root.textContent).toContain(expected.descriptor.address);
        expect(root.textContent).toContain(spinScopeLabel(selection));
        if (selection.scope === "axis")
          expect(
            [
              ...root.querySelectorAll<HTMLElement>(".editor-event-result dt"),
            ].map((element) => element.textContent),
          ).toContain("轴");
        expect(root.textContent).toContain(
          lifecycle === "started" ? "开始（started）" : "停止（stopped）",
        );
        click(required(root, '[data-event-action="save-row"]'));
        expect(root.textContent).toContain(expected.descriptor.address);
        expect(root.textContent).toContain(spinScopeLabel(selection));
      }
    }
    click(required(root, "[data-event-confirm]"));
    await flush();
    expect(confirmation.value?.events.map(({ address }) => address)).toEqual(
      expectedAddresses,
    );
  } finally {
    dialog.destroy();
  }
}

function spinScopeLabel(selection: SpinSelection): string {
  if (selection.scope === "axis") return "具体轴";
  if (selection.scope === "cell") return "具体格";
  if (selection.scope === "column") return "整列（y=* 通配符）";
  if (selection.scope === "row") return "整行（x=* 通配符）";
  return selection.spin === "reel-spin"
    ? "全部轴（x=* 通配符）"
    : "全部格（x=*, y=* 通配符）";
}
