import { describe, expect, it } from "vitest";
import {
  audioEditorFormatAdapter,
  materializeAudioEffectDraft,
  createAudioEffectDraft,
} from "../src/editor/index.js";

describe("audio editor", () => {
  it("uses the shared draft defaults", () => {
    expect(
      materializeAudioEffectDraft(
        createAudioEffectDraft({ name: "coin", path: "coin.mp3" }),
      ),
    ).toMatchObject({
      name: "coin",
      playback: "once",
      offsetSeconds: 0,
      bgm: { kind: "keep" },
    });
  });

  it("diagnoses extension/signature mismatch", async () => {
    const [candidate] = await audioEditorFormatAdapter.discover([
      {
        sourcePath: "coin.mp3",
        key: "coin.mp3",
        bytes: new Uint8Array([0x4f, 0x67, 0x67, 0x53]),
        container: "file",
        containerName: "coin.mp3",
      },
    ]);
    expect(candidate?.diagnostics[0]).toMatch(/不匹配/u);
  });
});
