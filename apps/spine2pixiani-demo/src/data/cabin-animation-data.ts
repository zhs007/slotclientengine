import rawSpineData from "./cabin-spine.json";
import { adaptSpineData } from "../runtime/spine-adapter.js";
import type { RawSpineSkeleton } from "../runtime/spine-types.js";

export const cabinAnimationData = adaptSpineData(rawSpineData as RawSpineSkeleton);
export const cabinAnimationNames = Object.keys(cabinAnimationData.animations);