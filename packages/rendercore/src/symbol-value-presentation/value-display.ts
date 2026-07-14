import { Assets, Container, Sprite, Text, type Texture } from "pixi.js";
import { SymbolAssetError } from "../symbol/errors.js";
import type { SymbolValuePresentationResource } from "./types.js";

export async function createSymbolValueDisplay(options: {
  readonly value: number;
  readonly resource: SymbolValuePresentationResource;
}): Promise<Container> {
  const spec = options.resource.text;
  if (spec.type === "image") {
    const url = assertSymbolValueDisplayResource(options);
    if (url === null) {
      throw new SymbolAssetError(
        `Symbol "${options.resource.symbol}" image display resource is invalid.`,
      );
    }
    const sprite = new Sprite(await Assets.load<Texture>(url));
    sprite.anchor.set(0.5);
    sprite.position.set(spec.x, spec.y);
    return sprite;
  }

  const label = new Text({
    text: String(options.value),
    style: {
      fontFamily: spec.fontFamily,
      fontSize: spec.fontSize,
      fontWeight: spec.fontWeight as never,
      fill: spec.fill,
      stroke: { color: spec.stroke, width: spec.strokeWidth },
      align: "center",
    },
  });
  label.anchor.set(0.5);
  label.position.set(spec.x, spec.y);
  return label;
}

export function assertSymbolValueDisplayResource(options: {
  readonly value: number;
  readonly resource: SymbolValuePresentationResource;
}): string | null {
  if (options.resource.text.type !== "image") return null;
  const url = options.resource.textImageUrls[options.value];
  if (!url) {
    throw new SymbolAssetError(
      `Symbol "${options.resource.symbol}" value ${options.value} has no configured image resource.`,
    );
  }
  return url;
}
