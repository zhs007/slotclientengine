import type { VNIPlayer } from "@slotclientengine/vnicore/pixi";

export function wirePlaybackEvents(player: VNIPlayer): () => void {
  player.playRange({
    range: { unit: "frame", start: 30, end: 120, fps: 60 },
    loop: false,
  });

  const disposeMarker = player.addPlaybackEvent({
    id: "half-second",
    at: { unit: "time", at: 0.5 },
    once: true,
    listener: (event) => {
      console.info("marker", event.id, event.time, event.loopIndex);
    },
  });

  const disposeFrameMarker = player.addPlaybackEvent({
    id: "frame-90",
    at: { unit: "frame", at: 90, fps: 60 },
    listener: (event) => {
      console.info("frame marker", event.currentTime);
    },
  });

  const disposeComplete = player.onPlaybackComplete((event) => {
    console.info("complete", event.startTime, event.endTime);
  });

  console.info("state", player.getPlaybackState().phase);

  return () => {
    disposeMarker();
    disposeFrameMarker();
    disposeComplete();
  };
}

export function playToProjectEnd(player: VNIPlayer): void {
  player.playRange({ range: { unit: "time", start: 0, end: -1 } });
}
