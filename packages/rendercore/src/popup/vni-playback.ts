import type { VNIPlayer } from "@slotclientengine/vnicore/pixi";
import type { PopupVniPlayback } from "./types.js";

type PopupVniTransport = Pick<
  VNIPlayer,
  "play" | "requestSegmentedPlaybackEnd" | "setLoop"
>;

export function startPopupVniPlayback(
  player: PopupVniTransport,
  playback: PopupVniPlayback,
): void {
  if (playback.mode === "once") {
    player.setLoop(false);
    player.play({ mode: "timeline" });
    return;
  }
  player.play({
    mode: "segmented",
    loopStart: { unit: "time", at: playback.loopStartTime },
    loopEnd: { unit: "time", at: playback.loopEndTime },
    keepParticlesAlive: playback.keepParticlesAlive,
  });
}

export function requestPopupVniPlaybackEnd(
  player: PopupVniTransport,
  playback: PopupVniPlayback,
  options: { readonly immediate?: boolean } = {},
): void {
  if (playback.mode !== "segmented") return;
  if (options.immediate) {
    player.play({
      mode: "range",
      range: { unit: "time", start: playback.loopEndTime },
      loop: false,
    });
    return;
  }
  player.requestSegmentedPlaybackEnd();
}
