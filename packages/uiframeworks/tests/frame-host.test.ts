import { createSlotUiFrameHost } from "../src/index.js";

describe("slot UI frame host", () => {
  it("synchronously creates stable hosts and a fixed viewport", () => {
    const root = sizedRoot(470.5, 836);
    const host = createSlotUiFrameHost({
      root,
      designSize: { width: 941, height: 1672 },
    });

    expect(root.firstElementChild).toBe(host.elements.page);
    expect([...host.elements.frame.children]).toEqual([
      host.elements.gameLayer,
      host.elements.overlay,
    ]);
    expect(host.getViewport()).toMatchObject({
      frameDesignSize: { width: 941, height: 1672 },
      scale: 0.5,
      offsetX: 0,
      offsetY: 0,
    });
    expect(host.elements.frame.style.transform).toBe(
      "translate(0px, 0px) scale(0.5)",
    );
    host.destroy();
  });

  it("forwards focus resize snapshots and supports idempotent unsubscribe", () => {
    const root = sizedRoot(1125, 2000);
    const host = createSlotUiFrameHost({
      root,
      designSize: { width: 1125, height: 2000 },
      framePolicy: {
        mode: "focus",
        maxDesignSize: { width: 2000, height: 2000 },
        preferredPortraitSize: { width: 1125, height: 2000 },
        focusRect: { width: 720, height: 1080 },
        minFocusMargin: { left: 60, right: 60, top: 60, bottom: 60 },
      },
    });
    const listener = vi.fn();
    const unsubscribe = host.onViewportChange(listener);

    resizeRoot(root, 3000, 1200);
    window.dispatchEvent(new Event("resize"));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(host.getViewport().frameDesignSize).toEqual({
      width: 2000,
      height: 1200,
    });

    unsubscribe();
    unsubscribe();
    window.dispatchEvent(new Event("resize"));
    expect(listener).toHaveBeenCalledTimes(1);
    host.destroy();
  });

  it("uses orientation and maximized-focus policies through the shared calculator", () => {
    const portraitRoot = sizedRoot(390, 844);
    const orientationHost = createSlotUiFrameHost({
      root: portraitRoot,
      designSize: { width: 1280, height: 720 },
      framePolicy: {
        mode: "orientation-focus",
        variants: {
          landscape: {
            maxDesignSize: { width: 1280, height: 720 },
            focusRect: { width: 800, height: 600 },
          },
          portrait: {
            maxDesignSize: { width: 720, height: 1280 },
            focusRect: { width: 600, height: 800 },
          },
        },
      },
    });
    expect(
      orientationHost.getViewport().frameDesignSize.height,
    ).toBeGreaterThan(orientationHost.getViewport().frameDesignSize.width);

    const resolver = vi.fn(() => ({ width: 840, height: 1200 }));
    const maximizedHost = createSlotUiFrameHost({
      root: sizedRoot(1200, 1200),
      designSize: { width: 2000, height: 2000 },
      framePolicy: { mode: "maximized-focus", resolveViewportSize: resolver },
    });
    expect(resolver).toHaveBeenCalledWith({ width: 1200, height: 1200 });
    expect(maximizedHost.getViewport().frameDesignSize).toEqual({
      width: 840,
      height: 1200,
    });
    orientationHost.destroy();
    maximizedHost.destroy();
  });

  it("isolates instances and stops all notifications after idempotent destroy", () => {
    const firstRoot = sizedRoot(400, 800);
    const secondRoot = sizedRoot(800, 400);
    const first = createSlotUiFrameHost({
      root: firstRoot,
      designSize: { width: 1000, height: 1000 },
    });
    const second = createSlotUiFrameHost({
      root: secondRoot,
      designSize: { width: 1000, height: 1000 },
    });
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    first.onViewportChange(firstListener);
    second.onViewportChange(secondListener);

    first.destroy();
    first.destroy();
    expect(firstRoot.children).toHaveLength(0);
    expect(secondRoot.firstElementChild).toBe(second.elements.page);
    window.dispatchEvent(new Event("resize"));
    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalledTimes(1);
    expect(first.onViewportChange(firstListener)()).toBeUndefined();
    second.destroy();
  });
});

function sizedRoot(width: number, height: number): HTMLElement {
  const root = document.createElement("div");
  resizeRoot(root, width, height);
  return root;
}

function resizeRoot(root: HTMLElement, width: number, height: number): void {
  Object.defineProperty(root, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(root, "clientHeight", {
    configurable: true,
    value: height,
  });
}
