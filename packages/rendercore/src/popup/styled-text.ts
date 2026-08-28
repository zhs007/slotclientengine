import {
  CanvasTextMetrics,
  Container,
  FillGradient,
  Graphics,
  Text,
  TextStyle,
  type TextStyleOptions,
} from "pixi.js";
import type {
  PopupAnchor,
  PopupTextFill,
  PopupTextStyle,
  PopupTextWidthRange,
} from "./types.js";
import { resolvePopupTextFontSize } from "./text-width-fit.js";

export interface PopupStyledTextLayout {
  readonly authoredFontSize: number;
  readonly effectiveFontSize: number;
  readonly width: number;
  readonly height: number;
}

export interface PopupStyledTextRenderer {
  readonly container: Container;
  readonly text: string;
  readonly layout: PopupStyledTextLayout;
  setText(text: string): void;
  setPresentation(options: {
    readonly family: string;
    readonly style: PopupTextStyle;
    readonly anchor: PopupAnchor;
  }): void;
  setWidthGuideVisible(visible: boolean): void;
  destroy(): void;
}

const styledTextRenderers = new WeakMap<Container, PopupStyledTextRenderer>();

/** @internal Editor-only traversal over the existing production display tree. */
export function setPopupTextWidthGuidesInTree(
  root: Container,
  visible: boolean,
): void {
  const pending: Container[] = [root];
  while (pending.length) {
    const current = pending.pop()!;
    styledTextRenderers.get(current)?.setWidthGuideVisible(visible);
    for (const child of current.children)
      if (child instanceof Container) pending.push(child);
  }
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
  let active = build(text, family, style, anchor);
  let guide: Graphics | null = null;
  let guideVisible = false;
  let destroyed = false;
  container.addChild(active.container);

  function measureWidth(
    value: string,
    candidateFamily: string,
    candidateStyle: PopupTextStyle,
  ): number {
    const measurementStyle = new TextStyle(
      toTextStyle(candidateFamily, candidateStyle, null),
    );
    try {
      const measure =
        options.measureText ??
        ((part: string, style: TextStyle) =>
          CanvasTextMetrics.measureText(part, style).width);
      if (candidateStyle.arcDegrees === 0)
        return validateMetric(measure(value, measurementStyle));
      const graphemes = segmentGraphemes(value);
      const widths = graphemes.map((part) =>
        validateMetric(measure(part, measurementStyle)),
      );
      return curvedGeometry(widths, candidateStyle).bounds.width;
    } finally {
      measurementStyle.destroy();
    }
  }

  function build(
    value: string,
    nextFamily: string,
    nextStyle: PopupTextStyle,
    nextAnchor: PopupAnchor,
  ): PreparedStyledText {
    const fit = resolvePopupTextFontSize({
      authoredFontSize: nextStyle.fontSize,
      widthRange: nextStyle.widthRange,
      empty: value.length === 0,
      measureWidth: (fontSize) =>
        measureWidth(value, nextFamily, { ...nextStyle, fontSize }),
    });
    const effectiveStyle = { ...nextStyle, fontSize: fit.fontSize };
    if (effectiveStyle.arcDegrees === 0) {
      const gradient = createGradient(effectiveStyle.fill);
      const textStyle = new TextStyle(
        toTextStyle(nextFamily, effectiveStyle, gradient),
      );
      const display = new Text({ text: value, style: textStyle });
      display.anchor.set(nextAnchor.x, nextAnchor.y);
      return {
        container: display,
        layout: Object.freeze({
          authoredFontSize: nextStyle.fontSize,
          effectiveFontSize: fit.fontSize,
          width: fit.width,
          height: fit.fontSize,
        }),
        destroy() {
          display.destroy();
          gradient?.destroy();
          textStyle.destroy();
        },
      };
    }

    const group = new Container();
    const graphemes = segmentGraphemes(value);
    const measurementStyle = new TextStyle(
      toTextStyle(nextFamily, effectiveStyle, null),
    );
    const measure =
      options.measureText ??
      ((part: string, style: TextStyle) =>
        CanvasTextMetrics.measureText(part, style).width);
    let widths: readonly number[];
    try {
      widths = graphemes.map((part) =>
        validateMetric(measure(part, measurementStyle)),
      );
    } finally {
      measurementStyle.destroy();
    }
    const geometry = curvedGeometry(widths, effectiveStyle);
    const gradient = createGradient(effectiveStyle.fill);
    const textStyle = new TextStyle(
      toTextStyle(nextFamily, effectiveStyle, gradient),
    );
    const graphemeStyles: TextStyle[] = [];
    for (let index = 0; index < graphemes.length; index += 1) {
      const graphemeStyle = gradient ? textStyle.clone() : textStyle;
      if (gradient) {
        graphemeStyle._gradientBounds = {
          width: Math.max(1, geometry.total),
          height: Math.max(1, fit.fontSize),
        };
        graphemeStyle._gradientOffset = {
          x: -(geometry.cursors[index]! + geometry.total / 2),
          y: 0,
        };
        graphemeStyles.push(graphemeStyle);
      }
      const display = new Text({
        text: graphemes[index]!,
        style: graphemeStyle,
      });
      display.anchor.set(0.5, 0.5);
      const box = geometry.boxes[index]!;
      display.position.set(box.x, box.y);
      display.rotation = box.rotation;
      group.addChild(display);
    }
    group.pivot.set(
      geometry.bounds.x + geometry.bounds.width * nextAnchor.x,
      geometry.bounds.y + geometry.bounds.height * nextAnchor.y,
    );
    return {
      container: group,
      layout: Object.freeze({
        authoredFontSize: nextStyle.fontSize,
        effectiveFontSize: fit.fontSize,
        width: geometry.bounds.width,
        height: geometry.bounds.height,
      }),
      destroy() {
        group.destroy({ children: true });
        for (const graphemeStyle of graphemeStyles) graphemeStyle.destroy();
        gradient?.destroy();
        textStyle.destroy();
      },
    };
  }

  function commit(prepared: PreparedStyledText): void {
    container.addChild(prepared.container);
    container.removeChild(active.container);
    active.destroy();
    active = prepared;
    redrawGuide();
  }

  function redrawGuide(): void {
    if (!guideVisible || !enabledRange(style.widthRange)) {
      guide?.destroy();
      guide = null;
      return;
    }
    guide ??= new Graphics();
    guide.eventMode = "none";
    guide.clear();
    const range = style.widthRange!;
    const top = -active.layout.height * anchor.y;
    const height = Math.max(1, active.layout.height);
    const maxLeft = -range.maxWidth * anchor.x;
    const minLeft = -range.minWidth * anchor.x;
    guide
      .rect(maxLeft, top, range.maxWidth, height)
      .stroke({ color: 0x5d7cff, width: 1 });
    guide
      .moveTo(minLeft, top)
      .lineTo(minLeft, top + height)
      .moveTo(minLeft + range.minWidth, top)
      .lineTo(minLeft + range.minWidth, top + height)
      .stroke({ color: 0xffcc66, width: 1 });
    if (guide.parent !== container) container.addChildAt(guide, 0);
  }

  const renderer: PopupStyledTextRenderer = Object.freeze({
    container,
    get text() {
      assertUsable();
      return text;
    },
    get layout() {
      assertUsable();
      return active.layout;
    },
    setText(value: string) {
      assertUsable();
      const validated = validatePopupStyledText(value);
      if (validated === text) return;
      const prepared = build(validated, family, style, anchor);
      commit(prepared);
      text = validated;
    },
    setPresentation(next: {
      readonly family: string;
      readonly style: PopupTextStyle;
      readonly anchor: PopupAnchor;
    }) {
      assertUsable();
      const prepared = build(text, next.family, next.style, next.anchor);
      commit(prepared);
      family = next.family;
      style = next.style;
      anchor = next.anchor;
      redrawGuide();
    },
    setWidthGuideVisible(visible: boolean) {
      assertUsable();
      guideVisible = visible;
      redrawGuide();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      styledTextRenderers.delete(container);
      guide?.destroy();
      guide = null;
      active.destroy();
      container.destroy({ children: false });
    },
  });
  styledTextRenderers.set(container, renderer);
  return renderer;

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
  readonly layout: PopupStyledTextLayout;
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

function curvedGeometry(widths: readonly number[], style: PopupTextStyle) {
  const spacing = style.letterSpacing;
  const total = Math.max(
    0,
    widths.reduce((sum, width) => sum + width, 0) +
      spacing * Math.max(0, widths.length - 1),
  );
  const arcRadians = (style.arcDegrees * Math.PI) / 180;
  const radius = total === 0 ? 0 : total / Math.abs(arcRadians);
  let cursor = -total / 2;
  const cursors: number[] = [];
  const boxes: Array<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly rotation: number;
  }> = [];
  for (const width of widths) {
    cursors.push(cursor);
    const center = cursor + width / 2;
    const angle = radius === 0 ? 0 : center / radius;
    boxes.push({
      x: Math.sin(angle) * radius,
      y: Math.sign(arcRadians) * radius * (1 - Math.cos(angle)),
      width,
      rotation: Math.sign(arcRadians) * angle,
    });
    cursor += width + spacing;
  }
  return Object.freeze({
    total,
    cursors: Object.freeze(cursors),
    boxes: Object.freeze(boxes),
    bounds: approximateBounds(boxes, style.fontSize),
  });
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

function validateMetric(width: number): number {
  if (!Number.isFinite(width) || width < 0)
    throw new Error(
      "popup styled text metrics must be finite and non-negative.",
    );
  return width;
}

function enabledRange(
  range: PopupTextWidthRange | undefined,
): range is PopupTextWidthRange {
  return Boolean(range && range.minWidth > 0 && range.maxWidth > 0);
}
