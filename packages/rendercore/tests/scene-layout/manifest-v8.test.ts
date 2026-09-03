import { describe, expect, it } from "vitest";
import {
  createSceneLayoutRuntimeAllocation,
  parseSceneLayoutManifestV7,
  parseSceneLayoutManifestV8,
  resolveSceneLayoutStartupMode,
  upgradeSceneLayoutManifestToLatest,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

function splashDraft(options: {
  readonly splashMode?: string;
  readonly primaryTarget?: string;
  readonly includeEdge?: boolean;
}) {
  const base = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
  const initial = base.gameModes.modes.find(
    (mode) => mode.id === base.gameModes.initialMode,
  )!;
  const splash = {
    ...initial,
    id: "Splash",
    main: { ...initial.main, enabled: false },
    nodeStates: {},
    symbolPackage: undefined,
    awardCelebrationPopup: undefined,
    ...(options.primaryTarget
      ? {
          primaryAction: {
            kind: "request-game-mode" as const,
            targetMode: options.primaryTarget,
          },
        }
      : { primaryAction: undefined }),
  };
  const other = {
    ...splash,
    id: "Other",
    primaryAction: undefined,
  };
  const draft = {
    ...base,
    gameModes: {
      ...base.gameModes,
      splashMode: options.splashMode ?? "Splash",
      modes: [
        ...base.gameModes.modes,
        splash,
        ...(options.primaryTarget === "Other" ? [other] : []),
      ],
      transitions:
        options.includeEdge === false
          ? []
          : [
              {
                from: "Splash",
                to: base.gameModes.initialMode,
                overlay: { kind: "none" as const },
              },
              ...(options.primaryTarget === "Other"
                ? [
                    {
                      from: "Splash",
                      to: "Other",
                      overlay: { kind: "none" as const },
                    },
                  ]
                : []),
            ],
    },
    runtimeAllocation: undefined as never,
  };
  return {
    ...draft,
    runtimeAllocation: createSceneLayoutRuntimeAllocation(draft),
  };
}

describe("scene layout manifest v8 Splash contract", () => {
  it("upgrades v1-v7 without inferring a configured Splash", () => {
    const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    expect(latest.version).toBe(8);
    expect(latest.gameModes).not.toHaveProperty("splashMode");
    expect(resolveSceneLayoutStartupMode(latest.gameModes)).toBe(
      latest.gameModes.initialMode,
    );
  });

  it("preserves a legacy initial mode named Splash without assigning the new role", () => {
    const configured = splashDraft({ primaryTarget: "BaseGame" });
    const { splashMode: _splashMode, ...legacyGameModes } =
      configured.gameModes;
    const source = parseSceneLayoutManifestV7({
      ...configured,
      version: 7,
      gameModes: {
        ...legacyGameModes,
        initialMode: "Splash",
      },
    });

    const latest = upgradeSceneLayoutManifestToLatest(source);
    expect(latest.gameModes.initialMode).toBe("Splash");
    expect(latest.gameModes).not.toHaveProperty("splashMode");
    expect(resolveSceneLayoutStartupMode(latest.gameModes)).toBe("Splash");
  });

  it("uses the optional configured Splash as startup without changing initial", () => {
    const manifest = parseSceneLayoutManifestV8(splashDraft({}));
    expect(manifest.gameModes).toMatchObject({
      splashMode: "Splash",
      initialMode: "BaseGame",
    });
    expect(resolveSceneLayoutStartupMode(manifest.gameModes)).toBe("Splash");
  });

  it("requires distinct modes and a direct Splash-to-initial edge", () => {
    expect(() =>
      parseSceneLayoutManifestV8(splashDraft({ splashMode: "BaseGame" })),
    ).toThrow(/must differ from initialMode/u);
    expect(() =>
      parseSceneLayoutManifestV8(splashDraft({ splashMode: "Missing" })),
    ).toThrow(/must reference a declared mode/u);
    expect(() =>
      parseSceneLayoutManifestV8(splashDraft({ includeEdge: false })),
    ).toThrow(/direct transition to initialMode/u);
    expect(() =>
      parseSceneLayoutManifestV8(splashDraft({ primaryTarget: "Other" })),
    ).toThrow(/primaryAction must target initialMode/u);
  });
});
