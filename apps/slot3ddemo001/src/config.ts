export const WALL_COLUMNS = 5;
export const WALL_ROWS = 3;
export const CELL_WIDTH = 1.93;
export const CELL_HEIGHT = 1.85;
export const SYMBOL_FIT_WIDTH = 2.05;
export const SYMBOL_FIT_HEIGHT = 1.97;
export const WALL_BASE_Y = 0.32;
export const NORMAL_MAP_STRENGTH = 0.42;

export const DROP_TIMING = Object.freeze({
  rowDelaySeconds: 0.52,
  columnDelaySeconds: 0.11,
  durationSeconds: 0.58,
  startClearance: 13,
});

export const IMPACT = Object.freeze({
  cameraEnergyPerStone: 0.42,
  cameraEnergyLimit: 1.35,
  cameraDecayPerSecond: 5.4,
  lightEnergyPerStone: 58,
  lightEnergyLimit: 140,
  lightDecayPerSecond: 14,
});

export const CAMERA = Object.freeze({
  fovDegrees: 34,
  near: 0.1,
  far: 100,
  framingMargin: 1.2,
});
