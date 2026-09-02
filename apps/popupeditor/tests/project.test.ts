import {
  createEditorAssetEntry,
  decodeEditorAssetsMap,
} from "@slotclientengine/editorresource";
import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import { describe, expect, it } from "vitest";
import type { PopupOverlayLayer } from "@slotclientengine/rendercore/popup/editor";
import {
  exportPopupZip,
  getPopupLegacyAudioMigration,
  importPopupZip,
} from "../src/io/popup-zip.js";
import {
  commitImportReview,
  discoverPopupResources,
  POPUP_ZIP_LIMITS,
  reviewPopupImportTransaction,
} from "../src/io/resource-import.js";
import {
  addLayer,
  addSingleStateLayer,
  addSingleStateTextLayer,
  addAwardTextLayer,
  applyImportedResourceBindings,
  assertPopupLayerCanDelete,
  assertPopupSpineOverlayCanDelete,
  createPopupAmountFormat,
  createPopupEditorProject,
  detectPopupAmountFormatPreset,
  getPopupVniTextLayerTargets,
  getPopupSpineAttachmentTargets,
  migratePopupPromptToTextLayer,
  migratePopupEditorVisibility,
  popupEditorProjectDiagnostics,
  projectToManifest,
  projectToPopupObjectManifest,
  removePopupResource,
  renameSingleStateLayer,
  reuseAwardLayerInTier,
  resourceReferenceCount,
  validatePopupEditorAttachments,
} from "../src/model/project.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("popup editor filename-key project", () => {
  it("strictly imports then removes legacy Popup audio and its payload", async () => {
    const project = createPopupEditorProject({ type: "spine" });
    const spineAssets = await Promise.all([
      createEditorAssetEntry({
        key: "popup.json",
        bytes: new TextEncoder().encode(
          JSON.stringify({
            skeleton: { spine: "4.3.23" },
            bones: [{ name: "root" }],
            slots: [],
            skins: [{ name: "default", attachments: {} }],
            animations: { Start: {}, Loop: {}, End: {} },
          }),
        ),
        mediaType: "application/json",
      }),
      createEditorAssetEntry({
        key: "popup.atlas",
        bytes: new TextEncoder().encode(
          "popup.png\nsize:1,1\nfilter:Linear,Linear\n",
        ),
        mediaType: "text/plain",
      }),
      createEditorAssetEntry({
        key: "popup.png",
        bytes: png(1, 1),
        mediaType: "image/png",
      }),
    ]);
    for (const entry of spineAssets) project.assets.set(entry.key, entry);
    project.resources.set("popup.json", {
      rootKey: "popup.json",
      kind: "spine",
      spec: {
        kind: "spine",
        skeleton: "popup.json",
        atlas: "popup.atlas",
        textures: { "popup.png": "popup.png" },
      },
      keys: ["popup.json", "popup.atlas", "popup.png"],
    });
    project.spine.resource = "popup.json";
    project.spine.playback = {
      startAnimation: "Start",
      loopAnimation: "Loop",
      endAnimation: "End",
    };
    const exported = await exportPopupZip(project, { prepare: false });
    const entries = new Map(
      extractBoundedZip(exported.bytes, { limits: POPUP_ZIP_LIMITS }),
    );
    const audio = await createEditorAssetEntry({
      key: "coin.wav",
      bytes: new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
      ]),
      mediaType: "audio/wav",
    });
    const map = structuredClone(
      decodeEditorAssetsMap(entries.get("assets.map.json")!),
    ) as any;
    map.files[audio.key] = {
      path: audio.payloadPath,
      sha256: audio.sha256,
      mediaType: audio.mediaType,
      byteLength: audio.byteLength,
    };
    entries.set(
      "assets.map.json",
      new TextEncoder().encode(`${JSON.stringify(map)}\n`),
    );
    entries.set(audio.payloadPath, audio.bytes);
    const manifest = JSON.parse(
      new TextDecoder().decode(entries.get("popup.manifest.json")),
    );
    manifest.audio = {
      version: 1,
      effects: [
        {
          name: "coin",
          asset: {
            sources: [{ path: "coin.wav", mediaType: "audio/wav" }],
          },
          playback: "once",
          offsetSeconds: 0,
          voices: { maxConcurrent: 4, overflow: "restart-oldest" },
          bgm: { kind: "keep" },
        },
      ],
      cues: [
        {
          effect: "coin",
          target: { kind: "segment", segment: "start" },
        },
      ],
    };
    entries.set(
      "popup.manifest.json",
      new TextEncoder().encode(`${JSON.stringify(manifest)}\n`),
    );

    const imported = await importPopupZip(createDeterministicZip(entries), {
      prepare: false,
    });
    expect(getPopupLegacyAudioMigration(imported)).toEqual({
      effects: 1,
      cues: 1,
      assets: 1,
    });
    expect(imported.assets.has("coin.wav")).toBe(false);
    expect(projectToManifest(imported)).toMatchObject({
      version: 9,
      audio: {
        version: 1,
        effects: [],
        cues: [],
      },
    });
  });

  it("authors an unconstrained single-state project with exact runtime names", () => {
    const project = createPopupEditorProject({ type: "single-state" });
    expect(project.backdrop.visibleStates).toEqual(["active"]);
    expect(projectToManifest(project)).toMatchObject({
      version: 9,
      type: "single-state",
      singleState: { layers: [] },
    });
    addSingleStateTextLayer(project);
    expect(project.singleState.layers[0]).toMatchObject({
      kind: "text",
      style: { widthRange: { minWidth: 0, maxWidth: 0 } },
    });
    renameSingleStateLayer(project, "text-0", "headline");
    project.resources.set("hero", {
      rootKey: "hero",
      kind: "image",
      spec: {
        kind: "image",
        path: "hero.png",
        size: { width: 100, height: 50 },
      },
      keys: ["hero.png"],
    });
    addSingleStateLayer(project, "hero");
    const manifest = projectToManifest(project);
    if (manifest.type !== "single-state")
      throw new Error("Expected single-state popup.");
    expect(manifest.singleState.layers.map(({ id }) => id)).toEqual([
      "headline",
      "image-0",
    ]);
    expect(manifest).not.toHaveProperty("awardCelebration");
    expect(manifest).not.toHaveProperty("spine");
  });

  it("round-trips a name-only Popup Object and imports it as a namespaced resource", async () => {
    const project = createPopupEditorProject({
      type: "popup-object",
      name: "tap-to-continue",
    });
    const image = await createEditorAssetEntry({
      key: "prompt.png",
      bytes: png(1, 1),
      mediaType: "image/png",
    });
    project.assets.set(image.key, image);
    project.resources.set(image.key, {
      rootKey: image.key,
      kind: "image",
      spec: {
        kind: "image",
        path: image.key,
        size: { width: 1, height: 1 },
      },
      keys: [image.key],
    });
    addSingleStateLayer(project, image.key);
    const manifest = projectToPopupObjectManifest(project);
    expect(manifest).toMatchObject({
      version: 1,
      kind: "popup-object",
      name: "tap-to-continue",
    });
    expect(manifest).not.toHaveProperty("adaptation");
    expect(manifest).not.toHaveProperty("backdrop");

    const exported = await exportPopupZip(project, { prepare: false });
    expect(exported.fileName).toBe("tap-to-continue-popup-object.zip");
    const imported = await importPopupZip(exported.bytes, { prepare: false });
    expect(projectToPopupObjectManifest(imported)).toEqual(manifest);

    const review = await discoverPopupResources([
      new File([exported.bytes.slice().buffer], exported.fileName),
    ]);
    expect(review[0]).toMatchObject({
      rootKey: "tap-to-continue-popup-object.manifest.json",
      kind: "popup-object",
    });
    expect(review[0]!.exactKeys).toContain(
      "tap-to-continue-popup-object.manifest.json",
    );
    expect(review[0]!.exactKeys).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^tap-to-continue-[0-9a-f]{64}-prompt\.png$/u),
      ]),
    );
  });

  it("keeps two versions of one Popup Object as complete owner candidates", async () => {
    const objectZip = async (seed: number) => {
      const object = createPopupEditorProject({
        type: "popup-object",
        name: "tap-to-continue",
      });
      const imageBytes = png(1, 1);
      imageBytes[12] = seed;
      const image = await createEditorAssetEntry({
        key: "prompt.png",
        bytes: imageBytes,
        mediaType: "image/png",
      });
      object.assets.set(image.key, image);
      object.resources.set(image.key, {
        rootKey: image.key,
        kind: "image",
        spec: {
          kind: "image",
          path: image.key,
          size: { width: 1, height: 1 },
        },
        keys: [image.key],
      });
      addSingleStateLayer(object, image.key);
      return exportPopupZip(object, { prepare: false });
    };
    const host = createPopupEditorProject({ type: "single-state" });
    const firstZip = await objectZip(1);
    const first = await discoverPopupResources([
      new File([firstZip.bytes.slice().buffer], firstZip.fileName),
    ]);
    await commitImportReview(host, first);
    addSingleStateLayer(host, first[0]!.rootKey);

    const secondZip = await objectZip(2);
    const second = await discoverPopupResources([
      new File([secondZip.bytes.slice().buffer], secondZip.fileName),
    ]);
    const review = await reviewPopupImportTransaction(host, second);
    const conflictIndex = review.assets.items.findIndex(
      ({ action }) => action === "overwrite",
    );
    expect(conflictIndex).toBeGreaterThanOrEqual(0);
    expect(
      review.assets.items.filter(({ action }) => action === "overwrite"),
    ).toHaveLength(1);
    await commitImportReview(host, second, [
      { itemIndex: conflictIndex, resolution: "keep-both" },
    ]);
    const keptRoot = [...host.resources.keys()].find((key) =>
      key.endsWith("popup-object.manifest-1.json"),
    );
    expect(keptRoot).toBeDefined();
    addSingleStateLayer(host, keptRoot!);
    await expect(
      exportPopupZip(host, { prepare: false }),
    ).resolves.toMatchObject({ fileName: "untitled-popup-popup.zip" });
  });
  it("uses project-specific states for new layers and legacy migration", () => {
    const award = createPopupEditorProject();
    expect(award.backdrop.visibleStates).toEqual([
      "base",
      "standard",
      "bigwin",
      "superwin",
      "megawin",
    ]);
    const legacyLayer = {
      id: "legacy",
      kind: "image",
      resource: "image",
      order: 1,
      alpha: 1,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      anchor: { x: 0.5, y: 0.5 },
      visibleSegments: ["start", "end"],
    } as any;
    award.tiers.get("base")!.layers.push(legacyLayer);
    migratePopupEditorVisibility(award);
    expect(legacyLayer.visibleStates).toBeUndefined();
    expect(legacyLayer).not.toHaveProperty("visibleSegments");

    const spine = createPopupEditorProject({ type: "spine" });
    expect(spine.backdrop.visibleStates).toEqual(["start", "loop", "end"]);
  });

  it("exports a standalone Spine popup without award fields", () => {
    const project = createPopupEditorProject({ type: "spine" });
    const hash = "a".repeat(64);
    project.id = "free-game";
    project.resources.set("effect", {
      rootKey: "effect",
      kind: "spine",
      spec: {
        kind: "spine",
        skeleton: `assets/${hash}.json`,
        atlas: `assets/${hash}.atlas`,
        textures: { "effect.png": `assets/${hash}.png` },
      },
      keys: [
        `assets/${hash}.json`,
        `assets/${hash}.atlas`,
        `assets/${hash}.png`,
      ],
    });
    project.spine.resource = "effect";
    project.spine.playback = {
      startAnimation: "start",
      loopAnimation: "loop",
      endAnimation: "end",
    };
    project.spine.prompt.enabled = true;
    expect(() => projectToManifest(project)).toThrow(/不能导出 legacy prompt/);
    expect(migratePopupPromptToTextLayer(project)).toBe(true);
    const manifest = projectToManifest(project);
    expect(manifest.type).toBe("spine");
    if (manifest.type !== "spine") throw new Error("Expected spine popup.");
    expect(manifest.spine.resource).toBe("effect");
    expect(manifest.spine.prompt).toBeUndefined();
    expect(manifest.spine.overlays).toContainEqual(
      expect.objectContaining({
        id: "prompt",
        kind: "text",
        name: "prompt",
        visibleStates: ["start", "loop"],
      }),
    );
    expect(Object.keys(manifest.resources)).toEqual(["effect"]);
    expect("awardCelebration" in manifest).toBe(false);
    expect("amountFormat" in manifest).toBe(false);
  });

  it("rejects legacy prompt migration collisions without mutating the draft", () => {
    const project = createPopupEditorProject({ type: "spine" });
    project.spine.prompt.enabled = true;
    project.spine.overlays.push({
      id: "existing",
      kind: "text",
      name: "prompt",
      defaultText: "EXISTING",
      order: 1,
      alpha: 1,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fontSize: 72,
        letterSpacing: 0,
        fill: { kind: "solid", color: "#ffffff" },
        arcDegrees: 0,
      },
      visibleSegments: ["start", "loop", "end"],
    });
    const before = structuredClone(project.spine);
    expect(() => migratePopupPromptToTextLayer(project)).toThrow(
      /id\/name=prompt/,
    );
    expect(project.spine).toEqual(before);
  });

  it("automatically migrates v1 and v2 system-font prompts to canonical v6", async () => {
    const skeleton = JSON.stringify({
      skeleton: { spine: "4.3.23" },
      bones: [{ name: "root" }],
      slots: [{ name: "Value", bone: "root" }],
      skins: [{ name: "default", attachments: {} }],
      animations: { Start: {}, Loop: {}, End: {} },
    });
    const review = await discoverPopupResources([
      new File([skeleton], "Spine.json"),
      new File(["Spine.png\nsize:1,1\nfilter:Linear,Linear\n"], "Spine.atlas"),
      new File([png(1, 1).buffer], "Spine.png"),
    ]);
    const project = createPopupEditorProject({ type: "spine" });
    project.id = "free-game";
    await commitImportReview(project, review);
    project.spine.resource = "Spine.json";
    project.spine.playback = {
      startAnimation: "Start",
      loopAnimation: "Loop",
      endAnimation: "End",
    };
    project.spine.tapInfoAttachment = {
      kind: "spine-slot",
      target: { kind: "main-spine" },
      slot: "Value",
    };
    expect(
      getPopupSpineAttachmentTargets(project, { kind: "spine-popup" }),
    ).toMatchObject([{ key: "main-spine", slotNames: ["Value"] }]);
    const exported = await exportPopupZip(project, { prepare: false });
    const reopened = await importPopupZip(exported.bytes, { prepare: false });
    expect(reopened.spine.tapInfoAttachment).toEqual(
      project.spine.tapInfoAttachment,
    );
    const reopenedManifest = projectToManifest(reopened);
    if (reopenedManifest.type !== "spine" || reopenedManifest.version !== 9)
      throw new Error("Expected v9 Spine popup project.");
    expect(reopenedManifest.spine.tapInfoObject?.attachment).toEqual(
      project.spine.tapInfoAttachment,
    );
    expect(reopenedManifest.resources).toEqual(
      projectToManifest(project).resources,
    );
    const reexported = await exportPopupZip(reopened, { prepare: false });
    const reexportedEntries = extractBoundedZip(reexported.bytes, {
      limits: POPUP_ZIP_LIMITS,
    });
    const reexportedManifest = JSON.parse(
      new TextDecoder().decode(reexportedEntries.get("popup.manifest.json")),
    );
    expect(reexportedManifest.spine.tapInfoObject?.attachment).toEqual(
      project.spine.tapInfoAttachment,
    );
    const entries = extractBoundedZip(exported.bytes, {
      limits: POPUP_ZIP_LIMITS,
    });
    const manifest = JSON.parse(
      new TextDecoder().decode(entries.get("popup.manifest.json")),
    );
    expect(manifest.spine.tapInfoObject).toEqual({
      attachment: {
        kind: "spine-slot",
        target: { kind: "main-spine" },
        slot: "Value",
      },
    });
    manifest.version = 1;
    delete manifest.spine.tapInfoObject;
    delete manifest.audio;
    manifest.designViewport = { width: 1080, height: 1920 };
    delete manifest.name;
    delete manifest.adaptation;
    delete manifest.backdrop;
    for (const overlay of manifest.spine.overlays ?? []) {
      overlay.visibleSegments = overlay.visibleStates;
      delete overlay.visibleStates;
      delete overlay.attachment;
    }
    manifest.spine.prompt = {
      defaultText: "Press any key to continue",
      fill: "#ffffff",
      order: 100,
      area: { x: 0, y: 500, width: 800, height: 80 },
    };
    entries.set(
      "popup.manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    );
    expect(manifest.spine.prompt).not.toHaveProperty("font");
    expect(Object.values(manifest.resources)).not.toContainEqual(
      expect.objectContaining({ kind: "font" }),
    );
    expect(
      [...entries.keys()].some((path) => /\.(?:woff2?|ttf|otf)$/u.test(path)),
    ).toBe(false);

    const imported = await importPopupZip(createDeterministicZip(entries), {
      prepare: false,
    });
    expect(imported.formatVersion).toBe(9);
    expect(imported.spine.prompt.font).toBeNull();
    expect(imported.spine.prompt.enabled).toBe(false);
    expect(imported.spine.tapInfoAttachment).toBeNull();
    expect(imported.spine.overlays).toContainEqual(
      expect.objectContaining({ id: "prompt", kind: "text", name: "prompt" }),
    );
    expect(projectToManifest(imported)).toMatchObject({ version: 9 });
    expect(projectToManifest(imported)).not.toHaveProperty("designViewport");

    manifest.version = 2;
    delete manifest.audio;
    manifest.name = "Task 190 Legacy Prompt";
    manifest.adaptation = {
      mode: "maximized-focus",
      focus: { left: 540, right: 540, top: 960, bottom: 960 },
    };
    manifest.backdrop = { enabled: true, color: "#000000", alpha: 0.5 };
    entries.set(
      "popup.manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    );
    const importedLegacyV2 = await importPopupZip(
      createDeterministicZip(entries),
      { prepare: false },
    );
    expect(importedLegacyV2.spine.prompt.enabled).toBe(false);
    expect(importedLegacyV2.spine.overlays).toContainEqual(
      expect.objectContaining({ id: "prompt", kind: "text", name: "prompt" }),
    );
    const canonicalV9 = projectToManifest(importedLegacyV2);
    expect(canonicalV9.version).toBe(9);
    expect(canonicalV9).not.toHaveProperty("designViewport");
    if (canonicalV9.type !== "spine") throw new Error("Expected spine popup.");
    expect(canonicalV9.spine).not.toHaveProperty("prompt");
    expect(canonicalV9.spine.overlays?.[0]).toMatchObject({
      attachment: { kind: "popup-root" },
      visibleStates: ["start", "loop"],
      style: { widthRange: { minWidth: 0, maxWidth: 0 } },
    });
  });

  it("rejects cyclic Spine layer attachments and protects referenced targets", () => {
    const project = createPopupEditorProject({ type: "spine" });
    const spine = (id: string, order: number): PopupOverlayLayer => ({
      id,
      kind: "spine",
      resource: "effect",
      order,
      alpha: 1,
      attachment: { kind: "popup-root" },
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      playback: {
        mode: "segmented-animations",
        startAnimation: "Start",
        loopAnimation: "Loop",
        endAnimation: "End",
      },
    });
    const a = spine("a", 1);
    const b = spine("b", 2);
    (b as { attachment: PopupOverlayLayer["attachment"] }).attachment = {
      kind: "spine-slot",
      target: { kind: "layer", layerId: "a" },
      slot: "Value",
    };
    project.spine.overlays = [a, b];
    expect(() =>
      assertPopupLayerCanDelete(project.spine.overlays, "a"),
    ).toThrow(/b/);
    (a as { attachment: PopupOverlayLayer["attachment"] }).attachment = {
      kind: "spine-slot",
      target: { kind: "layer", layerId: "b" },
      slot: "Value",
    };
    expect(() => validatePopupEditorAttachments(project)).toThrow(
      /a -> b -> a/,
    );

    const vniParent = {
      id: "copy-effect",
      kind: "vni",
      resource: "copy-effect",
      order: 1,
      alpha: 1,
      attachment: { kind: "popup-root" },
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    } as const;
    const amountChild = {
      id: "counter",
      kind: "image-string",
      resource: "counter",
      defaultText: "0",
      order: 2,
      alpha: 1,
      attachment: {
        kind: "vni-text-layer",
        vniLayerId: "copy-effect",
        textLayerId: "counter-slot",
      },
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      anchor: { x: 0.5, y: 0.5 },
    } as const;
    expect(() =>
      assertPopupLayerCanDelete([vniParent, amountChild], "copy-effect"),
    ).toThrow(/counter/);
  });

  it("keeps the five-tier amount contract", () => {
    const project = createPopupEditorProject();
    expect([...project.tiers.keys()]).toEqual([
      "base",
      "standard",
      "bigwin",
      "superwin",
      "megawin",
    ]);
    expect(
      ["bigwin", "superwin", "megawin"].map(
        (id) => project.tiers.get(id as "bigwin")!.thresholdMultiplier,
      ),
    ).toEqual([15, 25, 50]);
    expect(detectPopupAmountFormatPreset(project.amountFormat)).toBe("integer");
    const decimal = createPopupAmountFormat("decimal");
    expect(detectPopupAmountFormatPreset(decimal)).toBe("decimal");
    expect(detectPopupAmountFormatPreset({ ...decimal, prefix: "$" })).toBe(
      "custom",
    );
    expect(() => projectToManifest(project)).toThrow(
      /layers must be non-empty/,
    );
    expect(popupEditorProjectDiagnostics(project)).toEqual([
      "项目尚未完成：base、standard、bigwin、superwin、megawin 档位尚未添加图层。资源导入已独立保存；请在“档位”页显式绑定资源。",
    ]);
  });

  it("reuses an explicit stable award layer id with state-local config", () => {
    const project = createPopupEditorProject();
    addAwardTextLayer(project, "base");
    const base = project.tiers.get("base")!.layers[0]!;
    reuseAwardLayerInTier(project, "standard", base.id);
    const standard = project.tiers.get("standard")!.layers[0]!;
    expect(standard.id).toBe(base.id);
    expect(standard).not.toBe(base);
    (standard.transform as { x: number }).x = 120;
    expect(base.transform.x).toBe(0);
    expect(standard).not.toHaveProperty("visibleStates");
  });

  it("imports ImgNumber through the common review and exports deterministic mapped ZIPs", async () => {
    const review = await discoverPopupResources([
      new File([imageStringZip().slice().buffer], "amount.zip"),
    ]);
    expect(review[0]).toMatchObject({
      rootKey: "image-string.manifest.json",
      kind: "image-string",
      dependencyCount: 10,
    });
    expect(review[0]!.exactKeys).toEqual([
      "g0.png",
      "g1.png",
      "g2.png",
      "g3.png",
      "g4.png",
      "g5.png",
      "g6.png",
      "g7.png",
      "g8.png",
      "g9.png",
      "image-string.manifest.json",
    ]);
    const project = createPopupEditorProject();
    await commitImportReview(project, review);
    applyImportedResourceBindings(project, review[0]!.rootKey);
    expect(resourceReferenceCount(project, review[0]!.rootKey)).toBe(5);
    addLayer(project, "base", review[0]!.rootKey);
    expect(project.tiers.get("base")!.layers).toHaveLength(2);
    expect(project.tiers.get("base")!.layers[1]).toMatchObject({
      name: "imgnumber-1",
      binding: "manual",
      defaultText: "0",
      parent: { kind: "popup-root" },
    });

    const first = await exportPopupZip(project, { prepare: false });
    const second = await exportPopupZip(project, { prepare: false });
    expect(first.bytes).toEqual(second.bytes);
    const entries = extractBoundedZip(first.bytes, {
      limits: POPUP_ZIP_LIMITS,
    });
    expect(entries.has("assets.map.json")).toBe(true);
    expect([...entries.keys()].some((path) => path.startsWith("assets/"))).toBe(
      true,
    );
    expect(
      [...entries.keys()].some((path) => path.startsWith("dependencies/")),
    ).toBe(false);
    const imported = await importPopupZip(first.bytes, { prepare: false });
    expect(projectToManifest(imported)).toEqual(projectToManifest(project));
    expect([...imported.assets.keys()].sort()).toEqual(
      [...project.assets.keys()].sort(),
    );
  });

  it("overwrites same-name bytes after an explicit decision and garbage-collects an unbound resource", async () => {
    const project = createPopupEditorProject();
    const first = await discoverPopupResources([
      new File([png(2, 3).buffer], "BG.PNG"),
    ]);
    await commitImportReview(project, first);
    expect(project.resources.get("BG.PNG")!.spec).toMatchObject({
      kind: "image",
      size: { width: 2, height: 3 },
    });
    const replacement = await discoverPopupResources([
      new File([png(4, 5).buffer], "BG.PNG"),
    ]);
    const transaction = await commitImportReview(project, replacement, [
      { itemIndex: 0, resolution: "overwrite" },
    ]);
    expect(transaction.assets.items[0]).toMatchObject({
      targetKey: "BG.PNG",
      action: "overwrite",
    });
    expect(project.resources.get("BG.PNG")!.spec).toMatchObject({
      kind: "image",
      size: { width: 4, height: 5 },
    });
    expect(project.assets.size).toBe(1);
    removePopupResource(project, "BG.PNG");
    expect(project.resources.size).toBe(0);
    expect(project.assets.size).toBe(0);
  });

  it("keeps both same-name resources only after an explicit decision", async () => {
    const project = createPopupEditorProject();
    await commitImportReview(
      project,
      await discoverPopupResources([new File([png(2, 3).buffer], "BG.PNG")]),
    );
    const replacement = await discoverPopupResources([
      new File([png(4, 5).buffer], "BG.PNG"),
    ]);
    await expect(commitImportReview(project, replacement)).rejects.toThrow(
      /冲突尚未解决/,
    );
    const transaction = await commitImportReview(project, replacement, [
      { itemIndex: 0, resolution: "keep-both" },
    ]);
    const renamed = transaction.assets.items[0]!.targetKey;
    expect(renamed).not.toBe("BG.PNG");
    expect(project.resources.get(renamed)).toMatchObject({
      rootKey: renamed,
      spec: { kind: "image", path: renamed, size: { width: 4, height: 5 } },
    });
    expect(project.resources.has("BG.PNG")).toBe(true);
  });

  it("imports multiple Spine skeleton roots that share one atlas and texture", async () => {
    const skeleton = (name: string) =>
      JSON.stringify({
        skeleton: { spine: "4.3.23", name },
        bones: [{ name: "root" }],
        slots: [],
        skins: [{ name: "default", attachments: {} }],
        animations: { Start: {}, Loop: {}, End: {} },
      });
    const review = await discoverPopupResources([
      new File([skeleton("free")], "FreeGames.json"),
      new File([skeleton("bonus")], "BonusGame.json"),
      new File(
        ["Pop_ups.png\nsize:1,1\nfilter:Linear,Linear\n"],
        "Pop_ups.atlas",
      ),
      new File([png(1, 1).buffer], "Pop_ups.png"),
    ]);
    const spine = review.filter((candidate) => candidate.kind === "spine");
    expect(spine.map(({ rootKey }) => rootKey).sort()).toEqual([
      "BonusGame.json",
      "FreeGames.json",
    ]);
    expect(
      spine.every(
        (candidate) =>
          candidate.exactKeys.includes("Pop_ups.atlas") &&
          candidate.exactKeys.includes("Pop_ups.png"),
      ),
    ).toBe(true);
    const project = createPopupEditorProject();
    await commitImportReview(project, spine);
    expect(project.resources.get("FreeGames.json")?.spec).toMatchObject({
      kind: "spine",
      atlas: "Pop_ups.atlas",
      textures: { "Pop_ups.png": "Pop_ups.png" },
    });
    expect(project.resources.get("BonusGame.json")?.spec).toMatchObject({
      kind: "spine",
      atlas: "Pop_ups.atlas",
      textures: { "Pop_ups.png": "Pop_ups.png" },
    });
  });

  it("rolls back a Spine overwrite that removes an attached exact slot", async () => {
    const skeleton = (slots: readonly string[]) =>
      JSON.stringify({
        skeleton: { spine: "4.3.23" },
        bones: [{ name: "root" }],
        slots: slots.map((name) => ({ name, bone: "root" })),
        skins: [{ name: "default", attachments: {} }],
        animations: { Start: {}, Loop: {}, End: {} },
      });
    const files = (slots: readonly string[]) => [
      new File([skeleton(slots)], "Popup.json"),
      new File(["Popup.png\nsize:1,1\nfilter:Linear,Linear\n"], "Popup.atlas"),
      new File([png(1, 1).buffer], "Popup.png"),
    ];
    const project = createPopupEditorProject({ type: "spine" });
    await commitImportReview(
      project,
      await discoverPopupResources(files(["Value"])),
    );
    project.spine.resource = "Popup.json";
    project.spine.overlays.push({
      id: "amount-background",
      kind: "text",
      name: "amount-background",
      defaultText: "BG",
      order: 1,
      alpha: 1,
      attachment: {
        kind: "spine-slot",
        target: { kind: "main-spine" },
        slot: "Value",
      },
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fontSize: 32,
        letterSpacing: 0,
        fill: { kind: "solid", color: "#ffffff" },
        arcDegrees: 0,
      },
      visibleSegments: ["start", "loop", "end"],
    });
    const before = project.assets.get("Popup.json")!.bytes.slice();
    const replacement = await discoverPopupResources(files([]));
    const review = await reviewPopupImportTransaction(project, replacement);
    const skeletonIndex = review.assets.items.findIndex(
      ({ incoming }) => incoming.key === "Popup.json",
    );
    await expect(
      commitImportReview(project, replacement, [
        { itemIndex: skeletonIndex, resolution: "overwrite" },
      ]),
    ).rejects.toThrow(/main-spine\/Value/);
    expect(project.assets.get("Popup.json")!.bytes).toEqual(before);
    expect(project.spine.overlays[0]!.attachment).toMatchObject({
      kind: "spine-slot",
      slot: "Value",
    });
  });

  it("builds every layer kind and rejects unsafe resource operations", () => {
    const project = createPopupEditorProject();
    project.resources.set("amount.json", {
      rootKey: "amount.json",
      kind: "image-string",
      spec: { kind: "image-string", manifest: "amount.json" },
      keys: ["amount.json"],
    });
    project.resources.set("BG.PNG", {
      rootKey: "BG.PNG",
      kind: "image",
      spec: {
        kind: "image",
        path: "BG.PNG",
        size: { width: 10, height: 20 },
      },
      keys: ["BG.PNG"],
    });
    project.resources.set("effect.json", {
      rootKey: "effect.json",
      kind: "vni",
      spec: { kind: "vni", project: "effect.json" },
      keys: ["effect.json"],
    });
    project.resources.set("Spine.json", {
      rootKey: "Spine.json",
      kind: "spine",
      spec: {
        kind: "spine",
        skeleton: "Spine.json",
        atlas: "Spine.atlas",
        textures: { "Spine.png": "Spine.png" },
      },
      keys: ["Spine.json", "Spine.atlas", "Spine.png"],
    });
    project.resources.set("Title.woff2", {
      rootKey: "Title.woff2",
      kind: "font",
      spec: { kind: "font", path: "Title.woff2" },
      keys: ["Title.woff2"],
    });
    for (const key of project.resources.keys()) addLayer(project, "base", key);
    expect(project.tiers.get("base")!.layers.map(({ kind }) => kind)).toEqual([
      "image-string",
      "image",
      "vni",
      "spine",
      "text",
    ]);
    expect(project.tiers.get("base")!.layers.at(-1)).toMatchObject({
      name: "text-4",
      defaultText: "CONGRATULATIONS!",
      style: {
        fontSize: 72,
        fill: { kind: "solid", color: "#ffffff" },
        stroke: { color: "#a40000", width: 6 },
        arcDegrees: 0,
      },
    });
    addLayer(project, "base", "amount.json");
    expect(
      project.tiers
        .get("base")!
        .layers.filter(({ kind }) => kind === "image-string"),
    ).toHaveLength(2);
    applyImportedResourceBindings(project, "amount.json");
    applyImportedResourceBindings(project, "amount.json");
    expect(resourceReferenceCount(project, "amount.json")).toBe(6);
    expect(() => removePopupResource(project, "BG.PNG")).toThrow(/仍被/);
    expect(() => removePopupResource(project, "missing.png")).toThrow(/不存在/);
    expect(() => addLayer(project, "base", "missing.png")).toThrow(
      /resource\/tier/,
    );
    expect(() => applyImportedResourceBindings(project, "missing.png")).toThrow(
      /不存在/,
    );
    expect(() =>
      applyImportedResourceBindings(project, "BG.PNG", [
        {
          tierId: "bigwin",
          countDurationSeconds: 3,
          playback: {
            loopStartTime: 1,
            loopEndTime: 2,
            keepParticlesAlive: false,
          },
        },
      ]),
    ).toThrow(/只能应用到 VNI/);
    applyImportedResourceBindings(project, "effect.json", [
      {
        tierId: "bigwin",
        countDurationSeconds: 3,
        playback: {
          loopStartTime: 1,
          loopEndTime: 2,
          keepParticlesAlive: false,
        },
      },
    ]);
    expect(
      project.tiers
        .get("bigwin")!
        .layers.find(({ resource }) => resource === "effect.json"),
    ).toMatchObject({
      resource: "effect.json",
      playback: { keepParticlesAlive: false },
    });
    const manifest = projectToManifest(project);
    expect(manifest.type).toBe("award-celebration");
    if (manifest.type !== "award-celebration")
      throw new Error("Expected award celebration popup project.");
    expect(manifest.awardCelebration.celebrationTiers[0]).toMatchObject({
      layers: expect.arrayContaining([
        expect.objectContaining({
          playback: {
            mode: "segmented",
            loopStartTime: 1,
            loopEndTime: 2,
            keepParticlesAlive: false,
          },
        }),
      ]),
    });
    const invalid = structuredClone(
      project.tiers
        .get("bigwin")!
        .layers.find(({ resource }) => resource === "effect.json")!,
    );
    if (invalid.kind !== "vni") throw new Error("Expected VNI layer.");
    (invalid as { playback: { mode: "once" } }).playback = { mode: "once" };
    project.tiers.get("bigwin")!.layers.push(invalid);
    expect(() => projectToManifest(project)).toThrow(/必须使用 segmented/);
  });

  it("enumerates only exact text layers from the VNI selected in this tier", () => {
    const project = createPopupEditorProject();
    project.resources.set("amount.json", {
      rootKey: "amount.json",
      kind: "image-string",
      spec: { kind: "image-string", manifest: "amount.json" },
      keys: ["amount.json"],
    });
    project.resources.set("number2.json", {
      rootKey: "number2.json",
      kind: "vni",
      spec: { kind: "vni", project: "number2.json" },
      keys: ["number2.json"],
    });
    project.assets.set("number2.json", {
      key: "number2.json",
      sha256: "0".repeat(64),
      payloadPath: `assets/${"0".repeat(64)}.json`,
      mediaType: "application/json",
      byteLength: 1,
      bytes: new Uint8Array(
        readFileSync(
          resolve(
            process.cwd(),
            "../../packages/vnicore/tests/fixtures/export/number2.json",
          ),
        ),
      ),
    });
    addLayer(project, "base", "amount.json");
    addLayer(project, "base", "number2.json");
    expect(
      getPopupVniTextLayerTargets(project, {
        kind: "award",
        tierId: "base",
      }),
    ).toEqual([
      {
        vniLayerId: "layer-0",
        textLayerId: "layer_text_mqz6k97v_z",
        textLayerName: "文字",
      },
    ]);

    const layers = project.tiers.get("base")!.layers;
    layers.push(
      {
        id: "image-child",
        kind: "image",
        resource: "image.png",
        order: 2,
        alpha: 1,
        attachment: {
          kind: "vni-text-layer",
          vniLayerId: "layer-0",
          textLayerId: "layer_text_mqz6k97v_z",
        },
        transform: { x: 5, y: 6, scale: 1, rotation: 0 },
        anchor: { x: 0.5, y: 0.5 },
      },
      {
        id: "text-child",
        kind: "text",
        name: "text-child",
        defaultText: "Child",
        order: 3,
        alpha: 1,
        attachment: {
          kind: "vni-text-layer",
          vniLayerId: "layer-0",
          textLayerId: "layer_text_mqz6k97v_z",
        },
        transform: { x: 7, y: 8, scale: 1, rotation: 0 },
        anchor: { x: 0.5, y: 0.5 },
        style: {
          fontSize: 24,
          letterSpacing: 0,
          fill: { kind: "solid", color: "#ffffff" },
          arcDegrees: 0,
          widthRange: { minWidth: 0, maxWidth: 0 },
        },
      },
    );
    expect(() => validatePopupEditorAttachments(project)).not.toThrow();

    const imageChild = layers.find(({ id }) => id === "image-child")!;
    (imageChild as any).attachment.textLayerId = "missing";
    expect(() => validatePopupEditorAttachments(project)).toThrow(
      /image-child.*layer-0\/missing/,
    );
    (imageChild as any).attachment.textLayerId = "layer_text_mqz6k97v_z";

    const vni = layers.find(({ id }) => id === "layer-0")!;
    (vni as any).attachment = {
      kind: "vni-text-layer",
      vniLayerId: "layer-0",
      textLayerId: "layer_text_mqz6k97v_z",
    };
    expect(() => validatePopupEditorAttachments(project)).toThrow(
      /layer-0 -> layer-0/,
    );
    (vni as any).attachment = { kind: "popup-root" };

    project.spine.overlays = [structuredClone(vni) as any];
    expect(
      getPopupVniTextLayerTargets(project, { kind: "spine-popup" }),
    ).toHaveLength(1);
    project.type = "spine";
    project.spine.tapInfoAttachment = {
      kind: "vni-text-layer",
      vniLayerId: "layer-0",
      textLayerId: "layer_text_mqz6k97v_z",
    };
    expect(() => validatePopupEditorAttachments(project)).not.toThrow();
    expect(() => assertPopupSpineOverlayCanDelete(project, "layer-0")).toThrow(
      /Tap info 子对象/,
    );
    project.spine.tapInfoAttachment = {
      ...project.spine.tapInfoAttachment,
      textLayerId: "missing",
    };
    expect(() => validatePopupEditorAttachments(project)).toThrow(
      /Tap info 子对象.*layer-0\/missing/,
    );
    project.spine.tapInfoAttachment = null;
    project.singleState.layers = [structuredClone(vni) as any];
    expect(
      getPopupVniTextLayerTargets(project, { kind: "single-state" }),
    ).toHaveLength(1);
  });
});

function imageStringZip() {
  const characters = [..."0123456789"];
  const manifest = {
    version: 1,
    kind: "image-string",
    id: "amount",
    metrics: { lineHeight: 1, letterSpacing: 0 },
    glyphs: Object.fromEntries(
      characters.map((character, index) => [
        character,
        {
          path: `assets/g${index}.png`,
          size: { width: 1, height: 1 },
          offset: { x: 0, y: 0 },
        },
      ]),
    ),
    fixedAdvanceGroups: [],
  };
  const entries = new Map<string, Uint8Array>([
    [
      "image-string.manifest.json",
      new TextEncoder().encode(JSON.stringify(manifest)),
    ],
  ]);
  characters.forEach((_, index) =>
    entries.set(`assets/g${index}.png`, png(1, 1)),
  );
  return createDeterministicZip(entries, {
    pathPolicy: { requireLowercase: true },
  });
}

function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
