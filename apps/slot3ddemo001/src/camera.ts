import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import {
  CAMERA,
  CELL_HEIGHT,
  CELL_WIDTH,
  SYMBOL_FIT_HEIGHT,
  SYMBOL_FIT_WIDTH,
  WALL_BASE_Y,
  WALL_COLUMNS,
  WALL_ROWS,
} from "./config.js";

export interface FrontCameraFrame {
  readonly distance: number;
  readonly targetY: number;
}

export function calculateFrontCameraFrame(aspect: number): FrontCameraFrame {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError("Camera aspect must be a positive finite number.");
  }
  const wallWidth = (WALL_COLUMNS - 1) * CELL_WIDTH + SYMBOL_FIT_WIDTH;
  const wallHeight = (WALL_ROWS - 1) * CELL_HEIGHT + SYMBOL_FIT_HEIGHT;
  const verticalHalfFov = MathUtils.degToRad(CAMERA.fovDegrees / 2);
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const verticalDistance = wallHeight / 2 / Math.tan(verticalHalfFov);
  const horizontalDistance = wallWidth / 2 / Math.tan(horizontalHalfFov);
  return Object.freeze({
    distance:
      Math.max(verticalDistance, horizontalDistance) * CAMERA.framingMargin,
    targetY: WALL_BASE_Y + wallHeight / 2,
  });
}

export function createFrontCamera(aspect: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    CAMERA.fovDegrees,
    aspect,
    CAMERA.near,
    CAMERA.far,
  );
  applyFrontCameraFrame(camera, aspect);
  return camera;
}

export function applyFrontCameraFrame(
  camera: PerspectiveCamera,
  aspect: number,
): void {
  const frame = calculateFrontCameraFrame(aspect);
  camera.aspect = aspect;
  camera.position.set(0, frame.targetY, frame.distance);
  camera.lookAt(new Vector3(0, frame.targetY, 0));
  camera.updateProjectionMatrix();
}
