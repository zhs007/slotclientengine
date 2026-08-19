import { describe, expect, it } from "vitest";
import { collectPackageAudioAssetRoles } from "../src/audio-assets.js";

describe("Popup audio asset collection", () => {
  it.each([7, 8] as const)(
    "collects typed effects from Popup v%s",
    (version) => {
      const popup = {
        version,
        kind: "popup",
        id: "audio-popup",
        name: "Audio Popup",
        type: "spine",
        adaptation: {
          mode: "maximized-focus",
          focus: { left: 50, right: 50, top: 50, bottom: 50 },
        },
        backdrop: {
          enabled: true,
          color: "#000000",
          alpha: 0.5,
          visibleStates: ["start", "loop", "end"],
        },
        resources: {
          effect: {
            kind: "spine",
            skeleton: "effect.json",
            atlas: "effect.atlas",
            textures: { "effect.png": "effect.png" },
          },
        },
        audio: {
          version: 1,
          effects: [
            {
              name: "coin",
              asset: {
                sources: [{ path: "coin.ogg", mediaType: "audio/ogg" }],
              },
              playback: "once",
              offsetSeconds: 0,
              voices: { maxConcurrent: 1, overflow: "restart-oldest" },
              bgm: { kind: "keep" },
            },
          ],
          cues: [
            {
              effect: "coin",
              target: { kind: "segment", segment: "start" },
            },
          ],
        },
        spine: {
          resource: "effect",
          transform: { x: 0, y: 0, scale: 1 },
          playback: {
            mode: "segmented-animations",
            startAnimation: "Start",
            loopAnimation: "Loop",
            endAnimation: "End",
          },
        },
      };
      const roles = collectPackageAudioAssetRoles(
        {
          version: 1,
          popups: {
            "audio-popup": {
              type: "spine",
              manifest: "audio-popup.manifest.json",
            },
          },
        } as never,
        new Map([
          [
            "audio-popup.manifest.json",
            new TextEncoder().encode(JSON.stringify(popup)),
          ],
        ]),
      );
      expect(roles.get("coin.ogg")).toEqual({
        role: "effect",
        mediaType: "audio/ogg",
      });
    },
  );
});
