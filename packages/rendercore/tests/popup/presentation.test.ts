import { describe, expect, it } from "vitest";
import { Container } from "pixi.js";
import {
  createPopupBackdropController,
  createPopupPresentation,
} from "../../src/popup/presentation.js";
import type { PopupManifest, PopupManifestV1 } from "../../src/popup/types.js";

describe("popup presentation host contract", () => {
  it("shares one host-owned backdrop across serialized Popup presentations", () => {
    const backdrop = createPopupBackdropController("test shared backdrop");
    const host = new Container();
    host.addChild(backdrop.view);
    const manifest = {
      version: 3,
      kind: "popup",
      type: "spine",
      id: "shared-popup",
      name: "Shared Popup",
      adaptation: {
        mode: "maximized-focus",
        focus: { left: 100, right: 100, top: 100, bottom: 100 },
      },
      backdrop: { enabled: true, color: "#000000", alpha: 0.5 },
      resources: {},
      spine: {} as never,
    } satisfies PopupManifest;
    const first = createPopupPresentation(manifest, {
      backdropController: backdrop,
    });
    const second = createPopupPresentation(
      { ...manifest, id: "shared-popup-2", name: "Shared Popup 2" },
      { backdropController: backdrop },
    );
    host.addChild(first.container, second.container);
    first.applyViewport({ width: 800, height: 600 });
    second.applyViewport({ width: 800, height: 600 });

    expect(first.container.children).toHaveLength(1);
    expect(second.container.children).toHaveLength(1);
    expect(
      host.children.filter((child) => child === backdrop.view),
    ).toHaveLength(1);
    first.setActive(true);
    expect(backdrop.view.visible).toBe(true);
    second.setActive(true);
    first.setActive(false);
    expect(backdrop.view.visible).toBe(true);
    second.setActive(false);
    expect(backdrop.view.visible).toBe(false);

    first.destroy();
    second.destroy();
    expect(backdrop.view.destroyed).toBe(false);
    backdrop.destroy();
  });

  it("adapts v3 content from focus alone on an unbounded authored plane", () => {
    const presentation = createPopupPresentation({
      version: 3,
      kind: "popup",
      type: "spine",
      id: "unbounded-popup",
      name: "Unbounded Popup",
      adaptation: {
        mode: "maximized-focus",
        focus: { left: 100, right: 300, top: 200, bottom: 200 },
      },
      backdrop: { enabled: true, color: "#000000", alpha: 0.5 },
      resources: {},
      spine: {} as never,
    });
    expect(
      presentation.applyViewport(
        { width: 1600, height: 900 },
        { x: 10, y: 20, scale: 0.5 },
      ),
    ).toEqual({
      viewportSize: { width: 1600, height: 900 },
      contentScale: 1.125,
      contentPosition: { x: 585, y: 470 },
      focusRectInViewport: { x: 350, y: 0, width: 900, height: 900 },
    });
    presentation.destroy();
  });

  it("contains and centers a portrait design in landscape and square viewports", () => {
    const presentation = createPopupPresentation({
      version: 2,
      kind: "popup",
      type: "spine",
      id: "portrait-popup",
      name: "Portrait Popup",
      designViewport: { width: 1080, height: 1920 },
      adaptation: {
        mode: "maximized-focus",
        focus: { left: 540, right: 540, top: 960, bottom: 960 },
      },
      backdrop: { enabled: true, color: "#000000", alpha: 0.5 },
      resources: {},
      spine: {} as never,
    });

    expect(presentation.applyViewport({ width: 1920, height: 1080 })).toEqual({
      viewportSize: { width: 1920, height: 1080 },
      contentScale: 0.5625,
      contentPosition: { x: 960, y: 540 },
      focusRectInViewport: {
        x: 656.25,
        y: 0,
        width: 607.5,
        height: 1080,
      },
    });
    expect(presentation.contentRoot.position).toMatchObject({
      x: 960,
      y: 540,
    });

    const square = presentation.applyViewport({ width: 2000, height: 2000 });
    expect(square.contentScale).toBeCloseTo(25 / 24);
    expect(square.contentPosition).toEqual({ x: 1000, y: 1000 });
    expect(square.focusRectInViewport).toEqual({
      x: 437.5,
      y: 0,
      width: 1125,
      height: 2000,
    });
    presentation.destroy();
  });

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

  it("gates a v5 backdrop by the active project state", () => {
    const presentation = createPopupPresentation({
      version: 5,
      kind: "popup",
      type: "spine",
      id: "state-backdrop",
      name: "State backdrop",
      adaptation: {
        mode: "maximized-focus",
        focus: { left: 100, right: 100, top: 100, bottom: 100 },
      },
      backdrop: {
        enabled: true,
        color: "#000000",
        alpha: 0.5,
        visibleStates: ["loop"],
      },
      resources: {},
      spine: {} as never,
    });
    presentation.applyViewport({ width: 100, height: 100 });
    presentation.setActive(true);
    presentation.setState("start");
    expect(presentation.container.children[0]!.visible).toBe(false);
    presentation.setState("loop");
    expect(presentation.container.children[0]!.visible).toBe(true);
    presentation.setState("end");
    expect(presentation.container.children[0]!.visible).toBe(false);
    presentation.destroy();
  });
});
