import type {
  Game003MinecartInteractionConfig,
  Game003MinecartPoint,
} from "./minecart-interaction-config.js";
import type { Game003Layout, Point } from "./game-layout.js";

export interface Game003MinecartInteractionLayout {
  readonly orientation: "landscape" | "portrait";
  readonly cartStartCenter: Point;
  readonly cartStopCenter: Point;
  readonly cartExitCenter: Point;
  readonly payloadStartCenter: Point;
  readonly payloadTargetCenter: Point;
  readonly cartPivotInImage: Point;
  readonly payloadAnchorInImage: Point;
}

export function createGame003MinecartInteractionLayout(options: {
  readonly layout: Game003Layout;
  readonly config: Game003MinecartInteractionConfig;
}): Game003MinecartInteractionLayout {
  const variant = options.config.layout[options.layout.orientation];
  if (!variant) {
    throw new Error(
      `game003 minecart layout is missing ${options.layout.orientation}.`,
    );
  }
  const reelArea = options.layout.sceneParts.reelArea;
  const reelAreaBottomCenter = {
    x: reelArea.x + reelArea.width / 2,
    y: reelArea.y + reelArea.height,
  };
  const cartStopCenter = addPoint(
    reelAreaBottomCenter,
    variant.stopOffsetFromReelAreaBottomCenter,
  );
  const cartStartCenter = createOffscreenCartCenter({
    visibleRect: options.layout.visibleRect,
    imageSize: options.config.imageSize,
    cartPivotInImage: variant.cartPivotInImage,
    offscreenMargin: variant.offscreenMargin,
    side: variant.entrySide,
    y: cartStopCenter.y,
  });
  const cartExitCenter = createOffscreenCartCenter({
    visibleRect: options.layout.visibleRect,
    imageSize: options.config.imageSize,
    cartPivotInImage: variant.cartPivotInImage,
    offscreenMargin: variant.offscreenMargin,
    side: variant.exitSide,
    y: cartStopCenter.y,
  });
  const payloadStartCenter = Object.freeze({
    x:
      cartStopCenter.x +
      variant.payloadAnchorInImage.x -
      variant.cartPivotInImage.x,
    y:
      cartStopCenter.y +
      variant.payloadAnchorInImage.y -
      variant.cartPivotInImage.y,
  });
  const payloadTargetCenter = Object.freeze({
    x: reelArea.x + reelArea.width / 2,
    y: reelArea.y + reelArea.height / 2,
  });

  return Object.freeze({
    orientation: options.layout.orientation,
    cartStartCenter,
    cartStopCenter,
    cartExitCenter,
    payloadStartCenter,
    payloadTargetCenter,
    cartPivotInImage: freezePoint(variant.cartPivotInImage),
    payloadAnchorInImage: freezePoint(variant.payloadAnchorInImage),
  });
}

function createOffscreenCartCenter(options: {
  readonly visibleRect: Game003Layout["visibleRect"];
  readonly imageSize: { readonly width: number; readonly height: number };
  readonly cartPivotInImage: Game003MinecartPoint;
  readonly offscreenMargin: number;
  readonly side: "left" | "right";
  readonly y: number;
}): Point {
  const x =
    options.side === "left"
      ? options.visibleRect.x -
        (options.imageSize.width - options.cartPivotInImage.x) -
        options.offscreenMargin
      : options.visibleRect.x +
        options.visibleRect.width +
        options.cartPivotInImage.x +
        options.offscreenMargin;
  return Object.freeze({ x, y: options.y });
}

function addPoint(left: Point, right: Point): Point {
  return Object.freeze({
    x: left.x + right.x,
    y: left.y + right.y,
  });
}

function freezePoint(point: Point): Point {
  return Object.freeze({ x: point.x, y: point.y });
}
