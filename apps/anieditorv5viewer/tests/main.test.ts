// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

const playerMock = vi.hoisted(() => {
  const instances: MockVNIPlayer[] = [];
  const threeReelSlot = {
    afterGroupId: "layer_group_mqqo064b_4",
    afterGroupName: "下层光效",
    beforeGroupId: "group_default",
    beforeGroupName: "上层光效",
    renderIndex: 0,
  };

  class MockVNIPlayer {
    private readonly layerGroupSlots: Array<typeof threeReelSlot>;
    readonly destroy = vi.fn();
    readonly init = vi.fn(async () => Promise.resolve());
    readonly isPlaying = vi.fn(() => false);
    readonly play = vi.fn();
    readonly pause = vi.fn();
    readonly restart = vi.fn();
    readonly setLoop = vi.fn();
    readonly getLoop = vi.fn(() => true);
    readonly getTime = vi.fn(() => 0);
    readonly seek = vi.fn();
    readonly requestSegmentedPlaybackEnd = vi.fn();
    readonly getLayerGroupSlots = vi.fn(() => this.layerGroupSlots);
    readonly attachImageBetweenLayerGroups = vi.fn();
    readonly attachExternalImageBetweenLayerGroups = vi.fn(async () => vi.fn());
    readonly clearMountedNodes = vi.fn();
    readonly getPlaybackState = vi.fn(() => ({
      mode: "timeline",
      phase: "idle",
      currentTime: 0,
      isPlaying: false,
      isDrainingParticles: false,
      liveParticleCount: 0,
      loopIndex: 0,
      keepParticlesAlive: true,
    }));

    constructor(readonly options: unknown) {
      const projectId =
        typeof options === "object" &&
        options !== null &&
        "projectId" in options
          ? String((options as { projectId: unknown }).projectId)
          : "";
      this.layerGroupSlots =
        projectId === "3reel-multipay-01" ? [threeReelSlot] : [];
      instances.push(this);
    }
  }

  return { instances, MockVNIPlayer };
});

vi.mock("@slotclientengine/vnicore/pixi", () => ({
  VNIPlayer: playerMock.MockVNIPlayer,
}));

afterEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
  playerMock.instances.length = 0;
});

describe("anieditorv5viewer main", () => {
  it("initializes VNIPlayer and destroys the old player on project switch", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import("../src/main");
    await Promise.resolve();
    await Promise.resolve();

    expect(playerMock.instances).toHaveLength(1);
    expect(playerMock.instances[0].init).toHaveBeenCalledTimes(1);

    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="V5G project"]',
    );
    expect(select).not.toBeNull();
    if (!select) throw new Error("Missing project select.");

    select.value = "bigwin-runtime-50";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(playerMock.instances).toHaveLength(2);
    expect(playerMock.instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(playerMock.instances[1].init).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("canvas")).toHaveLength(0);
  });

  it("loads roundreel as a runtime_100 export-style project", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import("../src/main");
    await Promise.resolve();
    await Promise.resolve();

    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="V5G project"]',
    );
    if (!select) throw new Error("Missing project select.");

    select.value = "roundreel";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    const player = playerMock.instances.at(-1);
    const summary = document.querySelector(".viewer-summary");

    expect(player?.options).toMatchObject({
      projectId: "roundreel",
      bundleId: "export",
      profileId: "runtime_100",
      profilePurpose: "runtime",
      assetScale: 1,
    });
    expect(summary?.textContent).toContain("schema VNI_0.020");
    expect(summary?.textContent).toContain("profile runtime_100");
    expect(summary?.textContent).toContain("safe_glow");
  });

  it("wires segmented playback controls to VNIPlayer", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import("../src/main");
    await Promise.resolve();
    await Promise.resolve();

    const player = playerMock.instances[0];
    const loopStart = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop start seconds"]',
    );
    const loopEnd = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop end seconds"]',
    );
    const keepParticles = document.querySelector<HTMLInputElement>(
      'input[aria-label="维持粒子活动"]',
    );
    const startButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "开始",
    );
    const endButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "结束",
    );

    expect(loopStart).not.toBeNull();
    expect(loopEnd).not.toBeNull();
    expect(keepParticles?.checked).toBe(true);
    expect(startButton).toBeDefined();
    expect(endButton).toBeDefined();
    if (
      !loopStart ||
      !loopEnd ||
      !keepParticles ||
      !startButton ||
      !endButton
    ) {
      throw new Error("Missing advanced playback controls.");
    }

    loopStart.value = "2.5";
    loopStart.dispatchEvent(new Event("input", { bubbles: true }));
    loopEnd.value = "3";
    loopEnd.dispatchEvent(new Event("input", { bubbles: true }));
    keepParticles.checked = false;
    keepParticles.dispatchEvent(new Event("change", { bubbles: true }));
    startButton.click();

    expect(player.play).toHaveBeenCalledWith({
      mode: "segmented",
      loopStart: { unit: "time", at: 2.5 },
      loopEnd: { unit: "time", at: 3 },
      keepParticlesAlive: false,
    });

    player.getPlaybackState.mockReturnValue({
      mode: "segmented",
      phase: "loop",
      currentTime: 3,
      isPlaying: true,
      isDrainingParticles: false,
      liveParticleCount: 12,
      loopIndex: 0,
      keepParticlesAlive: false,
    });
    startButton.click();
    expect(endButton.disabled).toBe(false);
    endButton.click();
    expect(player.requestSegmentedPlaybackEnd).toHaveBeenCalledTimes(1);
  });

  it("wires timeline seek controls to VNIPlayer", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import("../src/main");
    await Promise.resolve();
    await Promise.resolve();

    const player = playerMock.instances[0];
    const timeline = document.querySelector<HTMLInputElement>("input.timeline");
    expect(timeline).not.toBeNull();
    if (!timeline) throw new Error("Missing timeline control.");

    timeline.value = "1.25";
    timeline.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    timeline.dispatchEvent(new Event("input", { bubbles: true }));

    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.seek).toHaveBeenCalledWith(1.25);
  });

  it("wires group insertion controls to VNIPlayer layer group slots", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import("../src/main");
    await Promise.resolve();
    await Promise.resolve();

    const projectSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="V5G project"]',
    );
    const insertButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "插入",
    );
    expect(insertButton?.disabled).toBe(true);
    if (!projectSelect || !insertButton) {
      throw new Error("Missing project or insertion controls.");
    }

    projectSelect.value = "3reel-multipay-01";
    projectSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const player = playerMock.instances[1];
    const assetSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="插入 asset"]',
    );
    const slotSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="组间 slot"]',
    );
    const clearButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "移除",
    );
    if (!assetSelect || !slotSelect || !clearButton) {
      throw new Error("Missing group insertion controls.");
    }

    const slotOptions = Array.from(slotSelect.options);
    expect(slotOptions).toHaveLength(1);
    expect(slotOptions[0].textContent).toBe("下层光效 -> 上层光效");
    expect(assetSelect.options.length).toBeGreaterThan(3);
    assetSelect.value = "assets/image_asset_image_mqp31v5g_14.jpg";
    assetSelect.dispatchEvent(new Event("change", { bubbles: true }));
    insertButton.click();

    expect(player.attachImageBetweenLayerGroups).toHaveBeenCalledWith({
      id: "viewer-group-slot-image",
      afterGroupId: "layer_group_mqqo064b_4",
      beforeGroupId: "group_default",
      assetId: "asset_image_mqp31v5g_14",
      x: 1000,
      y: 1000,
      anchorX: 0.5,
      anchorY: 0.5,
      opacity: 1,
    });
    expect(clearButton.disabled).toBe(false);

    clearButton.click();
    expect(player.clearMountedNodes).toHaveBeenCalledTimes(1);
    expect(clearButton.disabled).toBe(true);

    const projectAssetPaths = new Set([
      "assets/1_asset_image_mqp1egz4_b.png",
      "assets/image_asset_image_mqp31v5g_14.jpg",
      "assets/2_asset_image_mqp4tfmw_i.jpg",
    ]);
    const externalOption = Array.from(assetSelect.options).find(
      (option) => !projectAssetPaths.has(option.value),
    );
    expect(externalOption).toBeDefined();
    if (!externalOption) throw new Error("Missing external insertion asset.");

    assetSelect.value = externalOption.value;
    assetSelect.dispatchEvent(new Event("change", { bubbles: true }));
    insertButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(player.attachExternalImageBetweenLayerGroups).toHaveBeenCalledWith({
      id: "viewer-group-slot-image",
      afterGroupId: "layer_group_mqqo064b_4",
      beforeGroupId: "group_default",
      imageUrl: expect.any(String),
      label: externalOption.value,
      x: 1000,
      y: 1000,
      anchorX: 0.5,
      anchorY: 0.5,
      opacity: 1,
    });
  });

  it("loads lock_01 with no legal insertion slot", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import("../src/main");
    await Promise.resolve();
    await Promise.resolve();

    const projectSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="V5G project"]',
    );
    const insertButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "插入",
    );
    if (!projectSelect || !insertButton) {
      throw new Error("Missing project or insertion controls.");
    }

    projectSelect.value = "lock-01";
    projectSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const summary = document.querySelector(".viewer-summary");
    const assetSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="插入 asset"]',
    );
    const slotSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="组间 slot"]',
    );
    const insertionStatus = document.querySelector(".group-insertion-status");
    if (!summary || !assetSelect || !slotSelect || !insertionStatus) {
      throw new Error("Missing lock_01 viewer controls.");
    }

    expect(playerMock.instances.at(-1)?.getLayerGroupSlots()).toEqual([]);
    expect(summary.textContent).toContain("schema VNI_0.017");
    expect(summary.textContent).toContain("safe_glow");
    expect(assetSelect.options.length).toBeGreaterThanOrEqual(7);
    expect(slotSelect.disabled).toBe(true);
    expect(insertButton.disabled).toBe(true);
    expect(insertionStatus.textContent).toBe("无合法 slot");
  });

  it("blocks invalid segmented times before calling runtime", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import("../src/main");
    await Promise.resolve();
    await Promise.resolve();

    const player = playerMock.instances[0];
    const loopStart = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop start seconds"]',
    );
    const loopEnd = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop end seconds"]',
    );
    const startButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "开始",
    );
    const error = document.querySelector(".advanced-error");

    if (!loopStart || !loopEnd || !startButton || !error) {
      throw new Error("Missing advanced playback controls.");
    }

    loopStart.value = "4";
    loopStart.dispatchEvent(new Event("input", { bubbles: true }));
    loopEnd.value = "3";
    loopEnd.dispatchEvent(new Event("input", { bubbles: true }));
    startButton.click();

    expect(startButton.disabled).toBe(true);
    expect(error.textContent).toContain("loopStart");
    expect(player.play).not.toHaveBeenCalled();
  });
});
