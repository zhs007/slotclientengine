import type {
  AwardCelebrationRuntime,
  AwardCelebrationSnapshot,
  SingleStatePopupRuntime,
  SingleStatePopupSnapshot,
  SpinePopupRuntime,
  SpinePopupSnapshot,
} from "./types.js";

/** Complete inspection surface for editor and diagnostic consumers. */
export interface AwardCelebrationPlayer extends Omit<
  AwardCelebrationRuntime,
  "update"
> {
  update(deltaSeconds: number): AwardCelebrationSnapshot;
  getSnapshot(): AwardCelebrationSnapshot;
}

/** Complete inspection surface for editor and diagnostic consumers. */
export interface SpinePopupPlayer extends Omit<SpinePopupRuntime, "update"> {
  update(deltaSeconds: number): SpinePopupSnapshot;
  getSnapshot(): SpinePopupSnapshot;
}

/** Complete inspection surface for editor and diagnostic consumers. */
export interface SingleStatePopupPlayer extends Omit<
  SingleStatePopupRuntime,
  "update"
> {
  update(deltaSeconds: number): SingleStatePopupSnapshot;
  getSnapshot(): SingleStatePopupSnapshot;
}
