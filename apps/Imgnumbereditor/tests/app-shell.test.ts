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
    const shell = createImageStringAppShell(root, {
      createResource: async () => resource,
      createPreview: async () => ({
        setText,
        setZoom: vi.fn(),
        getSnapshot: () => ({ text: "0" }),
        destroy: destroyPreview,
      }),
      exportZip: async () => ({
        filename: "x.zip",
        bytes: new Uint8Array([1]),
      }),
      saveFile,
    });
    expect(root.textContent).toContain("图片字符串资源编辑器");
    shell.store.replace(projectFixture());
    await Promise.resolve();
    await Promise.resolve();
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
        id: "upload-0",
        originalName: "0-1.png",
        mediaType: "image/png",
        bytes: new Uint8Array([1]),
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
    const upload = root.querySelector<HTMLInputElement>("[data-role=upload]")!;
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File(["x"], "0-1.png", { type: "image/png" })],
    });
    upload.dispatchEvent(new Event("change"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(shell.store.project.unmappedFiles.size).toBe(1);
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
    expect(shell.store.project.unmappedFiles.has("upload-0")).toBe(true);
    root.querySelector<HTMLButtonElement>("[data-action=new]")!.click();
    expect(shell.store.project.glyphs.size).toBe(0);
    await shell.destroy();
  });
});
