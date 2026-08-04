import {
  createSceneLayoutPackageResource,
  type DecodeImageStringImage,
  type SceneLayoutPackageResource,
  type SymbolPackageResource,
} from "@slotclientengine/rendercore";
import {
  getGame003CoinOverlayConfig,
  type Game003CoinOverlayConfig,
} from "./coin-overlay-config.js";
import { GAME003_RUNTIME_CONFIG } from "./runtime-config.js";
import {
  getGame003WinSymbolLoopConfig,
  type Game003WinSymbolLoopConfig,
} from "./win-symbol-loop-config.js";
import {
  GAME003_SUPPORTED_SKINS,
  parseGame003SkinId,
  type Game003SkinId,
} from "./skin-id.js";

export interface Game003SkinConfig {
  readonly id: "2";
  readonly label: string;
  readonly rawGameConfig: unknown;
  readonly reelsName: string;
  readonly resource: SceneLayoutPackageResource;
  readonly symbolPackage: SymbolPackageResource;
  readonly initialMode: string;
  readonly awardCelebrationPopup: string;
  readonly winSymbolLoop: Game003WinSymbolLoopConfig;
  readonly coinOverlay: Game003CoinOverlayConfig;
}

export interface Game003SkinResourceOwner {
  destroy(): Promise<void> | void;
}

export async function prepareGame003SkinConfig(
  id: Game003SkinId,
  options: {
    readonly minecart2Files?: ReadonlyMap<string, Uint8Array>;
    readonly decodeImage?: DecodeImageStringImage;
  } = {},
): Promise<{
  readonly skin: Game003SkinConfig;
  readonly resourceOwner: Game003SkinResourceOwner;
}> {
  if (id !== "2") {
    throw new Error('game003 production configuration only supports skin "2".');
  }
  if (!options.minecart2Files) {
    throw new Error("game003 skin=2 requires loaded minecart2 package files.");
  }
  const resource = await createSceneLayoutPackageResource({
    files: options.minecart2Files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
  });
  try {
    const gameModes = resource.manifest.gameModes;
    if (!gameModes) {
      throw new Error("game003 minecart2 layout must declare gameModes.");
    }
    const initialMode = gameModes.modes.find(
      (mode) => mode.id === gameModes.initialMode,
    );
    if (!initialMode?.symbolPackage) {
      throw new Error(
        "game003 minecart2 initial mode must declare a symbol package.",
      );
    }
    if (!initialMode.awardCelebrationPopup) {
      throw new Error(
        "game003 minecart2 initial mode must declare an award celebration popup.",
      );
    }
    const symbolBinding =
      resource.manifest.symbolPackages?.[initialMode.symbolPackage];
    const symbolPackage = resource.symbolPackages[initialMode.symbolPackage];
    if (!symbolBinding || !symbolPackage) {
      throw new Error(
        `game003 minecart2 symbol package "${initialMode.symbolPackage}" is unavailable.`,
      );
    }
    const geometry = resource.manifest.reels.main;
    if (!geometry || geometry.columns !== 5 || geometry.rows !== 5) {
      throw new Error("game003 minecart2 reels.main geometry must be 5x5.");
    }
    if (
      symbolBinding.renderMode !== "standard" ||
      symbolBinding.reelSet !== "bg-reel01"
    ) {
      throw new Error(
        "game003 minecart2 must use standard bg-reel01 presentation.",
      );
    }
    if (!resource.popupPackages[initialMode.awardCelebrationPopup]) {
      throw new Error(
        `game003 minecart2 popup "${initialMode.awardCelebrationPopup}" is unavailable.`,
      );
    }
    const skin: Game003SkinConfig = Object.freeze({
      id: "2",
      label: "minecart2",
      rawGameConfig: symbolPackage.rawGameConfig,
      reelsName: symbolBinding.reelSet,
      resource,
      symbolPackage,
      initialMode: initialMode.id,
      awardCelebrationPopup: initialMode.awardCelebrationPopup,
      winSymbolLoop: getGame003WinSymbolLoopConfig(
        GAME003_RUNTIME_CONFIG.appExtensions,
      ),
      coinOverlay: getGame003CoinOverlayConfig(
        GAME003_RUNTIME_CONFIG.appExtensions,
      ),
    });
    return Object.freeze({ skin, resourceOwner: resource });
  } catch (error) {
    await resource.destroy();
    throw error;
  }
}

export { GAME003_SUPPORTED_SKINS, parseGame003SkinId, type Game003SkinId };
