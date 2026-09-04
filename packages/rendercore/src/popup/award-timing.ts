import type { AwardTimingOptions, PopupManifest } from "./data/types.js";

type AwardSpec = Extract<
  PopupManifest,
  { type: "award-celebration" }
>["awardCelebration"];

export interface ResolvedAwardTiming extends AwardTimingOptions {
  readonly megaOnce: boolean;
  readonly finalAmountHoldDurationSeconds: number;
}

/** Resolves seconds from exact Mega VNI metadata, without mutating the source. */
export function resolveAwardTiming(
  spec: AwardSpec,
  getVniDuration: (resourceId: string) => number,
): ResolvedAwardTiming {
  const mega = spec.celebrationTiers.find((tier) => tier.id === "megawin");
  if (!mega) throw new Error("award timing requires the megawin tier.");
  const vnis = mega.layers.filter((layer) => layer.kind === "vni");
  const megaOnce =
    vnis.length > 0 && vnis.every((layer) => layer.playback.mode === "once");
  let duration = 0;
  let hold = 0;
  for (const layer of vnis) {
    const total = getVniDuration(layer.resource);
    if (!Number.isFinite(total) || total <= 0)
      throw new Error(
        `award timing VNI duration must be positive: ${layer.resource}.`,
      );
    duration = Math.max(duration, total);
    const playback = layer.playback;
    if (
      playback.mode === "segmented" &&
      (!Number.isFinite(playback.loopStartTime) ||
        playback.loopStartTime < 0 ||
        !Number.isFinite(playback.loopEndTime) ||
        playback.loopEndTime <= playback.loopStartTime ||
        playback.loopEndTime > total)
    )
      throw new Error(
        `award timing VNI loop range is invalid: ${layer.resource}.`,
      );
    hold = Math.max(
      hold,
      playback.mode === "once" ? total * 0.33 : total - playback.loopEndTime,
    );
  }
  const once =
    spec.onceMegaCountDurationSeconds ??
    (megaOnce ? duration * 0.66 : undefined);
  const finalHold = spec.finalAmountHoldDurationSeconds ?? hold;
  if (once !== undefined && (!Number.isFinite(once) || once <= 0))
    throw new Error(
      "onceMegaCountDurationSeconds must be finite and positive.",
    );
  if (!Number.isFinite(finalHold) || finalHold < 0)
    throw new Error(
      "finalAmountHoldDurationSeconds must be finite and non-negative.",
    );
  return Object.freeze({
    megaOnce,
    ...(once !== undefined ? { onceMegaCountDurationSeconds: once } : {}),
    finalAmountHoldDurationSeconds: finalHold,
  });
}
