import type { Container } from "pixi.js";
import type { ControlPanel } from "../ui/control-panel.js";
import {
  applySceneCamera,
  createSceneCameraState,
  endSceneCameraDrag,
  resetSceneCamera,
  setSceneCameraActive,
  startSceneCameraDrag,
  updateSceneCameraDrag,
  zoomSceneCamera
} from "./scene-camera.js";

export type SceneCameraControllerOptions = {
  stageHost: HTMLElement;
  viewportRoot: Container;
  designWidth: number;
  designHeight: number;
  controlPanel: Pick<ControlPanel, "cameraActiveLabel" | "cameraScaleLabel" | "cameraOffsetLabel" | "resetCameraButton">;
  getLayoutScale: () => number;
};

export type SceneCameraController = {
  destroy: () => void;
};

export function createSceneCameraController({
  stageHost,
  viewportRoot,
  designWidth,
  designHeight,
  controlPanel,
  getLayoutScale
}: SceneCameraControllerOptions): SceneCameraController {
  let state = createSceneCameraState();

  stageHost.tabIndex = 0;
  stageHost.setAttribute("aria-label", "VictoryAni scene viewport");

  const render = () => {
    applySceneCamera(viewportRoot, state, { designWidth, designHeight });
    stageHost.classList.toggle("stage-host--active", state.isActive);
    stageHost.classList.toggle("stage-host--dragging", state.isDragging);
    controlPanel.cameraActiveLabel.textContent = state.isActive ? "Active" : "Inactive";
    controlPanel.cameraScaleLabel.textContent = `${state.scale.toFixed(2)}x`;
    controlPanel.cameraOffsetLabel.textContent = `${Math.round(state.x)}, ${Math.round(state.y)}`;
  };

  const setActive = (isActive: boolean) => {
    state = setSceneCameraActive(state, isActive);
    if (isActive) {
      stageHost.focus({ preventScroll: true });
    } else if (document.activeElement === stageHost) {
      stageHost.blur();
    }
    render();
  };

  const stopDragging = () => {
    const pointerId = state.pointerId;
    state = endSceneCameraDrag(state);
    if (pointerId !== null && stageHost.hasPointerCapture(pointerId)) {
      stageHost.releasePointerCapture(pointerId);
    }
    render();
  };

  const handleDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      setActive(false);
      return;
    }

    setActive(stageHost.contains(target));
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    event.preventDefault();
    state = startSceneCameraDrag(state, {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId
    });
    stageHost.setPointerCapture(event.pointerId);
    render();
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!state.isDragging || state.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    state = updateSceneCameraDrag(
      state,
      {
        clientX: event.clientX,
        clientY: event.clientY
      },
      getLayoutScale()
    );
    render();
  };

  const handlePointerEnd = (event: PointerEvent) => {
    if (state.pointerId !== event.pointerId) {
      return;
    }

    stopDragging();
  };

  const handleWheel = (event: WheelEvent) => {
    if (!state.isActive) {
      return;
    }

    event.preventDefault();
    state = zoomSceneCamera(state, event.deltaY);
    render();
  };

  const handleWindowBlur = () => {
    stopDragging();
  };

  const handleResetClick = () => {
    state = resetSceneCamera(state);
    render();
  };

  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  stageHost.addEventListener("pointerdown", handlePointerDown);
  stageHost.addEventListener("pointermove", handlePointerMove);
  stageHost.addEventListener("pointerup", handlePointerEnd);
  stageHost.addEventListener("pointercancel", handlePointerEnd);
  stageHost.addEventListener("lostpointercapture", stopDragging);
  stageHost.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("blur", handleWindowBlur);
  controlPanel.resetCameraButton.addEventListener("click", handleResetClick);

  render();

  return {
    destroy: () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      stageHost.removeEventListener("pointerdown", handlePointerDown);
      stageHost.removeEventListener("pointermove", handlePointerMove);
      stageHost.removeEventListener("pointerup", handlePointerEnd);
      stageHost.removeEventListener("pointercancel", handlePointerEnd);
      stageHost.removeEventListener("lostpointercapture", stopDragging);
      stageHost.removeEventListener("wheel", handleWheel);
      window.removeEventListener("blur", handleWindowBlur);
      controlPanel.resetCameraButton.removeEventListener("click", handleResetClick);
    }
  };
}