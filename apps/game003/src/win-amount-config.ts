import { getSlotGameStaticSkin } from "@slotclientengine/gameframeworks/static-config";
import {
  createWinAmountAnimationPlayer,
  createWinAmountAnimationTiersFromModules,
  type WinAmountAnimationConfig,
  type WinAmountAnimationLayout,
  type WinAmountAnimationPlayer,
} from "@slotclientengine/rendercore/win-amount";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";
import { SERVER_USD_AMOUNT_SCALE, formatServerUsdAmount } from "./money.js";
import type { Game003Layout, Point, Rect } from "./game-layout.js";

const GAME003_STATIC_SKIN = getSlotGameStaticSkin(GAME003_STATIC_CONFIG, "1");

export function createGame003WinAmountPlayer(
  layout: Game003Layout,
): WinAmountAnimationPlayer {
  return createWinAmountAnimationPlayer({
    config: createGame003WinAmountAnimationConfig(layout),
  });
}

export function createGame003WinAmountAnimationConfig(
  layout: Game003Layout,
): WinAmountAnimationConfig {
  const winAmount = requireGame003WinAmountConfig();
  if (winAmount.amountScale !== SERVER_USD_AMOUNT_SCALE) {
    throw new Error(
      "game003 win amount amountScale must match formatServerUsdAmount.",
    );
  }
  return Object.freeze({
    formatter: formatServerUsdAmount,
    minorCountDurationSeconds: winAmount.minorCountDurationSeconds,
    majorCountDurationSeconds: winAmount.majorCountDurationSeconds,
    thresholdMultipliers: Object.freeze({
      minor: winAmount.thresholds.minorMultiplier,
      big: winAmount.thresholds.bigMultiplier,
      super: winAmount.thresholds.superMultiplier,
      mega: winAmount.thresholds.megaMultiplier,
    }),
    textStyle: Object.freeze({
      minorFontSize: winAmount.text.minorFontSize,
      majorFontSize: winAmount.text.majorFontSize,
      fill: winAmount.text.fill,
      stroke: winAmount.text.stroke,
      strokeWidth: winAmount.text.strokeWidth,
    }),
    layout: createGame003WinAmountLayout(layout),
    tiers: createWinAmountAnimationTiersFromModules({
      tierConfigs: winAmount.animations.tiers,
      projectModules: winAmount.animations.projectModules,
      assetModules: winAmount.animations.assetModules,
    }),
  });
}

export function createGame003WinAmountLayout(
  layout: Game003Layout,
): WinAmountAnimationLayout {
  const winAmount = requireGame003WinAmountConfig();
  return Object.freeze({
    minorTextPosition: addPoints(
      resolveWinAmountAnchor(
        winAmount.layout.minorAnchor,
        layout.sceneParts.reelArea,
      ),
      winAmount.layout.minorOffset,
    ),
    majorTextPosition: addPoints(
      resolveWinAmountAnchor(
        winAmount.layout.majorAnchor,
        layout.sceneParts.reelArea,
      ),
      winAmount.layout.majorOffset,
    ),
    tierStageRect: layout.backgroundFrame,
  });
}

function requireGame003WinAmountConfig() {
  const winAmount = GAME003_STATIC_SKIN.winAmount;
  if (!winAmount) {
    throw new Error("game003 skin 1 winAmount config is required.");
  }
  return winAmount;
}

function resolveWinAmountAnchor(anchor: string, reelArea: Rect): Point {
  if (anchor === "reel-area-bottom-center") {
    return Object.freeze({
      x: reelArea.x + reelArea.width / 2,
      y: reelArea.y + reelArea.height,
    });
  }
  if (anchor === "reel-area-center") {
    return Object.freeze({
      x: reelArea.x + reelArea.width / 2,
      y: reelArea.y + reelArea.height / 2,
    });
  }
  throw new Error(`Unsupported game003 win amount anchor "${anchor}".`);
}

function addPoints(left: Point, right: Point): Point {
  return Object.freeze({
    x: left.x + right.x,
    y: left.y + right.y,
  });
}
