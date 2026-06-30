import { getSlotGameStaticSkin } from "./runtime-helpers.js";
import type {
  SlotGameStaticConfig,
  SlotGameStaticFramePolicy,
  SlotGameStaticMargin,
  SlotGameStaticSize,
} from "./types.js";

export function createSlotGameFramePolicyFromStaticConfig(
  config: SlotGameStaticConfig,
  skinId: string,
): SlotGameStaticFramePolicy {
  const skin = getSlotGameStaticSkin(config, skinId);
  const art = skin.art;
  if (art.mode !== "orientation-focus") {
    throw new Error(
      `static config skin "${skinId}" uses unsupported art mode.`,
    );
  }

  return Object.freeze({
    mode: "orientation-focus",
    variants: Object.freeze({
      landscape: Object.freeze({
        maxDesignSize: freezeSize(art.variants.landscape.background),
        focusRect: freezeSize(art.variants.landscape.frameFocusRect),
        ...(art.variants.landscape.minFocusMargin
          ? {
              minFocusMargin: freezeMargin(
                art.variants.landscape.minFocusMargin,
              ),
            }
          : {}),
      }),
      portrait: Object.freeze({
        maxDesignSize: freezeSize(art.variants.portrait.background),
        focusRect: freezeSize(art.variants.portrait.frameFocusRect),
        ...(art.variants.portrait.minFocusMargin
          ? {
              minFocusMargin: freezeMargin(
                art.variants.portrait.minFocusMargin,
              ),
            }
          : {}),
      }),
    }),
  }) satisfies SlotGameStaticFramePolicy;
}

function freezeSize(size: SlotGameStaticSize): SlotGameStaticSize {
  return Object.freeze({ width: size.width, height: size.height });
}

function freezeMargin(margin: SlotGameStaticMargin): SlotGameStaticMargin {
  return Object.freeze({
    ...(margin.left !== undefined ? { left: margin.left } : {}),
    ...(margin.right !== undefined ? { right: margin.right } : {}),
    ...(margin.top !== undefined ? { top: margin.top } : {}),
    ...(margin.bottom !== undefined ? { bottom: margin.bottom } : {}),
  });
}
