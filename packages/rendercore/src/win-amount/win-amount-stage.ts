import { Container, Text } from "pixi.js";
import type {
  WinAmountAnimationLayout,
  WinAmountAnimationTextStyle,
} from "./types.js";

export class WinAmountStage {
  readonly container = new Container();
  readonly effectLayer = new Container();
  readonly textLayer = new Container();
  readonly text: Text;
  readonly #textStyle: WinAmountAnimationTextStyle;
  #layout: WinAmountAnimationLayout;

  constructor(options: {
    readonly layout: WinAmountAnimationLayout;
    readonly textStyle: WinAmountAnimationTextStyle;
  }) {
    this.#layout = options.layout;
    this.#textStyle = options.textStyle;
    this.text = new Text({
      text: "",
      style: createPixiTextStyle(options.textStyle, "minor"),
    });
    this.text.anchor.set(0.5);
    this.text.visible = false;
    this.container.addChild(this.effectLayer, this.textLayer);
    this.textLayer.addChild(this.text);
    this.applyLayout(options.layout);
  }

  applyLayout(layout: WinAmountAnimationLayout): void {
    assertLayout(layout);
    this.#layout = layout;
    this.applyEffectLayerLayout();
    if (this.text.visible) {
      const mode =
        this.text.style.fontSize === this.#textStyle.majorFontSize
          ? "major"
          : "minor";
      this.applyTextPosition(mode);
    }
  }

  showText(text: string, mode: "minor" | "major"): void {
    if (text.trim().length === 0) {
      throw new Error("win amount formatter must return non-empty text.");
    }
    this.text.text = text;
    this.text.style = createPixiTextStyle(this.#textStyle, mode);
    this.text.visible = true;
    this.applyTextPosition(mode);
  }

  clear(): void {
    this.text.text = "";
    this.text.visible = false;
    this.effectLayer.removeChildren();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private applyTextPosition(mode: "minor" | "major"): void {
    const point =
      mode === "minor"
        ? this.#layout.minorTextPosition
        : this.#layout.majorTextPosition;
    this.text.position.set(point.x, point.y);
  }

  private applyEffectLayerLayout(): void {
    const rect = this.#layout.tierStageRect;
    this.effectLayer.position.set(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
  }
}

export function applyTierContainerLayout(
  container: Container,
  layout: WinAmountAnimationLayout,
  projectStage: { readonly width: number; readonly height: number },
): void {
  const rect = layout.tierStageRect;
  container.position.set(0, 0);
  container.scale.set(
    rect.width / projectStage.width,
    rect.height / projectStage.height,
  );
}

export function alignWinAmountVniRoot(
  root: Container,
  projectStage: { readonly width: number; readonly height: number },
): void {
  root.pivot.set(projectStage.width / 2, projectStage.height / 2);
  root.position.set(0, 0);
  root.scale.set(1);
}

function createPixiTextStyle(
  style: WinAmountAnimationTextStyle,
  mode: "minor" | "major",
) {
  return {
    fontFamily: style.fontFamily ?? "Arial",
    fontSize: mode === "minor" ? style.minorFontSize : style.majorFontSize,
    fontWeight: style.fontWeight ?? "900",
    fill: style.fill,
    stroke: {
      color: style.stroke,
      width: style.strokeWidth,
    },
    align: "center" as const,
  };
}

function assertLayout(layout: WinAmountAnimationLayout): void {
  for (const [label, point] of [
    ["minorTextPosition", layout.minorTextPosition],
    ["majorTextPosition", layout.majorTextPosition],
  ] as const) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error(`win amount ${label} must be finite.`);
    }
  }
  const rect = layout.tierStageRect;
  for (const key of ["x", "y", "width", "height"] as const) {
    if (!Number.isFinite(rect[key])) {
      throw new Error(`win amount tierStageRect.${key} must be finite.`);
    }
  }
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error("win amount tierStageRect size must be positive.");
  }
}
