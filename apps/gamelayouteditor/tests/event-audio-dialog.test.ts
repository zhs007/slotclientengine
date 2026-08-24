import { describe, expect, it, vi } from "vitest";
import { manifestToEditorProject } from "../src/model/editor-project.js";
import { mountProjectEventAudioDialog } from "../src/ui/event-audio-dialog.js";
import { assetBytes, imageManifest } from "./fixtures.js";

describe("project event audio dialog", () => {
  it("inspects the referenced package closure while retaining unbound workspace audio", async () => {
    const project = manifestToEditorProject(imageManifest, assetBytes);
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
    expect(project.assets.has("assets/unbound.mp3")).toBe(true);
    dialog.destroy();
  });
});
