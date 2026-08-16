import type { VNIViewer } from "@slotclientengine/vnicore/viewer";

export function playSegmentedHold(player: VNIViewer): void {
  player.play({
    mode: "segmented",
    loopStart: { unit: "time", at: 3 },
    loopEnd: { unit: "time", at: 3 },
    keepParticlesAlive: true,
  });
}

export function playSegmentedRangeLoop(player: VNIViewer): void {
  player.play({
    mode: "segmented",
    loopStart: { unit: "time", at: 2.5 },
    loopEnd: { unit: "time", at: 3 },
  });
}

export function requestSegmentedEnd(player: VNIViewer): void {
  if (player.getPlaybackState().mode === "segmented") {
    player.requestSegmentedPlaybackEnd();
  }
}
