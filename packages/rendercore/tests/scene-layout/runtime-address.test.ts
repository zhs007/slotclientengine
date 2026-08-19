import { describe, expect, it } from "vitest";
import {
  formatGameLayoutRuntimeAddress,
  parseGameLayoutRuntimeAddress,
  splitGameLayoutRuntimeAddress,
} from "../../src/scene-layout/data/runtime-address.js";

describe("Game Layout runtime address", () => {
  it("round-trips exact owner identities with canonical segment encoding", () => {
    const address = formatGameLayoutRuntimeAddress(
      "transition",
      "Base Game",
      "Free/Game",
      "effect",
      "spine",
      "event",
      "Start+1",
    );
    expect(address).toBe(
      "gamelayout:/transition/Base%20Game/Free%2FGame/effect/spine/event/Start%2B1",
    );
    expect(splitGameLayoutRuntimeAddress(address)).toEqual([
      "transition",
      "Base Game",
      "Free/Game",
      "effect",
      "spine",
      "event",
      "Start+1",
    ]);
  });

  it.each([
    "transition/BaseGame/FreeGame",
    "gamelayout:/transition/BaseGame/FreeGame/",
    "gamelayout:/transition//FreeGame",
    "gamelayout:/transition/../FreeGame",
    "gamelayout:/transition/%42aseGame/FreeGame",
    "gamelayout:/transition/BaseGame/FreeGame?event=Start",
  ])("rejects non-canonical address %s", (address) => {
    expect(() => parseGameLayoutRuntimeAddress(address)).toThrow();
  });
});
