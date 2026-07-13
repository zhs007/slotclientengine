import game002BigwinProject from "../../../assets/game002-s3/win-amount/bigwin.json";
import game002MegawinProject from "../../../assets/game002-s3/win-amount/megawin.json";
import game002SuperwinProject from "../../../assets/game002-s3/win-amount/superwin.json";
import game002WinAmountManifest from "../../../assets/game002-s3/win-amount/win-amount.manifest.json";
import {
  createWinAmountAnimationPlayer,
  createWinAmountAnimationTiersFromManifestModules,
  type WinAmountAnimationConfig,
  type WinAmountAnimationLayout,
  type WinAmountAnimationPlayer,
  type WinAmountAnimationTier,
} from "@slotclientengine/rendercore/win-amount";
import type { Game002Layout } from "./game-layout.js";
import { formatServerUsdAmount } from "./money.js";

const game002WinAmountProjectModules = Object.freeze({
  "../../../assets/game002-s3/win-amount/bigwin.json": game002BigwinProject,
  "../../../assets/game002-s3/win-amount/superwin.json": game002SuperwinProject,
  "../../../assets/game002-s3/win-amount/megawin.json": game002MegawinProject,
});

const game002WinAmountAssetModules = import.meta.glob(
  "../../../assets/game002-s3/win-amount/assets/*.{png,jpg,jpeg,webp}",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;

export function createGame002WinAmountPlayer(
  layout: Game002Layout,
): WinAmountAnimationPlayer {
  return createWinAmountAnimationPlayer({
    config: createGame002WinAmountAnimationConfig(layout),
  });
}

export function createGame002WinAmountAnimationConfig(
  layout: Game002Layout,
): WinAmountAnimationConfig {
  return Object.freeze({
    formatter: formatServerUsdAmount,
    minorCountDurationSeconds: 1.5,
    majorCountDurationSeconds: 3,
    thresholdMultipliers: Object.freeze({
      minor: 1,
      big: 15,
      super: 30,
      mega: 50,
    }),
    textStyle: Object.freeze({
      minorFontSize: 54,
      majorFontSize: 118,
      fill: "#fff7d6",
      stroke: "#5a2500",
      strokeWidth: 8,
    }),
    layout: createGame002WinAmountLayout(layout),
    tiers: assertTierThresholds(
      createWinAmountAnimationTiersFromManifestModules({
        manifest: game002WinAmountManifest,
        projectModules: game002WinAmountProjectModules,
        assetModules: game002WinAmountAssetModules,
      }),
    ),
  });
}

export function createGame002WinAmountLayout(
  layout: Game002Layout,
): WinAmountAnimationLayout {
  return Object.freeze({
    minorTextPosition: Object.freeze({
      x: layout.boardFrame.x + layout.boardFrame.width / 2,
      y: layout.boardFrame.y + layout.boardFrame.height - 28,
    }),
    majorTextPosition: Object.freeze({
      x: layout.boardFrame.x + layout.boardFrame.width / 2,
      y: layout.boardFrame.y + layout.boardFrame.height / 2,
    }),
    tierStageRect: layout.backgroundFrame,
  });
}

function assertTierThresholds(
  tiers: readonly WinAmountAnimationTier[],
): readonly WinAmountAnimationTier[] {
  const expected = Object.freeze({ bigwin: 15, superwin: 30, megawin: 50 });
  if (tiers.length !== Object.keys(expected).length) {
    throw new Error(
      "game002 win amount manifest must only define bigwin, superwin and megawin tiers.",
    );
  }
  for (const tier of tiers) {
    const threshold = expected[tier.id as keyof typeof expected];
    if (threshold === undefined || tier.thresholdMultiplier !== threshold) {
      throw new Error(
        `game002 win amount tier "${tier.id}" has an invalid thresholdMultiplier.`,
      );
    }
  }
  return tiers;
}
