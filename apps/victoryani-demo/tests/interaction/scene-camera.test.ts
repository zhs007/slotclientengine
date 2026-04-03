import { Container } from "pixi.js";
import {
  applySceneCamera,
  clampCameraScale,
  createSceneCameraState,
  resetSceneCamera,
  setSceneCameraActive,
  startSceneCameraDrag,
  updateSceneCameraDrag,
  zoomSceneCamera
} from "../../src/interaction/scene-camera.js";

describe("scene-camera", () => {
  it("clamps zoom within configured bounds", () => {
    const state = createSceneCameraState({ minScale: 0.75, maxScale: 2, scale: 1.25 });

    expect(clampCameraScale(0.2, state.minScale, state.maxScale)).toBe(0.75);
    expect(clampCameraScale(5, state.minScale, state.maxScale)).toBe(2);
    expect(zoomSceneCamera(state, -5000).scale).toBe(2);
    expect(zoomSceneCamera(state, 5000).scale).toBe(0.75);
  });

  it("drops dragging state when focus is deactivated", () => {
    const dragging = startSceneCameraDrag(createSceneCameraState(), {
      clientX: 100,
      clientY: 200,
      pointerId: 7
    });

    const inactive = setSceneCameraActive(dragging, false);

    expect(inactive.isActive).toBe(false);
    expect(inactive.isDragging).toBe(false);
    expect(inactive.pointerId).toBeNull();
  });

  it("converts drag movement by DOM layout scale", () => {
    const dragging = startSceneCameraDrag(
      createSceneCameraState({ x: 20, y: -10 }),
      {
        clientX: 50,
        clientY: 70,
        pointerId: 1
      }
    );

    const updated = updateSceneCameraDrag(
      dragging,
      {
        clientX: 90,
        clientY: 30
      },
      0.5
    );

    expect(updated.x).toBe(100);
    expect(updated.y).toBe(-90);
  });

  it("applies centered transform and preserves active state on reset", () => {
    const container = new Container();
    const state = createSceneCameraState({ isActive: true, x: 40, y: -20, scale: 1.5 });

    applySceneCamera(container, state, { designWidth: 1200, designHeight: 800 });

    expect(container.x).toBeCloseTo(-260);
    expect(container.y).toBeCloseTo(-220);
    expect(container.scale.x).toBeCloseTo(1.5);
    expect(container.scale.y).toBeCloseTo(1.5);

    const reset = resetSceneCamera(state);
    expect(reset.isActive).toBe(true);
    expect(reset.scale).toBe(1);
    expect(reset.x).toBe(0);
    expect(reset.y).toBe(0);
  });
});