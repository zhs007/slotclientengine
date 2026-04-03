import cabinAtlasImageUrl from "../assets/cabin.png";
import asset12AtlasImageUrl from "../assets/12.png";
import type { SpineModel } from "../runtime/spine-types.js";
import { cabinAnimationData, cabinAnimationNames } from "./cabin-animation-data.js";
import { cabinAtlasText } from "./cabin-atlas.js";
import { asset12AnimationData, asset12AnimationNames } from "./asset-12-animation-data.js";
import { asset12AtlasText } from "./asset-12-atlas.js";

export type AnimationBundle = {
  id: string;
  label: string;
  model: SpineModel;
  animationNames: string[];
  defaultAnimationName: string;
  atlasText: string;
  atlasImageUrl: string;
  description: string;
};

export const animationBundles: AnimationBundle[] = [
  {
    id: "cabin",
    label: "Cabin",
    model: cabinAnimationData,
    animationNames: cabinAnimationNames,
    defaultAnimationName: "cabin",
    atlasText: cabinAtlasText,
    atlasImageUrl: cabinAtlasImageUrl,
    description: "原始 cabin 资源组，包含 cabin 与 cabin_s 两个动画。"
  },
  {
    id: "asset-12",
    label: "Asset 12",
    model: asset12AnimationData,
    animationNames: asset12AnimationNames,
    defaultAnimationName: "bonus1",
    atlasText: asset12AtlasText,
    atlasImageUrl: asset12AtlasImageUrl,
    description: "12 号资源组，包含 bonus1-5 与 fg1-3，并使用 shear 与 drawOrder。"
  }
];

export const defaultAnimationBundle = animationBundles[0];

export function getAnimationBundle(bundleId: string) {
  return animationBundles.find((bundle) => bundle.id === bundleId) ?? defaultAnimationBundle;
}