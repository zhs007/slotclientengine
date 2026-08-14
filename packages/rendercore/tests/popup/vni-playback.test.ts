import { describe, expect, it, vi } from "vitest";
import {
  requestPopupVniPlaybackEnd,
  startPopupVniPlayback,
} from "../../src/popup/vni-playback.js";

describe("popup VNI playback", () => {
  it("plays once as one non-loop full timeline", () => {
    const player = transport();
    const playback = { mode: "once" as const };
    startPopupVniPlayback(player as never, playback);
    expect(player.setLoop).toHaveBeenCalledWith(false);
    expect(player.play).toHaveBeenCalledWith({ mode: "timeline" });
    requestPopupVniPlaybackEnd(player as never, playback);
    expect(player.play).toHaveBeenCalledOnce();
  });

  it("preserves the ordinary segmented playback end boundary", () => {
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

  it("can jump a segmented playback to its end range immediately", () => {
    const player = transport();
    const playback = {
      mode: "segmented" as const,
      loopStartTime: 0.4,
      loopEndTime: 4.6,
      keepParticlesAlive: true,
    };
    requestPopupVniPlaybackEnd(player as never, playback, {
      immediate: true,
    });
    expect(player.play).toHaveBeenLastCalledWith({
      mode: "range",
      range: { unit: "time", start: 4.6 },
      loop: false,
    });
    expect(player.requestSegmentedPlaybackEnd).not.toHaveBeenCalled();
  });
});

function transport() {
  return {
    play: vi.fn(),
    requestSegmentedPlaybackEnd: vi.fn(),
    setLoop: vi.fn(),
  };
}
