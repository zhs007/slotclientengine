import { describe, expect, it, vi } from "vitest";
import {
  requestPopupVniPlaybackEnd,
  startPopupVniPlayback,
} from "../../src/popup/vni-playback.js";

describe("popup VNI playback", () => {
  it("plays once as one non-loop full timeline and does not request a segmented end", () => {
    const player = transport();
    const playback = { mode: "once" as const };
    startPopupVniPlayback(player as never, playback);
    expect(player.setLoop).toHaveBeenCalledWith(false);
    expect(player.play).toHaveBeenCalledWith({ mode: "timeline" });
    requestPopupVniPlaybackEnd(player as never, playback);
    expect(player.requestSegmentedPlaybackEnd).not.toHaveBeenCalled();
  });

  it("preserves segmented playback and explicit end", () => {
    const player = transport();
    const playback = {
      mode: "segmented" as const,
      loopStartTime: 0.4,
      loopEndTime: 4.6,
      keepParticlesAlive: true,
    };
    startPopupVniPlayback(player as never, playback);
    expect(player.setLoop).not.toHaveBeenCalled();
    expect(player.play).toHaveBeenCalledWith({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.4 },
      loopEnd: { unit: "time", at: 4.6 },
      keepParticlesAlive: true,
    });
    requestPopupVniPlaybackEnd(player as never, playback);
    expect(player.requestSegmentedPlaybackEnd).toHaveBeenCalledOnce();
  });
});

function transport() {
  return {
    play: vi.fn(),
    requestSegmentedPlaybackEnd: vi.fn(),
    setLoop: vi.fn(),
  };
}
