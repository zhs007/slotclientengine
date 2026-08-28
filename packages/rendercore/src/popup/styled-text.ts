import {
  CanvasTextMetrics,
  Container,
  FillGradient,
  Text,
  TextStyle,
  type TextStyleOptions,
} from "pixi.js";
import type { PopupAnchor, PopupTextFill, PopupTextStyle } from "./types.js";

export interface PopupStyledTextRenderer {
  readonly container: Container;
  readonly text: string;
  setText(text: string): void;
  setPresentation(options: {
    readonly family: string;
    readonly style: PopupTextStyle;
    readonly anchor: PopupAnchor;
  }): void;
  destroy(): void;
}

export function createPopupStyledText(options: {
  readonly family: string;
  readonly text: string;
  readonly style: PopupTextStyle;
  readonly anchor: PopupAnchor;
  readonly measureText?: (text: string, style: TextStyle) => number;
}): PopupStyledTextRenderer {
  let text = validatePopupStyledText(options.text);
  let family = options.family;
  let style = options.style;
  let anchor = options.anchor;
  const container = new Container();
  let active = build(text);
  let destroyed = false;
  container.addChild(active.container);

  function build(value: string): PreparedStyledText {
    if (style.arcDegrees === 0) {
      const gradient = createGradient(style.fill);
      const textStyle = new TextStyle(toTextStyle(family, style, gradient));
      const display = new Text({ text: value, style: textStyle });
      display.anchor.set(anchor.x, anchor.y);
      return {
        container: display,
        destroy() {
          display.destroy();
          gradient?.destroy();
          textStyle.destroy();
        },
      };
    }
    const group = new Container();
    const graphemes = segmentGraphemes(value);
    const measurementStyle = new TextStyle(toTextStyle(family, style, null));
    const measure =
      options.measureText ??
      ((part: string, style: TextStyle) =>
        CanvasTextMetrics.measureText(part, style).width);
    const widths = graphemes.map((part) => measure(part, measurementStyle));
    if (widths.some((width) => !Number.isFinite(width) || width < 0)) {
      measurementStyle.destroy();
      throw new Error(
        "popup styled text metrics must be finite and non-negative.",
      );
    }
    const spacing = style.letterSpacing;
    const total = Math.max(
      0,
      widths.reduce((sum, width) => sum + width, 0) +
        spacing * Math.max(0, widths.length - 1),
    );
    const gradient = createGradient(style.fill);
    const textStyle = new TextStyle(toTextStyle(family, style, gradient));
    const graphemeStyles: TextStyle[] = [];
    measurementStyle.destroy();
    const arcRadians = (style.arcDegrees * Math.PI) / 180;
    const radius = total === 0 ? 0 : total / Math.abs(arcRadians);
    let cursor = -total / 2;
    const boxes: Array<{
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly rotation: number;
    }> = [];
    for (let index = 0; index < graphemes.length; index += 1) {
      const width = widths[index]!;
      const center = cursor + width / 2;
      const angle = radius === 0 ? 0 : center / radius;
      const graphemeStyle = gradient ? textStyle.clone() : textStyle;
      if (gradient) {
        // Pixi renders every grapheme into its own canvas. Give each canvas the
        // complete uncurved text bounds and its offset within those bounds so
        // the local gradient remains continuous before the glyph is curved.
        graphemeStyle._gradientBounds = {
          width: Math.max(1, total),
          height: Math.max(1, style.fontSize),
        };
        graphemeStyle._gradientOffset = {
          x: -(cursor + total / 2),
          y: 0,
        };
        graphemeStyles.push(graphemeStyle);
      }
      const display = new Text({
        text: graphemes[index]!,
        style: graphemeStyle,
      });
      display.anchor.set(0.5, 0.5);
      display.position.set(
        Math.sin(angle) * radius,
        Math.sign(arcRadians) * radius * (1 - Math.cos(angle)),
      );
      display.rotation = Math.sign(arcRadians) * angle;
      group.addChild(display);
      boxes.push({
        x: display.x,
        y: display.y,
        width,
        rotation: display.rotation,
      });
      cursor += width + spacing;
    }
    const bounds = approximateBounds(boxes, style.fontSize);
    group.pivot.set(
      bounds.x + bounds.width * anchor.x,
      bounds.y + bounds.height * anchor.y,
    );
    return {
      container: group,
      destroy() {
        group.destroy({ children: true });
        for (const graphemeStyle of graphemeStyles) graphemeStyle.destroy();
        gradient?.destroy();
        textStyle.destroy();
      },
    };
  }

  return Object.freeze({
    container,
    get text() {
      assertUsable();
      return text;
    },
    setText(value: string) {
      assertUsable();
      const validated = validatePopupStyledText(value);
      if (validated === text) return;
      const prepared = build(validated);
      container.addChild(prepared.container);
      container.removeChild(active.container);
      active.destroy();
      active = prepared;
      text = validated;
    },
    setPresentation(next: {
      readonly family: string;
      readonly style: PopupTextStyle;
      readonly anchor: PopupAnchor;
    }) {
      assertUsable();
      family = next.family;
      style = next.style;
      anchor = next.anchor;
      const prepared = build(text);
      container.addChild(prepared.container);
      container.removeChild(active.container);
      active.destroy();
      active = prepared;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      active.destroy();
      container.destroy({ children: false });
    },
  });

  function assertUsable() {
    if (destroyed) throw new Error("popup styled text renderer was destroyed.");
  }
}

export function validatePopupStyledText(value: string): string {
  if (typeof value !== "string") throw new Error("popup text must be string.");
  if (value.normalize("NFC") !== value)
    throw new Error("popup text must use Unicode NFC.");
  if (/\p{Cc}|[\u2028\u2029]/u.test(value))
    throw new Error("popup text must be a single line without controls.");
  return value;
}

interface PreparedStyledText {
  readonly container: Container;
  destroy(): void;
}

function toTextStyle(
  family: string,
  style: PopupTextStyle,
  gradient: FillGradient | null,
): TextStyleOptions {
  return {
    fontFamily: [family, "sans-serif"],
    fontSize: style.fontSize,
    letterSpacing: style.letterSpacing,
    fill:
      gradient ??
      (style.fill.kind === "solid"
        ? style.fill.color
        : style.fill.stops[0]!.color),
    ...(style.stroke
      ? { stroke: { color: style.stroke.color, width: style.stroke.width } }
      : {}),
    ...(style.shadow
      ? {
          dropShadow: {
            color: style.shadow.color,
            alpha: style.shadow.alpha,
            blur: style.shadow.blur,
            distance: style.shadow.distance,
            angle: (style.shadow.angleDegrees * Math.PI) / 180,
          },
        }
      : {}),
    whiteSpace: "pre",
  };
}

function createGradient(fill: PopupTextFill): FillGradient | null {
  if (fill.kind === "solid") return null;
  const radians = (fill.angleDegrees * Math.PI) / 180;
  const dx = Math.cos(radians) / 2;
  const dy = Math.sin(radians) / 2;
  return new FillGradient({
    type: "linear",
    start: { x: 0.5 - dx, y: 0.5 - dy },
    end: { x: 0.5 + dx, y: 0.5 + dy },
    colorStops: fill.stops.map((stop) => ({ ...stop })),
    textureSpace: "local",
  });
}

function segmentGraphemes(value: string): readonly string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Object.freeze(
    [...segmenter.segment(value)].map(({ segment }) => segment),
  );
}

function approximateBounds(
  boxes: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly rotation: number;
  }[],
  height: number,
) {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    const cosine = Math.cos(box.rotation);
    const sine = Math.sin(box.rotation);
    for (const x of [-box.width / 2, box.width / 2])
      for (const y of [-height / 2, height / 2]) {
        const rotatedX = box.x + x * cosine - y * sine;
        const rotatedY = box.y + x * sine + y * cosine;
        minX = Math.min(minX, rotatedX);
        minY = Math.min(minY, rotatedY);
        maxX = Math.max(maxX, rotatedX);
        maxY = Math.max(maxY, rotatedY);
      }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
