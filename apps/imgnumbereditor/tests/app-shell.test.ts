import type { ImageStringResource } from "@slotclientengine/rendercore/image-string";
import { describe, expect, it, vi } from "vitest";
import { createImageStringAppShell } from "../src/ui/app-shell.js";
import { projectFixture } from "./helpers.js";

describe("app shell", () => {
  it("renders project controls, templates, preview calls and export", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const setText = vi.fn();
    const destroyPreview = vi.fn();
    const destroyResource = vi.fn(async () => undefined);
    const saveFile = vi.fn();
    const resource = {
      manifest: {} as never,
      textures: {},
      destroyed: false,
      assertUsable: vi.fn(),
      destroy: destroyResource,
    } satisfies ImageStringResource;
    const createPreview = vi.fn(async () => ({
      setText,
      setZoom: vi.fn(),
      getSnapshot: () => ({ text: "0" }),
      destroy: destroyPreview,
    }));
    const shell = createImageStringAppShell(root, {
      createResource: async () => resource,
      createPreview,
      exportZip: async () => ({
        filename: "x.zip",
        bytes: new Uint8Array([1]),
      }),
      saveFile,
    });
    expect(root.textContent).toContain("图片字符串资源编辑器");
    shell.store.replace(projectFixture());
    await vi.waitFor(() => expect(createPreview).toHaveBeenCalled());
    const template = [
      ...root.querySelectorAll("[data-role=templates] button"),
    ].find(
      (button) => button.textContent === "001234567890",
    ) as HTMLButtonElement;
    template.click();
    await Promise.resolve();
    expect(setText).toHaveBeenCalledWith("001234567890");
    (root.querySelector("[data-action=export]") as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(saveFile).toHaveBeenCalledWith("x.zip", new Uint8Array([1]));
    await shell.destroy();
    expect(root.children).toHaveLength(0);
    expect(destroyPreview).toHaveBeenCalled();
  });

  it("uploads into unmapped state, requires confirmation, and saves a fixed group", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const shell = createImageStringAppShell(root, {
      decodeFile: async () => ({
        key: "0-1.png",
        sha256: "a".repeat(64),
        payloadPath: `assets/${"a".repeat(64)}.png`,
        mediaType: "image/png",
        bytes: new Uint8Array([1]),
        byteLength: 1,
        width: 8,
        height: 10,
        suggestedCharacter: "0",
      }),
      createResource: async () => ({
        manifest: {} as never,
        textures: {},
        destroyed: false,
        assertUsable: vi.fn(),
        destroy: vi.fn(async () => undefined),
      }),
      createPreview: async () => ({
        setText: vi.fn(),
        setZoom: vi.fn(),
        getSnapshot: () => ({}),
        destroy: vi.fn(),
      }),
    });
    const upload = root.querySelector<HTMLInputElement>(
      "[data-role=import-assets]",
    )!;
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File(["x"], "0-1.png", { type: "image/png" })],
    });
    upload.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(shell.store.project.unmappedFiles.size).toBe(1),
    );
    root.querySelector<HTMLButtonElement>("[data-map]")!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(shell.store.project.glyphs.has("0")).toBe(true);
    root.querySelector<HTMLInputElement>("[data-group=characters]")!.value =
      "0";
    root.querySelector<HTMLButtonElement>("[data-action=group-max]")!.click();
    await Promise.resolve();
    expect(
      root.querySelector<HTMLInputElement>("[data-group=advance]")!.value,
    ).toBe("8");
    root.querySelector<HTMLButtonElement>("[data-action=group-save]")!.click();
    await Promise.resolve();
    expect(shell.store.project.fixedAdvanceGroups[0].id).toBe("digits");
    root.querySelector<HTMLButtonElement>("[data-role=groups] button")!.click();
    await Promise.resolve();
    expect(shell.store.project.fixedAdvanceGroups).toHaveLength(0);
    root.querySelector<HTMLButtonElement>("[data-unmap]")!.click();
    await Promise.resolve();
    expect(shell.store.project.unmappedFiles.has("0-1.png")).toBe(true);
    root.querySelector<HTMLButtonElement>("[data-action=new]")!.click();
    expect(shell.store.project.glyphs.size).toBe(0);
    await shell.destroy();
  });

  it("routes a ZIP through project import and keeps the current project when review is cancelled", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const imported = projectFixture();
    const importZip = vi.fn(async () => imported);
    const confirmation = vi.fn(() => false);
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: confirmation,
    });
    const shell = createImageStringAppShell(root, { importZip });
    const upload = root.querySelector<HTMLInputElement>(
      "[data-role=import-assets]",
    )!;
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File(["zip"], "digits.zip", { type: "application/zip" })],
    });
    upload.dispatchEvent(new Event("change"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(importZip).toHaveBeenCalledOnce();
    expect(shell.store.project.glyphs.size).toBe(0);
    expect(confirmation).toHaveBeenCalledOnce();
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: undefined,
    });
    await shell.destroy();
  });

  it("covers overwrite review, glyph controls, preview controls and async errors", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const setText = vi.fn();
    const setZoom = vi.fn();
    const confirm = vi.fn(() => true);
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: confirm,
    });
    let decodeVersion = 0;
    const shell = createImageStringAppShell(root, {
      decodeFile: async (file) => {
        decodeVersion += 1;
        const digest = String(decodeVersion).repeat(64).slice(0, 64);
        return {
          key: file.name,
          sha256: digest,
          payloadPath: `assets/${digest}.png`,
          mediaType: "image/png",
          bytes: new Uint8Array([decodeVersion]),
          byteLength: 1,
          width: 8 + decodeVersion,
          height: 10,
          suggestedCharacter: "0",
        };
      },
      createResource: async () => ({
        manifest: {} as never,
        textures: {},
        destroyed: false,
        assertUsable: vi.fn(),
        destroy: vi.fn(async () => undefined),
      }),
      createPreview: async () => ({
        setText,
        setZoom,
        getSnapshot: () => ({ ready: true }),
        destroy: vi.fn(),
      }),
      exportZip: async () => {
        throw new Error("export failed");
      },
    });
    shell.store.replace(projectFixture());
    await vi.waitFor(() => expect(setZoom).toHaveBeenCalled());
    const previewText = root.querySelector<HTMLInputElement>(
      "[data-role=preview-text]",
    )!;
    previewText.value = "00";
    previewText.dispatchEvent(new Event("input"));
    const zoom = root.querySelector<HTMLInputElement>("[data-role=zoom]")!;
    zoom.value = "3";
    zoom.dispatchEvent(new Event("input"));
    await vi.waitFor(() => expect(setText).toHaveBeenCalledWith("00"));
    await vi.waitFor(() => expect(setZoom).toHaveBeenCalledWith(3));

    const upload = root.querySelector<HTMLInputElement>(
      "[data-role=import-assets]",
    )!;
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File(["next"], "0.png", { type: "image/png" })],
    });
    upload.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());

    root
      .querySelector<HTMLButtonElement>("[data-action=counter-play]")!
      .click();
    root
      .querySelector<HTMLButtonElement>("[data-action=counter-pause]")!
      .click();
    root
      .querySelector<HTMLButtonElement>("[data-action=counter-reset]")!
      .click();
    root.querySelector<HTMLButtonElement>("[data-action=export]")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector("[data-role=error]")?.textContent).toContain(
        "export failed",
      ),
    );
    await shell.destroy();
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: undefined,
    });
  });
});
