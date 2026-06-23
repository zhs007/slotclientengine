import type { VNIPlayer } from "@slotclientengine/vnicore/pixi";

export function playSegmentedHold(player: VNIPlayer): void {
  player.play({
    mode: "segmented",
    loopStart: { unit: "time", at: 3 },
    loopEnd: { unit: "time", at: 3 },
    keepParticlesAlive: true,
  });
}

export function playSegmentedRangeLoop(player: VNIPlayer): void {
  player.play({
    mode: "segmented",
    loopStart: { unit: "time", at: 2.5 },
    loopEnd: { unit: "time", at: 3 },
  });
}

export function requestSegmentedEnd(player: VNIPlayer): void {
  if (player.getPlaybackState().mode === "segmented") {
    player.requestSegmentedPlaybackEnd();
  }
}
