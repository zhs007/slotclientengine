import { describe, expect, it } from "vitest";
import { createViewportState } from "../../src/runtime/viewport-controller.js";
import {
  activateViewportInteraction,
  applyViewportTransform,
  beginViewportDrag,
  createViewportInteractionState,
  endViewportDrag,
  updateViewportDrag,
  zoomViewportWithWheel
} from "../../src/runtime/viewport-interaction.js";

describe("viewport-interaction", () => {
  it("applies viewport transforms to a target container", () => {
    const calls: Array<[number, number]> = [];
    const scaleCalls: Array<[number, number | undefined]> = [];
    const target = {
      position: {
        set: (x: number, y: number) => {
          calls.push([x, y]);
        }
      },
      scale: {
        set: (x: number, y?: number) => {
          scaleCalls.push([x, y]);
        }
      }
    };

    applyViewportTransform(target, createViewportState({ zoom: 1.25, panX: 180, panY: -45 }));

    expect(calls).toEqual([[180, -45]]);
    expect(scaleCalls).toEqual([[1.25, undefined]]);
  });

  it("requires activation before wheel zoom can change the viewport", () => {
    const viewportState = createViewportState({ zoom: 1, minZoom: 0.8, maxZoom: 1.4 });
    const inactiveState = createViewportInteractionState();

    const blocked = zoomViewportWithWheel(viewportState, inactiveState, {
      deltaY: -120,
      anchor: { x: 320, y: 200 },
      isPointerInsideStage: true
    });

    expect(blocked.handled).toBe(false);
    expect(blocked.viewportState).toBe(viewportState);

    const activeState = activateViewportInteraction(inactiveState);
    const allowed = zoomViewportWithWheel(viewportState, activeState, {
      deltaY: -120,
      anchor: { x: 320, y: 200 },
      isPointerInsideStage: true,
      zoomStep: 1.5
    });

    expect(allowed.handled).toBe(true);
    expect(allowed.viewportState.zoom).toBe(1.4);
  });

  it("clears drag state after drag end and ignores unrelated pointers", () => {
    const interactionState = beginViewportDrag(createViewportInteractionState(), {
      pointerId: 7,
      clientX: 100,
      clientY: 140,
      panX: 20,
      panY: 30
    });
    const viewportState = createViewportState({ panX: 20, panY: 30 });

    const ignored = updateViewportDrag(interactionState, viewportState, {
      pointerId: 8,
      clientX: 180,
      clientY: 220
    });
    expect(ignored.viewportState).toBe(viewportState);

    const moved = updateViewportDrag(interactionState, viewportState, {
      pointerId: 7,
      clientX: 150,
      clientY: 210
    });
    expect(moved.viewportState.panX).toBe(70);
    expect(moved.viewportState.panY).toBe(100);

    const ended = endViewportDrag(interactionState, 7);
    expect(ended.isDragging).toBe(false);
    expect(ended.pointerId).toBeNull();
  });
});