import rawImageStringManifest from "../../../assets/game002-s3/dependencies/image-strings/cn-digits/image-string.manifest.json";
import {
  parseImageStringManifest,
  parseSymbolStateTextureManifest,
  type SymbolValuePresentationResourceMap,
} from "@slotclientengine/rendercore";
import {
  getGame002SkinConfig,
  type Game002SkinConfig,
} from "../src/skin-config.js";

export function getTestGame002SkinConfig(): Game002SkinConfig {
  const skin = getGame002SkinConfig("1");
  return Object.freeze({
    ...skin,
    symbolValuePresentationResources: createTestValueResources(
      skin.stateTextureManifest,
    ),
  });
}

function createTestValueResources(
  rawManifest: unknown,
): SymbolValuePresentationResourceMap {
  const parsed = parseSymbolStateTextureManifest(rawManifest);
  const entry = parsed.symbols.CN;
  const presentation = entry.valuePresentation;
  if (!presentation || presentation.text.type !== "image-string") {
    throw new Error("game002 CN test fixture requires ImgNumber.");
  }
  const imageStringResource = Object.freeze({
    manifest: parseImageStringManifest(rawImageStringManifest),
    textures: Object.freeze({}),
    destroyed: false,
    assertUsable() {},
    async destroy() {},
  });
  return Object.freeze({
    CN: Object.freeze({
      symbol: "CN",
      defaultValues: presentation.defaultValues,
      activeSpineAnimations: Object.freeze(
        Object.fromEntries(
          Object.entries(entry.animations).flatMap(([state, animation]) =>
            animation?.kind === "activeSpine"
              ? [[state, animation.playback]]
              : [],
          ),
        ),
      ),
      tiers: Object.freeze(
        presentation.tiers.map((tier) =>
          Object.freeze({
            ...(tier.maxExclusive === undefined
              ? {}
              : { maxExclusive: tier.maxExclusive }),
            spec: tier.animation,
            skeleton: {},
            atlasText: "Symbol.png\n",
            textureUrl: "/Symbol.png",
            atlasPage: "Symbol.png",
          }),
        ),
      ),
      text: presentation.text,
      textImageUrls: Object.freeze({}),
      imageStringTierBindings: Object.freeze(
        presentation.text.tiers.map((binding) =>
          Object.freeze({
            resourcePath: binding.resource,
            resource: imageStringResource,
            slot: binding.slot,
            anchor: binding.anchor,
            transform: binding.transform,
            followSlotColor: binding.followSlotColor,
          }),
        ),
      ),
    }),
  });
}
