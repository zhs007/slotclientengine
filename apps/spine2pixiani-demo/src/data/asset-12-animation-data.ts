import rawSpineData from "./asset-12-spine.json";
import { adaptSpineData } from "../runtime/spine-adapter.js";
import type { RawSpineSkeleton } from "../runtime/spine-types.js";

export const asset12AnimationData = adaptSpineData(rawSpineData as RawSpineSkeleton);
export const asset12AnimationNames = Object.keys(asset12AnimationData.animations);