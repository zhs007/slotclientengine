import { getSlotGameStaticSkin } from "@slotclientengine/gameframeworks/static-config";
import {
  createWinAmountAnimationPlayer,
  createWinAmountAnimationTiersFromManifestModules,
  type WinAmountAnimationConfig,
  type WinAmountAnimationLayout,
  type WinAmountAnimationPlayer,
  type WinAmountAnimationTier,
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
    tiers: assertGame003WinAmountTierThresholds(
      createWinAmountAnimationTiersFromManifestModules({
        manifest: winAmount.animations.manifest,
        projectModules: winAmount.animations.projectModules,
        assetModules: winAmount.animations.assetModules,
      }),
      {
        bigwin: winAmount.thresholds.bigMultiplier,
        superwin: winAmount.thresholds.superMultiplier,
        megawin: winAmount.thresholds.megaMultiplier,
      },
    ),
  });
}

function assertGame003WinAmountTierThresholds(
  tiers: readonly WinAmountAnimationTier[],
  expected: Readonly<Record<"bigwin" | "superwin" | "megawin", number>>,
): readonly WinAmountAnimationTier[] {
  const thresholdById = new Map(
    tiers.map((tier) => [tier.id, tier.thresholdMultiplier]),
  );
  for (const [id, expectedMultiplier] of Object.entries(expected)) {
    const actual = thresholdById.get(id);
    if (actual !== expectedMultiplier) {
      throw new Error(
        `game003 win amount tier "${id}" thresholdMultiplier must match YAML thresholds.`,
      );
    }
  }
  if (thresholdById.size !== Object.keys(expected).length) {
    throw new Error(
      "game003 win amount manifest must only define bigwin, superwin and megawin tiers.",
    );
  }
  return tiers;
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
