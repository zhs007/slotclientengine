import { describe, expect, it } from "vitest";
import projectData from "../fixtures/export/project.json";
import lock01Data from "../fixtures/export/lock_01.json";
import twoXData from "../fixtures/export/2x.json";
import fiveXData from "../fixtures/export/5x.json";
import tenXData from "../fixtures/export/10x.json";
import bigwinData from "../fixtures/export/bigwin.json";
import megawinData from "../fixtures/export/megawin.json";
import multipayData from "../fixtures/export/multipay.json";
import threeReelMultipay01Data from "../fixtures/export/3reel_multipay_01.json";
import threeReelMultipay02Data from "../fixtures/export/3reel_multipay_02.json";
import respinData from "../fixtures/export/respin.json";
import scatter1Data from "../fixtures/export/scatter1.json";
import scatter2Data from "../fixtures/export/scatter2.json";
import superwinData from "../fixtures/export/superwin.json";
import roundreelData from "../fixtures/export/roundreel.json";
import number2Data from "../fixtures/export/number2.json";
import number3Data from "../fixtures/export/number3.json";
import {
  assertV5GBundleManifest,
  assertV5GProject,
  assertVNIBundleManifest,
  assertVNIProject,
  parseColorHex,
  validateManifestProjectProfile,
  validateV5GBundleManifest,
  validateV5GProject,
  validateVNIBundleManifest,
  validateVNIProject,
} from "../../src/core/validation";
import {
  DEFAULT_VNI_LAYER_GROUP_ID,
  getVNIProjectLayerGroupSlots,
  getVNIProjectRenderGroupOrder,
} from "../../src/core/layer-groups";
import type {
  V5GAnimationConfig,
  V5GAnimationType,
  V5GProjectConfig,
} from "../../src/core/types";

const bundledProjectData = [
  projectData,
  lock01Data,
  bigwinData,
  megawinData,
  superwinData,
  twoXData,
  fiveXData,
  tenXData,
  respinData,
  scatter1Data,
  scatter2Data,
  multipayData,
  threeReelMultipay01Data,
  threeReelMultipay02Data,
  roundreelData,
  number2Data,
  number3Data,
] as const;

const bundledManifestData = {
  type: "vni_export_bundle",
  version: "VNI_0.020",
  exports: [
    {
      id: "runtime_50",
      purpose: "runtime",
      assetScale: 0.5,
      path: "bigwin.json",
      label: "50% runtime",
    },
    {
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
      path: "roundreel.json",
      label: "100% runtime",
    },
  ],
} as const;

const newAnimationParams: Readonly<
  Record<V5GAnimationType, V5GAnimationConfig["params"]>
> = {
  idle: {},
  move: { fromX: 0, fromY: 0, toX: 1, toY: 1 },
  multi_move: {
    pointsJson: JSON.stringify([
      { x: 0, y: 0, time: 0, easing: "linear" },
      { x: 100, y: 0, time: 1, easing: "easeOutQuad" },
    ]),
  },
  fade: { fromOpacity: 0, toOpacity: 1 },
  scale_up: { fromScaleX: 1, fromScaleY: 1, toScaleX: 2, toScaleY: 2 },
  scale_down: { fromScaleX: 2, fromScaleY: 2, toScaleX: 1, toScaleY: 1 },
  scale_in: { fromScale: 0, toScale: 1, fadeIn: true },
  scale_out: { fromScale: 1, toScale: 0, fadeOut: true },
  pop: { peakScale: 1.25, settleScale: 1, peakAt: 0.4 },
  shake: { amplitudeX: 12, amplitudeY: 4, cycles: 3, decay: true },
  blink: { minOpacity: 0.1, maxOpacity: 1, blinks: 2, endOpacity: 1 },
  rotate: { fromRotation: 0, toRotation: 90 },
  slide_in: { fromX: -10, fromY: 0, toX: 0, toY: 0, fadeIn: true },
  slide_out: { fromX: 0, fromY: 0, toX: 10, toY: 0, fadeOut: true },
  bounce_in: { fromScale: 0.2, toScale: 1, overshoot: 1.7, fadeIn: true },
  pulse: { scale: 1.1, cycles: 1 },
  float: { amplitude: 10, cycles: 1 },
  swing: { angle: 10, cycles: 1 },
  particles: {
    count: 4,
    spread: 20,
    speed: 30,
    size: 16,
    gravity: 10,
    fadeOut: true,
  },
  particle_twinkle: {
    radius: 20,
    count: 4,
    spawnInterval: 0.1,
    twinkleDuration: 0.4,
    batchMin: 1,
    batchMax: 2,
    size: 16,
  },
  particle_wall: {
    emitterWidth: 300,
    direction: 270,
    spreadAngle: 15,
    speed: 200,
    lifetimeMin: 0.8,
    lifetimeMax: 2,
    spawnRate: 30,
    size: 48,
    gravity: 0,
    startScaleMin: 0.6,
    startScaleMax: 1,
    endScaleMin: 0.3,
    endScaleMax: 0.8,
    fadeOut: true,
  },
  particle_combo: {
    count: 36,
    size: 42,
    sourceOpacity: 0,
    spawnMode: 1,
    spawnRadius: 90,
    spawnRatio: 0.18,
    targetX: 320,
    targetY: 0,
    travelMode: 1,
    curve: 160,
    orbitRadius: 80,
    orbitTurns: 1,
    orbitSpeed: 1,
    orbitRatio: 0.35,
    staggerRatio: 0.28,
    trailCount: 4,
    trailSpacing: 0.045,
    trailFade: 0.55,
    vanishMode: 1,
    vanishRatio: 0.18,
    flashScale: 1.6,
    flashIntensity: 1.4,
  },
  particle_stream: {
    spawnRate: 60,
    lifetime: 1.2,
    spread: 40,
    speed: 160,
    emissionAngle: 270,
    emissionSpreadAngle: 60,
    size: 32,
    gravity: 40,
    fadeOut: true,
    trailCount: 2,
    trailSpacing: 0.04,
    trailFade: 0.5,
    rotateParticles: true,
    randomRotation: true,
    randomRotationDegrees: 90,
    spinSpeed: 1,
  },
  chaser_light: {
    totalCount: 12,
    spacing: 105,
    lightDuration: 0.06,
    interval: 0.04,
    trajectory: 0,
    radius: 200,
    centerX: 0,
    centerY: 0,
    endX: 320,
    endY: 0,
    curve: 120,
    lightSize: 48,
    dimAlpha: 0.15,
    keepOriginal: true,
  },
  gather_particles: {
    count: 48,
    size: 42,
    sourceOpacity: 0,
    spawnRadius: 360,
    spawnRatio: 0.2,
    targetX: 0,
    targetY: 0,
    travelMode: 1,
    curve: 160,
    spiralTurns: 0.75,
    staggerRatio: 0.28,
    trailCount: 3,
    trailSpacing: 0.04,
    trailFade: 0.55,
    vanishMode: 1,
    vanishRatio: 0.18,
    flashScale: 1.6,
    flashIntensity: 1.35,
  },
  smoke_mist: {
    count: 56,
    size: 96,
    sourceOpacity: 0,
    spawnRadius: 80,
    spread: 320,
    windX: 80,
    windY: 40,
    swirl: 120,
    startAlpha: 0.62,
    fadePower: 1.35,
    grow: 2.1,
    sizeRandom: 0.55,
    rotationSpeed: 0.6,
  },
  energy_ring: {
    ringCount: 2,
    startScale: 0.25,
    endScale: 2.4,
    sourceOpacity: 0,
    alpha: 1,
    stagger: 0.28,
    rotation: 60,
    pulse: 0.08,
    vanishMode: 1,
    additive: true,
  },
  slash_light: {
    mode: 0,
    angle: -25,
    travel: 180,
    lengthScale: 2.4,
    widthScale: 0.55,
    sourceOpacity: 0,
    flashAlpha: 1,
    startScale: 0.18,
    fadeRatio: 0.45,
    curve: 90,
    additive: true,
  },
  flame_flicker: {
    count: 52,
    emitterWidth: 180,
    height: 420,
    direction: 270,
    spreadAngle: 22,
    vanishSpread: 120,
    lengthRandom: 0.35,
    size: 96,
    sway: 54,
    turbulence: 80,
    grow: 1.65,
    sourceOpacity: 0,
    alpha: 0.9,
    flicker: 0.35,
    cycles: 1,
    additive: true,
  },
  wave_band: {
    mode: 0,
    count: 36,
    length: 720,
    amplitude: 70,
    frequency: 2.5,
    speed: 1,
    direction: 0,
    size: 48,
    alpha: 1,
    trailFade: 0.75,
    keepOriginal: false,
    rotateToWave: true,
  },
  wave_distort: {
    rows: 36,
    amplitude: 24,
    frequency: 2,
    cycles: 1,
    speed: 1,
    phaseOffset: 1,
    verticalBob: 0,
    alpha: 1,
    edgeFeather: 0,
    keepOriginal: false,
  },
  speed_lines: {
    mode: 0,
    count: 72,
    radius: 520,
    length: 120,
    speed: 1.4,
    direction: 0,
    spreadAngle: 360,
    lineWidth: 3,
    alpha: 0.75,
    keepOriginal: false,
    fadeOut: true,
  },
  drift_fall: {
    count: 48,
    areaWidth: 900,
    areaHeight: 1600,
    cycles: 1,
    fallSpeed: 260,
    wind: 45,
    swayAmplitude: 42,
    swayFrequency: 1,
    size: 48,
    sizeRandom: 0.45,
    rotationSpeed: 1,
    alpha: 1,
    keepOriginal: false,
    fadeEdges: true,
  },
  path_particles: {
    pathMode: 1,
    count: 36,
    size: 42,
    endX: 360,
    endY: 0,
    curve: 160,
    amplitude: 70,
    frequency: 2.5,
    radiusStart: 240,
    radiusEnd: 60,
    turns: 1.5,
    speed: 1,
    stagger: 1,
    oneShotStagger: 0.25,
    trailCount: 3,
    trailSpacing: 0.035,
    trailFade: 0.55,
    alpha: 1,
    keepOriginal: false,
    rotateToPath: true,
    fadeEnds: true,
    loop: true,
  },
  shatter: {
    count: 64,
    pieceSize: 72,
    force: 420,
    impactAngle: 90,
    spreadAngle: 160,
    gravity: 900,
    spin: 5,
    sourceOpacity: 0,
    fadeOut: true,
  },
  glow: {
    intensity: 0.75,
    spread: 0.12,
    minAlpha: 0.15,
    maxAlpha: 0.75,
    pulses: 2,
    blendMode: 0,
    keepOriginal: true,
  },
  safe_glow: {
    spread: 0.12,
    minOpacity: 0.12,
    maxOpacity: 0.65,
    pulses: 2,
    keepOriginal: true,
  },
  squash_stretch: {
    squashAngle: 270,
    squashAmount: 0.4,
    decayOscillateCount: 0,
    fromX: 0,
    fromY: -300,
    toX: 0,
    toY: 0,
  },
};

function validProject(): V5GProjectConfig {
  return structuredClone(assertV5GProject(projectData));
}

function expectInvalid(
  mutate: (project: V5GProjectConfig) => void,
  message: string,
): void {
  const project = validProject();
  mutate(project);
  expect(() => validateV5GProject(project)).toThrow(message);
}

describe("validation", () => {
  it("accepts all bundled exports", () => {
    for (const data of bundledProjectData) {
      const project = assertV5GProject(data);
      expect(() => validateV5GProject(project)).not.toThrow();
    }
  });

  it("keeps VNI public validation aliases semantically identical", () => {
    const project = assertVNIProject(projectData);
    const legacyProject = assertV5GProject(projectData);
    const manifest = assertVNIBundleManifest(bundledManifestData);

    expect(project).toEqual(legacyProject);
    expect(() => validateVNIProject(project)).not.toThrow();
    expect(() => validateVNIBundleManifest(manifest)).not.toThrow();
  });

  it("accepts VNI_0.045 project mask metadata without inferring old exports", () => {
    const nextProjectData = structuredClone(projectData) as {
      schemaVersion: string;
      editor: { version: string };
      maskCompositeMode?: string;
    };
    nextProjectData.schemaVersion = "VNI_0.045";
    nextProjectData.editor.version = "VNI_0.045";
    nextProjectData.maskCompositeMode = "precompose_light_alpha";

    const nextProject = assertVNIProject(nextProjectData);
    const oldProject = assertVNIProject(projectData);

    expect(nextProject.maskCompositeMode).toBe("precompose_light_alpha");
    expect(() => validateVNIProject(nextProject)).not.toThrow();
    expect(oldProject.maskCompositeMode).toBeUndefined();
  });

  it("rejects Cocos-compatible legacy_alpha as a vnicore Pixi runtime target", () => {
    const projectLevel = validProject();
    projectLevel.maskCompositeMode = "legacy_alpha";
    expect(() => validateVNIProject(projectLevel)).toThrow(
      "project.maskCompositeMode legacy_alpha",
    );

    const layerLevel = validProject();
    layerLevel.layers[0].mask = {
      enabled: true,
      sourceLayerId: layerLevel.layers[1].id,
      mode: "alpha",
      compositeMode: "legacy_alpha",
      showSourceLayer: false,
    };
    expect(() => validateVNIProject(layerLevel)).toThrow("legacy_alpha masks");
  });

  it("does not let project mask metadata fill missing or invalid layer mask modes", () => {
    const missingMode = structuredClone(projectData) as {
      maskCompositeMode?: string;
      layers: Array<{ id: string; mask?: unknown }>;
    };
    missingMode.maskCompositeMode = "precompose_light_alpha";
    missingMode.layers[0].mask = {
      enabled: true,
      sourceLayerId: missingMode.layers[1].id,
      mode: "alpha",
      showSourceLayer: false,
    };

    expect(() => assertVNIProject(missingMode)).toThrow(
      "project.layers[0].mask.compositeMode",
    );

    const invalidProjectMode = structuredClone(projectData) as {
      maskCompositeMode?: string;
    };
    invalidProjectMode.maskCompositeMode = "unknown";
    expect(() => assertVNIProject(invalidProjectMode)).toThrow(
      "project.maskCompositeMode",
    );
  });

  it("accepts new particle and squash bundled projects", () => {
    const multipay = assertV5GProject(multipayData);
    const scatter1 = assertV5GProject(scatter1Data);
    const scatter2 = assertV5GProject(scatter2Data);

    expect(
      multipay.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    ).toEqual(expect.arrayContaining(["particle_wall", "particle_combo"]));
    expect(
      scatter1.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    ).toContain("squash_stretch");
    expect(
      scatter2.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    ).toContain("squash_stretch");
    expect(() => validateV5GProject(multipay)).not.toThrow();
    expect(() => validateV5GProject(scatter1)).not.toThrow();
    expect(() => validateV5GProject(scatter2)).not.toThrow();
  });

  it("accepts lock_01 VNI_0.017 safe_glow export", () => {
    const project = assertV5GProject(lock01Data);
    const animationTypes = [
      ...new Set(
        project.layers.flatMap((layer) =>
          layer.animations.map((animation) => animation.type),
        ),
      ),
    ];

    expect(project.schemaVersion).toBe("VNI_0.017");
    expect(animationTypes).toEqual(
      expect.arrayContaining(["safe_glow", "idle", "particle_twinkle"]),
    );
    expect(() => validateV5GProject(project)).not.toThrow();
  });

  it("accepts VNI layer group projects and derives render slots from project.layers", () => {
    const project01 = assertV5GProject(threeReelMultipay01Data);
    const project02 = assertV5GProject(threeReelMultipay02Data);

    expect(() => validateV5GProject(project01)).not.toThrow();
    expect(() => validateV5GProject(project02)).not.toThrow();
    expect(
      project01.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    ).toEqual(expect.arrayContaining(["glow", "particle_wall"]));
    expect(
      getVNIProjectRenderGroupOrder(project01).map((group) => group.id),
    ).toEqual(["layer_group_mqqo064b_4", "group_default"]);
    expect(getVNIProjectLayerGroupSlots(project01)).toEqual([
      {
        afterGroupId: "layer_group_mqqo064b_4",
        afterGroupName: "下层光效",
        beforeGroupId: "group_default",
        beforeGroupName: "上层光效",
        renderIndex: 0,
      },
    ]);
  });

  it("accepts VNI projects and legacy assets without file scale metadata", () => {
    const project = validProject();
    project.schemaVersion = "VNI_0.003";
    project.editor = { name: "VNI", version: "VNI_0.003" };

    expect(project.assets[0].fileWidth).toBeUndefined();
    expect(project.layerGroups).toHaveLength(1);
    expect(project.layerGroups[0].id).toBe(DEFAULT_VNI_LAYER_GROUP_ID);
    expect(
      project.layers.every(
        (layer) => layer.groupId === DEFAULT_VNI_LAYER_GROUP_ID,
      ),
    ).toBe(true);
    expect(() => validateV5GProject(project)).not.toThrow();
  });

  it("accepts VNI single-project 100% exports without exportProfile", () => {
    const project = structuredClone(assertV5GProject(roundreelData));
    delete project.exportProfile;

    expect(() => validateV5GProject(project)).not.toThrow();
  });

  it("accepts runtime_50 file metadata and rejects partial metadata", () => {
    const project = structuredClone(assertV5GProject(bigwinData));
    const asset = project.assets.find(
      (item) => item.path === "assets/bigwin_asset_image_mqgf7e6h_g.png",
    );

    expect(asset).toMatchObject({
      width: 730,
      height: 735,
      fileWidth: 365,
      fileHeight: 368,
      fileScale: 0.5,
    });
    expect(() => validateV5GProject(project)).not.toThrow();

    expectInvalid((legacyProject) => {
      legacyProject.assets[0].fileWidth = legacyProject.assets[0].width;
    }, "fileWidth/fileHeight/fileScale must be provided together");
  });

  it("rejects invalid file metadata values and mismatched rounded sizes", () => {
    expectInvalid((project) => {
      project.assets[0].fileWidth = 0;
      project.assets[0].fileHeight = project.assets[0].height;
      project.assets[0].fileScale = 1;
    }, "fileWidth must be a positive finite number");

    expectInvalid((project) => {
      project.assets[0].fileWidth = project.assets[0].width;
      project.assets[0].fileHeight = project.assets[0].height;
      project.assets[0].fileScale = 0;
    }, "fileScale");

    expectInvalid((project) => {
      project.assets[0].fileWidth = project.assets[0].width;
      project.assets[0].fileHeight = project.assets[0].height;
      project.assets[0].fileScale = 1.2;
    }, "fileScale");

    expectInvalid((project) => {
      project.assets[0].fileWidth = project.assets[0].width - 1;
      project.assets[0].fileHeight = project.assets[0].height;
      project.assets[0].fileScale = 1;
    }, "file size metadata mismatch");
  });

  it("validates VNI bundle manifests and project profile consistency", () => {
    const manifest = assertV5GBundleManifest(bundledManifestData);
    expect(() => validateV5GBundleManifest(manifest)).not.toThrow();
    expect(manifest.exports.map((entry) => entry.id)).toEqual([
      "runtime_50",
      "runtime_100",
    ]);

    const runtime50 = assertV5GProject(bigwinData);
    expect(() =>
      validateManifestProjectProfile(manifest.exports[0], runtime50),
    ).not.toThrow();

    const runtime100 = assertV5GProject(roundreelData);
    expect(runtime100.schemaVersion).toBe("VNI_0.042");
    expect(runtime100.name).toBe("roundreel");
    expect(runtime100.exportProfile).toMatchObject({
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
    });
    expect(
      runtime100.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    ).toContain("safe_glow");

    const mismatched = structuredClone(runtime50);
    mismatched.exportProfile = {
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
    };
    expect(() =>
      validateManifestProjectProfile(manifest.exports[0], mismatched),
    ).toThrow("profile mismatch");
  });

  it("accepts runtime_100 profiles without deriving them from path segments", () => {
    const manifest = assertV5GBundleManifest({
      type: "vni_export_bundle",
      version: "VNI_0.020",
      exports: [
        {
          id: "runtime_100",
          purpose: "runtime",
          assetScale: 1,
          path: "profiles/roundreel.json",
          label: "100% 运行发布包",
        },
      ],
    });
    const project = assertV5GProject(roundreelData);

    expect(() => validateV5GBundleManifest(manifest)).not.toThrow();
    expect(() =>
      validateManifestProjectProfile(manifest.exports[0], project),
    ).not.toThrow();
  });

  it("accepts number2 text and number3 mask exports", () => {
    const number2 = assertV5GProject(number2Data);
    const number3 = assertV5GProject(number3Data);

    expect(number2.layers.some((layer) => layer.type === "text")).toBe(true);
    expect(
      number3.layers.some(
        (layer) => layer.mask?.compositeMode === "precompose_light_alpha",
      ),
    ).toBe(true);
    expect(() => validateV5GProject(number2)).not.toThrow();
    expect(() => validateV5GProject(number3)).not.toThrow();
  });

  it("rejects unsafe VNI bundle manifest paths without inferring profile from directories", () => {
    const manifest = assertV5GBundleManifest({
      type: "vni_export_bundle",
      version: "VNI_0.020",
      exports: [
        {
          id: "runtime_100",
          purpose: "runtime",
          assetScale: 1,
          path: "runtime_100/roundreel.json",
        },
      ],
    });

    expect(() =>
      validateV5GBundleManifest({
        ...manifest,
        exports: [{ ...manifest.exports[0], path: "/runtime_100/a.json" }],
      }),
    ).toThrow("relative POSIX path");
    expect(() =>
      validateV5GBundleManifest({
        ...manifest,
        exports: [{ ...manifest.exports[0], path: "../runtime_100/a.json" }],
      }),
    ).toThrow("parent segments");
    expect(() =>
      validateV5GBundleManifest({
        ...manifest,
        exports: [{ ...manifest.exports[0], path: "runtime_100/a.txt" }],
      }),
    ).toThrow("path must be JSON");
    expect(() =>
      validateV5GBundleManifest({
        ...manifest,
        exports: [{ ...manifest.exports[0], path: "other/roundreel.json" }],
      }),
    ).not.toThrow();
  });

  it("parses valid hex colors and rejects invalid ones", () => {
    expect(parseColorHex("#101827")).toBe(0x101827);
    expect(() => parseColorHex("101827")).toThrow(
      "Invalid V5G background color",
    );
  });

  it("rejects non-center coordinate mode", () => {
    expectInvalid((project) => {
      (project.stage as { coordinate: string }).coordinate = "top-left";
    }, "Unsupported V5G coordinate mode");
  });

  it("rejects unsupported schema major", () => {
    expectInvalid((project) => {
      project.schemaVersion = "V6G_0.0001";
    }, "Expected V5G_0.x or VNI_0.x");
  });

  it("rejects unsupported editor names", () => {
    expectInvalid((project) => {
      project.editor.name = "some_editor";
    }, "Unsupported V5G editor");
  });

  it("rejects top-level particles", () => {
    expectInvalid((project) => {
      (project.particles as unknown[]).push({ id: "p" });
    }, "Unsupported V5G top-level particles");
  });

  it("rejects non-empty layer keyframes", () => {
    expectInvalid((project) => {
      project.layers[0].keyframes = [
        {
          id: "key",
          time: 0,
          transform: project.layers[0].transform,
          opacity: 1,
          easing: "linear",
        },
      ];
    }, "Unsupported V5G keyframes");
  });

  it("rejects unknown animation type", () => {
    expectInvalid((project) => {
      (project.layers[0].animations[0] as { type: string }).type = "zoom";
    }, "Unsupported V5G animation type");
  });

  it("rejects unknown blend modes", () => {
    expectInvalid((project) => {
      (project.layers[0] as { blendMode: string }).blendMode = "overlay";
    }, "Unsupported V5G blendMode");
  });

  it("rejects unknown easing", () => {
    expectInvalid((project) => {
      project.layers[0].animations[0].params.easing = "soft";
    }, "Unsupported V5G easing");
  });

  it("accepts supported layer animation types", () => {
    for (const [type, params] of Object.entries(newAnimationParams)) {
      const project = validProject();
      project.layers[0].animations = [
        animation(type as V5GAnimationType, params),
      ];
      expect(() => validateV5GProject(project)).not.toThrow();
    }
  });

  it("accepts VNI_0.070 sequence layers with explicit image frames", () => {
    const project = validProject();
    project.schemaVersion = "VNI_0.070";
    project.editor.version = "VNI_0.070";
    project.layers[0] = {
      ...project.layers[0],
      type: "sequence",
      assetId: null,
      sequence: {
        frameAssetIds: [project.assets[0].id, project.assets[1].id],
        cycleDuration: 0.2,
        loop: true,
      },
    };

    expect(() => validateV5GProject(project)).not.toThrow();
    expect(assertVNIProject(project).layers[0].type).toBe("sequence");
  });

  it("rejects invalid sequence layer contracts explicitly", () => {
    expectInvalid((project) => {
      project.layers[0] = {
        ...project.layers[0],
        type: "sequence",
        sequence: {
          frameAssetIds: [project.assets[0].id],
          cycleDuration: 0.2,
          loop: true,
        },
      };
    }, "must not reference assetId");

    expectInvalid((project) => {
      project.layers[0] = {
        ...project.layers[0],
        type: "sequence",
        assetId: null,
      };
    }, "requires sequence config");

    expectInvalid((project) => {
      project.layers[0] = {
        ...project.layers[0],
        type: "sequence",
        assetId: null,
        sequence: {
          frameAssetIds: [],
          cycleDuration: 0.2,
          loop: true,
        },
      };
    }, "frameAssetIds must be non-empty");

    expectInvalid((project) => {
      project.layers[0] = {
        ...project.layers[0],
        type: "sequence",
        assetId: null,
        sequence: {
          frameAssetIds: ["missing"],
          cycleDuration: 0.2,
          loop: true,
        },
      };
    }, 'references missing frame asset "missing"');

    expectInvalid((project) => {
      project.layers[0] = {
        ...project.layers[0],
        sequence: {
          frameAssetIds: [project.assets[0].id],
          cycleDuration: 0.2,
          loop: true,
        },
      };
    }, "must not include sequence config");
  });

  it("rejects animations that exceed stage duration", () => {
    expectInvalid((project) => {
      project.layers[0].animations[0].startTime = 9.95;
      project.layers[0].animations[0].duration = 0.1;
    }, "exceeds stage.duration");
  });

  it("rejects missing required animation params", () => {
    expectInvalid((project) => {
      delete project.layers[0].animations[0].params.toScaleX;
    }, 'requires numeric param "toScaleX"');
  });

  it("rejects invalid multi_move pointsJson contracts", () => {
    expectInvalid((project) => {
      project.layers[0].animations = [animation("multi_move", {})];
    }, "multi_move pointsJson must be a JSON string");

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("multi_move", { pointsJson: "{not json" }),
      ];
    }, "multi_move pointsJson must be valid JSON");

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("multi_move", { pointsJson: JSON.stringify({ x: 0 }) }),
      ];
    }, "multi_move pointsJson must be a JSON array");

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("multi_move", {
          pointsJson: JSON.stringify([
            { x: 0, y: 0, time: 0, easing: "linear" },
          ]),
        }),
      ];
    }, "multi_move pointsJson must contain at least two points");

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("multi_move", {
          pointsJson: JSON.stringify([
            { x: 0, y: 0, time: 0, easing: "linear" },
            { x: "100", y: 0, time: 1, easing: "linear" },
          ]),
        }),
      ];
    }, "pointsJson[1].x must be a finite number");

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("multi_move", {
          pointsJson: JSON.stringify([
            { x: 0, y: 0, time: 0, easing: "linear" },
            { x: 5000.01, y: 0, time: 1, easing: "linear" },
          ]),
        }),
      ];
    }, "pointsJson[1].x must be within -5000..5000");

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("multi_move", {
          pointsJson: JSON.stringify([
            { x: 0, y: 0, time: 0, easing: "linear" },
            { x: 100, y: 0, time: 9, easing: "linear" },
          ]),
        }),
      ];
    }, "pointsJson[1].time must be within 0..1");

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("multi_move", {
          pointsJson: JSON.stringify([
            { x: 0, y: 0, time: 0, easing: "linear" },
            { x: 100, y: 0, time: 1, easing: "mystery" },
          ]),
        }),
      ];
    }, "pointsJson[1].easing must be a supported easing");
  });

  it("rejects missing new animation numeric params", () => {
    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("scale_in", { fromScale: 0, fadeIn: true }),
      ];
    }, 'requires numeric param "toScale"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.particle_wall };
      delete params.spawnRate;
      project.layers[0].animations = [animation("particle_wall", params)];
    }, 'requires numeric param "spawnRate"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.particle_combo };
      delete params.targetY;
      project.layers[0].animations = [animation("particle_combo", params)];
    }, 'requires numeric param "targetY"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.particle_stream };
      delete params.lifetime;
      project.layers[0].animations = [animation("particle_stream", params)];
    }, 'requires numeric param "lifetime"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.chaser_light };
      delete params.totalCount;
      project.layers[0].animations = [animation("chaser_light", params)];
    }, 'requires numeric param "totalCount"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.squash_stretch };
      delete params.squashAmount;
      project.layers[0].animations = [animation("squash_stretch", params)];
    }, 'requires numeric param "squashAmount"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.shatter };
      delete params.sourceOpacity;
      project.layers[0].animations = [animation("shatter", params)];
    }, 'requires numeric param "sourceOpacity"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.glow };
      delete params.blendMode;
      project.layers[0].animations = [animation("glow", params)];
    }, 'requires numeric param "blendMode"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.safe_glow };
      delete params.spread;
      project.layers[0].animations = [animation("safe_glow", params)];
    }, 'requires numeric param "spread"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.gather_particles };
      delete params.targetY;
      project.layers[0].animations = [animation("gather_particles", params)];
    }, 'requires numeric param "targetY"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.wave_distort };
      delete params.phaseOffset;
      project.layers[0].animations = [animation("wave_distort", params)];
    }, 'requires numeric param "phaseOffset"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.path_particles };
      delete params.endY;
      project.layers[0].animations = [animation("path_particles", params)];
    }, 'requires numeric param "endY"');
  });

  it("rejects string numeric params", () => {
    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("scale_in", {
          fromScale: 0,
          toScale: "1",
          fadeIn: true,
        }),
      ];
    }, 'requires numeric param "toScale"');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("particle_combo", {
          ...newAnimationParams.particle_combo,
          sourceOpacity: "0",
        }),
      ];
    }, 'requires numeric param "sourceOpacity"');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("safe_glow", {
          ...newAnimationParams.safe_glow,
          spread: "0.12",
        }),
      ];
    }, 'requires numeric param "spread"');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("particle_stream", {
          ...newAnimationParams.particle_stream,
          lifetime: "1",
        }),
      ];
    }, 'requires numeric param "lifetime"');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("chaser_light", {
          ...newAnimationParams.chaser_light,
          totalCount: "12",
        }),
      ];
    }, 'requires numeric param "totalCount"');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("flame_flicker", {
          ...newAnimationParams.flame_flicker,
          speed: "fast",
        }),
      ];
    }, 'param "speed" must be a finite number');
  });

  it("rejects non-boolean optional flags", () => {
    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("particles", {
          count: 4,
          spread: 20,
          speed: 30,
          size: 16,
          gravity: 10,
          fadeOut: "true",
        }),
      ];
    }, 'param "fadeOut" must be a boolean');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("shake", {
          amplitudeX: 12,
          amplitudeY: 4,
          cycles: 3,
          decay: 1,
        }),
      ];
    }, 'param "decay" must be a boolean');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("shatter", {
          ...newAnimationParams.shatter,
          fadeOut: 1,
        }),
      ];
    }, 'param "fadeOut" must be a boolean');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("glow", {
          ...newAnimationParams.glow,
          keepOriginal: "false",
        }),
      ];
    }, 'param "keepOriginal" must be a boolean');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("safe_glow", {
          ...newAnimationParams.safe_glow,
          keepOriginal: "false",
        }),
      ];
    }, 'param "keepOriginal" must be a boolean');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("chaser_light", {
          ...newAnimationParams.chaser_light,
          keepOriginal: "false",
        }),
      ];
    }, 'param "keepOriginal" must be a boolean');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("speed_lines", {
          ...newAnimationParams.speed_lines,
          fadeOut: 1,
        }),
      ];
    }, 'param "fadeOut" must be a boolean');
  });

  it("rejects invalid layer masks", () => {
    expectInvalid((project) => {
      project.layers[0].mask = {
        enabled: true,
        sourceLayerId: null,
        mode: "alpha",
        compositeMode: "precompose_light_alpha",
        showSourceLayer: true,
      };
    }, "requires sourceLayerId");

    expectInvalid((project) => {
      project.layers[0].mask = {
        enabled: true,
        sourceLayerId: project.layers[0].id,
        mode: "alpha",
        compositeMode: "precompose_light_alpha",
        showSourceLayer: true,
      };
    }, "must not reference itself");

    expectInvalid((project) => {
      project.layers[0].mask = {
        enabled: true,
        sourceLayerId: "missing",
        mode: "alpha",
        compositeMode: "precompose_light_alpha",
        showSourceLayer: true,
      };
    }, 'references missing source layer "missing"');

    expectInvalid((project) => {
      project.layers[0].mask = {
        enabled: true,
        sourceLayerId: project.layers[1].id,
        mode: "alpha",
        compositeMode: "unknown" as "legacy_alpha",
        showSourceLayer: true,
      };
    }, "Unsupported VNI mask compositeMode");
  });

  it("rejects group layers and nested layers", () => {
    expectInvalid((project) => {
      project.layers[0].type = "group";
    }, "Unsupported V5G layer type: group");
    expectInvalid((project) => {
      project.layers[0].parentId = "parent";
    }, "Unsupported V5G parentId");
  });

  it("rejects invalid layer group schema and references", () => {
    expectInvalid((project) => {
      project.layerGroups = [];
    }, "project.layerGroups must be a non-empty array");

    expectInvalid((project) => {
      project.layerGroups.push({ ...project.layerGroups[0] });
    }, "Duplicate VNI layer group id");

    expectInvalid((project) => {
      project.layerGroups.push({
        id: "another",
        name: "Another",
        visible: true,
        collapsed: false,
        order: project.layerGroups[0].order,
      });
    }, "Duplicate VNI layer group order");

    expectInvalid((project) => {
      project.layers[0].groupId = "missing";
    }, 'references missing layer group "missing"');

    expectInvalid((project) => {
      delete project.layers[0].groupId;
    }, 'layer "');
  });

  it("rejects groupId without layerGroups and non-contiguous group runs", () => {
    expect(() =>
      assertV5GProject({
        ...(projectData as object),
        layers: [
          {
            ...(projectData as { layers: Record<string, unknown>[] }).layers[0],
            groupId: DEFAULT_VNI_LAYER_GROUP_ID,
          },
        ],
        layerGroups: undefined,
      }),
    ).toThrow("missing project.layerGroups");

    const project = validProject();
    project.layerGroups.push({
      id: "upper",
      name: "Upper",
      visible: true,
      collapsed: false,
      order: 1,
    });
    project.layers = [
      { ...project.layers[0], id: "a", groupId: DEFAULT_VNI_LAYER_GROUP_ID },
      { ...project.layers[0], id: "b", groupId: "upper" },
      { ...project.layers[0], id: "c", groupId: DEFAULT_VNI_LAYER_GROUP_ID },
    ];

    expect(() => validateV5GProject(project)).toThrow("not contiguous");
  });
});

function animation(
  type: V5GAnimationType,
  params: V5GAnimationConfig["params"],
): V5GAnimationConfig {
  return {
    id: `anim-${type}`,
    type,
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 1,
    params,
  };
}
