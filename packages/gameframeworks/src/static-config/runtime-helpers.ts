import { assertSlotGameStaticConfig } from "./validate.js";
import type {
  SlotGameStaticConfig,
  SlotGameStaticSkinConfig,
} from "./types.js";

export function getSlotGameStaticSkin(
  config: SlotGameStaticConfig,
  skinId: string,
): SlotGameStaticSkinConfig {
  assertSlotGameStaticConfig(config);
  const skin = config.skins[skinId];
  if (!skin) {
    throw new Error(`static config does not define skin "${skinId}".`);
  }
  return skin;
}

export function parseSlotGameStaticSkinId(
  config: SlotGameStaticConfig,
  value: string,
): string {
  assertSlotGameStaticConfig(config);
  if (config.supportedSkins.includes(value)) {
    return value;
  }
  throw new Error(
    `skin query parameter must be one of: ${config.supportedSkins.join(", ")}.`,
  );
}

export function assertNoRejectedQueryParams(
  params: URLSearchParams,
  rejectedNames: readonly string[],
): void {
  for (const name of rejectedNames) {
    if (params.has(name)) {
      throw new Error(
        `${name} query parameter is not supported by this static game build.`,
      );
    }
  }
}
