import { describe, expect, it } from "vitest";
import { Container } from "pixi.js";
import { createPopupPresentation } from "../../src/popup/presentation.js";
import type { PopupManifest, PopupManifestV1 } from "../../src/popup/types.js";

describe("popup presentation host contract", () => {
  it("adapts v2 content inside a caller-owned viewport and owns no canvas", () => {
    const manifest = {
      version: 2,
      kind: "popup",
      type: "spine",
      id: "focus-popup",
      name: "Focus Popup",
      designViewport: { width: 1000, height: 1000 },
      adaptation: {
        mode: "maximized-focus",
        focus: { left: 100, right: 100, top: 200, bottom: 200 },
      },
      backdrop: { enabled: true, color: "#000000", alpha: 0.5 },
      resources: {},
      spine: {} as never,
    } satisfies PopupManifest;
    const host = new Container();
    const presentation = createPopupPresentation(manifest);
    host.addChild(presentation.container);

    const snapshot = presentation.applyViewport({ width: 500, height: 1000 });
    expect(snapshot.focusRectInViewport).toBeDefined();
    expect(snapshot.contentScale).toBeGreaterThan(0);
    expect(presentation.container.position).toMatchObject({ x: 0, y: 0 });
    expect(presentation.container.children).toHaveLength(2);
    expect(presentation.container.children[0]!.visible).toBe(false);
    presentation.setActive(true);
    expect(presentation.container.children[0]!.visible).toBe(true);
    expect(host.children).toContain(presentation.container);

    presentation.destroy();
    expect(host.destroyed).toBe(false);
  });

  it("keeps the v1 center-origin placement contract", () => {
    const manifest = {
      version: 1,
      kind: "popup",
      type: "spine",
      id: "legacy-popup",
      designViewport: { width: 1000, height: 1000 },
      resources: {},
      spine: {} as never,
    } satisfies PopupManifestV1;
    const presentation = createPopupPresentation(manifest);
    const snapshot = presentation.applyViewport(
      { width: 800, height: 600 },
      { x: 10, y: 20, scale: 0.5 },
    );
    expect(snapshot).toMatchObject({
      contentScale: 0.5,
      contentPosition: { x: 410, y: 320 },
    });
    expect(presentation.container.position).toMatchObject({ x: 410, y: 320 });
    presentation.destroy();
  });

  it("rejects invalid host geometry and keeps a disabled backdrop hidden", () => {
    const presentation = createPopupPresentation({
      version: 2,
      kind: "popup",
      type: "spine",
      id: "disabled-backdrop",
      name: "Disabled backdrop",
      designViewport: { width: 1000, height: 1000 },
      adaptation: {
        mode: "maximized-focus",
        focus: { left: 100, right: 100, top: 100, bottom: 100 },
      },
      backdrop: { enabled: false, color: "#000000", alpha: 0.5 },
      resources: {},
      spine: {} as never,
    });
    expect(() => presentation.applyViewport({ width: 0, height: 100 })).toThrow(
      /positive finite dimensions/,
    );
    expect(() =>
      presentation.applyViewport(
        { width: 100, height: 100 },
        { x: 0, y: 0, scale: 0 },
      ),
    ).toThrow(/positive scale/);
    presentation.applyViewport({ width: 100, height: 100 });
    presentation.setActive(true);
    expect(presentation.container.children[0]!.visible).toBe(false);
    presentation.destroy();
    presentation.destroy();
    expect(() =>
      presentation.applyViewport({ width: 100, height: 100 }),
    ).toThrow(/destroyed/);
  });
});
