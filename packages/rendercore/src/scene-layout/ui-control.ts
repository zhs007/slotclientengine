import { SceneLayoutError } from "./errors.js";
import type {
  SceneLayoutImageResourceSpec,
  SceneLayoutStepSliderControlSpec,
  SceneLayoutUiControlSpec,
} from "./types.js";

export function collectSceneLayoutUiControlImages(
  control: SceneLayoutUiControlSpec,
): readonly SceneLayoutImageResourceSpec[] {
  switch (control.kind) {
    case "radio":
      return Object.freeze([control.off, control.on]);
    case "step-slider":
      return Object.freeze([control.track, control.thumb]);
  }
}

export function resolveSceneLayoutUiControlSize(
  control: SceneLayoutUiControlSpec,
): Readonly<{ width: number; height: number }> {
  switch (control.kind) {
    case "radio":
      return control.off.size;
    case "step-slider":
      return Object.freeze({
        width: control.track.size.width,
        height: Math.max(control.track.size.height, control.thumb.size.height),
      });
  }
}

export function resolveStepSliderPosition(
  control: SceneLayoutStepSliderControlSpec,
  state: number,
): number {
  assertStepSliderState(control, state);
  const travel = control.track.size.width - control.thumb.size.width;
  return -travel / 2 + (travel * state) / (control.steps - 1);
}

export function resolveNearestStepSliderState(
  control: SceneLayoutStepSliderControlSpec,
  localX: number,
): number {
  if (!Number.isFinite(localX))
    throw new SceneLayoutError(
      "Scene layout step-slider position must be finite.",
    );
  const travel = control.track.size.width - control.thumb.size.width;
  const clamped = Math.max(-travel / 2, Math.min(travel / 2, localX));
  return Math.round(((clamped + travel / 2) / travel) * (control.steps - 1));
}

export function clampStepSliderPosition(
  control: SceneLayoutStepSliderControlSpec,
  localX: number,
): number {
  if (!Number.isFinite(localX))
    throw new SceneLayoutError(
      "Scene layout step-slider position must be finite.",
    );
  const halfTravel = (control.track.size.width - control.thumb.size.width) / 2;
  return Math.max(-halfTravel, Math.min(halfTravel, localX));
}

export function assertStepSliderState(
  control: SceneLayoutStepSliderControlSpec,
  state: number,
): void {
  if (!Number.isSafeInteger(state) || state < 0 || state >= control.steps)
    throw new SceneLayoutError(
      `Scene layout step-slider state must be a safe integer between 0 and ${control.steps - 1}.`,
    );
}
