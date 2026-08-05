import { Text } from "pixi.js";
import type { PopupPromptSpec } from "./types.js";

const LINE_TERMINATOR = /[\n\r\u2028\u2029]/u;
export const DEFAULT_POPUP_PROMPT_FONT_FAMILY = Object.freeze([
  "system-ui",
  "sans-serif",
]);

export function validatePopupPromptText(value: string, label = "prompt text") {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`${label} must be a non-empty string.`);
  if (LINE_TERMINATOR.test(value))
    throw new Error(`${label} must be a single line.`);
  return value;
}

export function createPopupPromptText(options: {
  readonly spec: PopupPromptSpec;
  readonly family?: string;
  readonly measureText?: (text: Text) => {
    readonly width: number;
    readonly height: number;
  };
}) {
  const text = new Text({
    text: options.spec.defaultText,
    anchor: 0.5,
    style: {
      fontFamily: options.family
        ? [options.family, "sans-serif"]
        : [...DEFAULT_POPUP_PROMPT_FONT_FAMILY],
      fontSize: options.spec.area.height,
      fill: options.spec.fill,
      wordWrap: false,
    },
  });
  text.position.set(options.spec.area.x, options.spec.area.y);
  text.visible = false;
  const setText = (value: string) => {
    text.text = validatePopupPromptText(value);
    text.style.fontSize = options.spec.area.height;
    text.scale.set(1);
    const metrics = options.measureText?.(text) ?? {
      width: text.width,
      height: text.height,
    };
    const scale = fitPopupPromptScale(options.spec.area, metrics);
    text.scale.set(scale);
  };
  setText(options.spec.defaultText);
  return Object.freeze({ text, setText });
}

export function fitPopupPromptScale(
  area: { readonly width: number; readonly height: number },
  metrics: { readonly width: number; readonly height: number },
) {
  if (
    !(metrics.width > 0) ||
    !(metrics.height > 0) ||
    !Number.isFinite(metrics.width + metrics.height)
  )
    throw new Error("popup prompt text metrics must be finite and positive.");
  const scale = Math.min(
    1,
    area.width / metrics.width,
    area.height / metrics.height,
  );
  if (!(scale > 0) || !Number.isFinite(scale))
    throw new Error("popup prompt text fit scale must be finite and positive.");
  return scale;
}
