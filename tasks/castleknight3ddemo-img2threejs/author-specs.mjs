import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const taskRoot = dirname(fileURLToPath(import.meta.url));

function colorRecipe(primary, secondary, materialClass, confidence = 0.95) {
  return {
    dominantAlbedo: primary,
    secondaryAlbedo: secondary,
    materialClass,
    materialClassConfidence: confidence,
    evidenceRefs: ["full-object"],
  };
}

function actionProfile(id, collider = "box", pivot = [0, 0, 0]) {
  return {
    animationRole: id === "lid-shell" ? "articulated-lid" : "static-section",
    pivot: {
      mode: id === "lid-shell" ? "rear-edge" : "center",
      localPosition: pivot,
      axis: id === "lid-shell" ? [1, 0, 0] : [0, 1, 0],
      confidence: 0.9,
    },
    transformChannels: {
      translate: true,
      rotate: true,
      scale: true,
      detach: id !== "root",
      visibility: true,
      materialState: true,
    },
    sockets: [],
    collider: {
      type: collider,
      offset: [0, 0, 0],
      scale: [1, 1, 1],
      isTrigger: false,
    },
    constraints: [],
    destruction: {
      breakable: id !== "root",
      fractureGroup: id,
      seamRefs: [],
      detachableFragments: [],
      breakImpulse: 1,
      debrisMaterial: "matching-surface",
    },
  };
}

function component({
  id,
  name,
  level,
  role,
  primitive,
  topologyClass,
  rationale,
  parent,
  material,
  dimensions,
  position,
  recipe,
  features = [],
  collider = "box",
  pivot = [0, 0, 0],
}) {
  return {
    id,
    name,
    level,
    role,
    importance: level === "macro" ? 1 : 0.82,
    confidence: 0.92,
    primitive,
    topologyClass,
    topologyRationale: rationale,
    geometryDescriptor: {
      topologyIntent: "stylized real-time prop with silhouette-readable bevels",
      edgeTreatment: { type: "bevel", bevelRadius: 0.035, segments: 2 },
      deformationStack: [],
      uvStrategy:
        primitive === "lathe" || primitive === "torus"
          ? "cylindrical projection"
          : "generated procedural coordinates",
      normalStrategy: "faceted vertex normals with beveled transitions",
    },
    parent,
    attachment: null,
    dimensions: {
      width: dimensions[0],
      height: dimensions[1],
      depth: dimensions[2],
      units: "relative",
      confidence: 0.92,
    },
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: actionProfile(id, collider, pivot),
    material,
    materialLayers: [material],
    colorMaterialRecipe: recipe,
    deformations: [],
    joints: [],
    seams: [],
    localFeatures: features.map((feature) => ({
      id: feature,
      description: feature.replaceAll("-", " "),
      geometryIntent:
        "explicit geometry or bounded procedural surface response",
      evidenceRefs: ["full-object"],
    })),
    surfaceDetail: {
      macroRoughness: 0.2,
      microRoughness: 0.12,
      bumpAmplitude: 0.025,
      normalPattern: "independent procedural detail",
      displacementPattern: "none",
      occlusionPattern: "crease and contact weighted",
      edgeWearPattern: "exposed bevel crests only",
      notes: "Keep relief readable at slot-symbol scale.",
    },
    evidenceRefs: ["full-object"],
    details: [],
    fidelityTier: level === "macro" ? "blockout" : "structural-pass",
  };
}

function material({
  id,
  name,
  color,
  secondary,
  materialClass,
  roughness,
  metalness,
  overrides,
}) {
  return {
    id,
    name,
    type: materialClass === "metal" ? "standard" : "toon",
    shaderModel:
      materialClass === "metal" ? "MeshStandardMaterial" : "MeshToonMaterial",
    baseColor: color,
    color,
    albedo: {
      dominant: color,
      secondary: [secondary],
      samplingNotes: "Observed from generated hero reference.",
    },
    colorVariation: {
      palette: [color, secondary],
      pattern: "bounded hand-painted mottling",
      amplitude: 0.12,
      heightCorrelation: 0.2,
    },
    roughness: {
      base: roughness,
      variation: 0.12,
      map: "independent-procedural-field",
      localResponse: "higher in cavities and lower on bevel crests",
    },
    metalness: {
      base: metalness,
      variation: materialClass === "metal" ? 0.08 : 0,
    },
    normal: {
      pattern: "independent-detail-field",
      strength: 0.22,
      scale: 20,
      space: "tangent",
    },
    bump: { pattern: "independent-height-field", amplitude: 0.025, scale: 16 },
    ambientOcclusion: {
      cavityStrength: 0.28,
      contactShadowBias: 0.36,
      notes: "Creases and overlapping reinforcement contacts.",
    },
    wear: {
      edgeWear: 0.12,
      scratches: ["sparse directional marks"],
      chips: ["selected exposed corners"],
    },
    dirt: { amount: 0.05, cavityBias: 0.7, color: "#211926" },
    localOverrides: overrides.map((override) => ({
      id: override,
      description: override.replaceAll("-", " "),
      evidenceRefs: ["full-object"],
    })),
    shaderNotes: [
      "Albedo, roughness and height responses remain independent.",
      "Use the shared project toon gradient for dielectric surfaces.",
    ],
  };
}

function repetition(
  id,
  parent,
  primitive,
  materialId,
  count,
  radius,
  instanceScale,
  level = "micro",
) {
  return {
    id,
    name: id.replaceAll("-", " "),
    level,
    parent,
    primitive,
    material: materialId,
    count,
    placement: { mode: "radial", axis: [0, 1, 0], radius, startAngleDeg: 0 },
    instanceScale,
    distributionRule: "even radial spacing with mirrored visual balance",
    buildsGeometry: true,
    evidenceRefs: ["full-object"],
  };
}

function detail(id, kind, ref) {
  const linkedRef = ref.replaceAll(":", "/");
  return {
    id,
    kind,
    description: id.replaceAll("-", " "),
    mapsTo: {
      type: ref.includes("material")
        ? "material.localOverrides"
        : "component.localFeatures",
      ref: linkedRef,
    },
    confidence: 0.9,
  };
}

function commonPatch(spec) {
  spec.suitability = "pass";
  spec.referenceCamera = {
    solved: true,
    fovDegrees: 34,
    aspect: 1.25,
    orientation: { yaw: -28, pitch: -14, roll: 0 },
    positionHint: [3, 2.2, 5],
    note: "Near-orthographic three-quarter reconstruction review camera inferred from the generated hero view.",
  };
  spec.scores = {
    object_isolation: 3,
    silhouette_readability: 3,
    depth_inference: 3,
    primitive_decomposition: 3,
    material_procedurality: 3,
    occlusion_risk: 1,
    interaction_fit: 3,
  };
  spec.preSpecAssessment.unknownsToResolveBeforeImplementation = [];
  spec.lookDevTargets.qualityPriority = "stylized-realtime";
  spec.lookDevTargets.materialPass.referencePbrExtraction.requiredWhenSourceImagePresent = false;
  spec.lookDevTargets.materialPass.referencePbrExtraction.stopOnLowConfidence = false;
  spec.lightingFromPhoto = [
    "warm key light from camera-left with soft shadow edge",
    "cool violet fill light from rear/right",
    "subtle rim light for silhouette separation",
    "ACES filmic tone mapping, exposure 1.25, neutral background and contact shadow",
  ];
  spec.proceduralStrategy = [
    "Build named macro and meso pivot groups from primitives, Shape extrusions and radial repetition systems.",
    "Use deterministic procedural detail maps and toon-gradient shading; do not download or extract a mesh.",
    "Keep independently movable or detachable structural sections as separate Object3D nodes.",
  ];
  spec.performanceBudget.targetTriangles = 12000;
  spec.performanceBudget.drawCallsTarget = 18;
  for (const pass of spec.buildPasses)
    pass.componentRefs = spec.componentTree.map((item) => item.id);
}

async function authorChest() {
  const path = join(taskRoot, "treasure-chest", "object-sculpt-spec.json");
  const spec = JSON.parse(await readFile(path, "utf8"));
  const woodRecipe = colorRecipe(
    "rgba(121, 57, 24, 1)",
    "rgba(181, 91, 34, 1)",
    "wood",
  );
  const goldRecipe = colorRecipe(
    "rgba(218, 143, 20, 1)",
    "rgba(255, 196, 55, 1)",
    "metal",
  );
  const ironRecipe = colorRecipe(
    "rgba(54, 47, 58, 1)",
    "rgba(102, 91, 105, 1)",
    "metal",
  );
  const gemRecipe = colorRecipe(
    "rgba(126, 35, 207, 1)",
    "rgba(205, 96, 255, 1)",
    "glass",
  );
  spec.assumptions = [
    "The unseen underside uses a recessed plain wooden base.",
    "The closed exterior is authoritative; the action-ready lid pivot exposes no modeled interior in this pass.",
    "Wear placement is deterministic and approximate because small marks vary between generated views.",
  ];
  spec.silhouette = {
    boundingShape: "squat beveled cuboid body under a half-cylinder lid",
    aspectRatios: ["width:height=1.45", "depth:width=0.75"],
    symmetry: "bilateral across the vertical front plane",
    dominantCurves: ["semicircular lid", "pointed gem escutcheon"],
    negativeSpaces: [
      "thin shadow seam between body and lid",
      "gaps around hinge plates",
    ],
    landmarks: ["two lid hoops", "four corner feet", "central purple gem"],
  };
  spec.viewEvidence[0].observations = [
    "isolated connected silhouette",
    "front, side and lid surfaces visible",
    "four distinct material zones",
  ];
  spec.viewEvidence[0].confidence = 0.97;
  spec.componentTree = [
    component({
      id: "root",
      name: "Chest body shell",
      level: "macro",
      role: "main assembly",
      primitive: "box",
      topologyClass: "assembled-solid",
      rationale:
        "The lower body has six countable rigid faces with rounded bevels and plank relief.",
      parent: null,
      material: "wood-material",
      dimensions: [1.45, 0.68, 0.92],
      position: [0, 0.34, 0],
      recipe: woodRecipe,
      features: ["wood-plank-seams", "recessed-base"],
    }),
    component({
      id: "lid-shell",
      name: "Arched plank lid",
      level: "macro",
      role: "articulated shell",
      primitive: "extrude",
      topologyClass: "assembled-solid",
      rationale:
        "A rigid semicircular end profile is extruded through the chest depth and divided into raised plank courses.",
      parent: "root",
      material: "wood-material",
      dimensions: [1.42, 0.62, 0.92],
      position: [0, 0.88, 0],
      recipe: woodRecipe,
      features: ["arched-plank-courses", "rear-pivot"],
      pivot: [0, -0.28, -0.42],
    }),
    component({
      id: "reinforcement-frame",
      name: "Gold reinforcement frame",
      level: "macro",
      role: "reinforcement assembly",
      primitive: "box",
      topologyClass: "assembled-solid",
      rationale:
        "The frame is visibly assembled from rigid rails, posts and projecting feet rather than one continuous skin.",
      parent: "root",
      material: "gold-material",
      dimensions: [1.52, 0.13, 1],
      position: [0, 0.08, 0],
      recipe: goldRecipe,
      features: [
        "rail-post-overlaps",
        "projecting-foot-blocks",
        "domed-fastener-layout",
      ],
    }),
    component({
      id: "top-rail",
      name: "Upper gold rail",
      level: "meso",
      role: "reinforcement rail",
      primitive: "box",
      topologyClass: "assembled-solid",
      rationale: "A straight rigid rail overlaps the body-lid seam.",
      parent: "reinforcement-frame",
      material: "gold-material",
      dimensions: [1.5, 0.13, 0.98],
      position: [0, 0.65, 0],
      recipe: goldRecipe,
      features: ["bright-bevel-crest"],
    }),
    component({
      id: "lid-hoops",
      name: "Arched lid hoops",
      level: "meso",
      role: "curved reinforcement",
      primitive: "torus",
      topologyClass: "assembled-solid",
      rationale:
        "Two rigid metal bands follow the lid semicircle and affect the outer silhouette.",
      parent: "lid-shell",
      material: "gold-material",
      dimensions: [0.92, 0.14, 0.92],
      position: [0, 0.05, 0],
      recipe: goldRecipe,
      features: ["faceted-arched-bands"],
      collider: "torus",
    }),
    component({
      id: "front-lock",
      name: "Pointed lock escutcheon",
      level: "meso",
      role: "front ornament",
      primitive: "extrude",
      topologyClass: "assembled-solid",
      rationale:
        "The pointed layered plate has a countable polygon profile and shallow rigid depth.",
      parent: "root",
      material: "gold-material",
      dimensions: [0.4, 0.56, 0.08],
      position: [0, 0.58, 0.51],
      recipe: goldRecipe,
      features: ["layered-gem-escutcheon"],
    }),
    component({
      id: "gem",
      name: "Faceted purple gem",
      level: "meso",
      role: "lock inset",
      primitive: "ellipsoid",
      topologyClass: "assembled-solid",
      rationale:
        "A faceted convex crystal volume is embedded in the front lock plate.",
      parent: "front-lock",
      material: "gem-material",
      dimensions: [0.2, 0.32, 0.09],
      position: [0, 0, 0.06],
      recipe: gemRecipe,
      features: ["facet-value-zones"],
    }),
    component({
      id: "hinges",
      name: "Dark iron rear plates",
      level: "meso",
      role: "rear hardware",
      primitive: "box",
      topologyClass: "assembled-solid",
      rationale:
        "Stepped rectangular metal plates overlap the shell and terminate at the rear lid seam.",
      parent: "root",
      material: "iron-material",
      dimensions: [0.24, 0.3, 0.07],
      position: [0.45, 0.66, -0.49],
      recipe: ironRecipe,
      features: ["stepped-plate-cluster"],
    }),
  ];
  spec.materials = [
    material({
      id: "wood-material",
      name: "Hand-painted walnut",
      color: "#793918",
      secondary: "#B55B22",
      materialClass: "wood",
      roughness: 0.68,
      metalness: 0,
      overrides: ["directional-grain", "dark-plank-seams"],
    }),
    material({
      id: "gold-material",
      name: "Hammered antique gold",
      color: "#DA8F14",
      secondary: "#FFC437",
      materialClass: "metal",
      roughness: 0.31,
      metalness: 0.76,
      overrides: ["hammered-edge-wear", "bright-bevel-crests"],
    }),
    material({
      id: "iron-material",
      name: "Dark iron hardware",
      color: "#362F3A",
      secondary: "#665B69",
      materialClass: "metal",
      roughness: 0.44,
      metalness: 0.72,
      overrides: ["plate-edge-wear"],
    }),
    material({
      id: "gem-material",
      name: "Violet crystal",
      color: "#7E23CF",
      secondary: "#CD60FF",
      materialClass: "glass",
      roughness: 0.2,
      metalness: 0.04,
      overrides: ["facet-value-zones", "emissive-center"],
    }),
  ];
  spec.repetitionSystems = [
    repetition(
      "domed-fastener-layout",
      "reinforcement-frame",
      "sphere",
      "gold-material",
      8,
      1.25,
      [0.055, 0.055, 0.035],
    ),
    repetition(
      "lid-band-pair",
      "lid-shell",
      "torus",
      "gold-material",
      2,
      0.72,
      [0.12, 0.12, 0.12],
      "meso",
    ),
    repetition(
      "iron-plate-rivets",
      "hinges",
      "sphere",
      "iron-material",
      4,
      0.18,
      [0.035, 0.035, 0.02],
    ),
  ];
  spec.preSpecAssessment.detailInventory.details = [
    detail("arched-lid-profile", "contour", "lid-shell:arched-plank-courses"),
    detail("gold-lid-hoops", "ridge", "lid-hoops:faceted-arched-bands"),
    detail("wood-grain", "linework", "wood-material:directional-grain"),
    detail(
      "gold-corner-cage",
      "seam",
      "reinforcement-frame:rail-post-overlaps",
    ),
    detail("gem-lock", "contour", "front-lock:layered-gem-escutcheon"),
    detail("gem-highlight", "emissive", "gem-material:facet-value-zones"),
    detail("iron-hardware", "bevel", "hinges:stepped-plate-cluster"),
    detail("rivet-system", "fastener", "domed-fastener-layout"),
    detail("hammered-gold", "gloss", "gold-material:hammered-edge-wear"),
    detail(
      "base-corner-feet",
      "contour",
      "reinforcement-frame:projecting-foot-blocks",
    ),
  ];
  spec.qualityContract.minimumSpecDepth = {
    macroComponents: 3,
    mesoComponents: 5,
    microFeatureGroups: 10,
    materialLayers: 4,
    repetitionSystems: 3,
    reviewViewpoints: 4,
  };
  spec.featureReviewTargets = [
    {
      id: "arched-lid-silhouette",
      name: "Arched plank lid silhouette",
      tier: "critical",
      passIds: ["blockout", "form-refinement"],
      minimumScore: 0.82,
      mustPass: true,
      componentRefs: ["root", "lid-shell"],
      evidenceRefs: ["full-object"],
    },
    {
      id: "reinforcement-cage",
      name: "Gold rail, hoop and corner reinforcement cage",
      tier: "critical",
      passIds: ["structural-pass", "form-refinement"],
      minimumScore: 0.8,
      mustPass: true,
      componentRefs: ["reinforcement-frame", "top-rail", "lid-hoops"],
      evidenceRefs: ["full-object"],
    },
    {
      id: "gem-lock-system",
      name: "Pointed purple gem lock system",
      tier: "critical",
      passIds: ["structural-pass", "material-pass"],
      minimumScore: 0.82,
      mustPass: true,
      componentRefs: ["front-lock", "gem"],
      evidenceRefs: ["full-object"],
    },
    {
      id: "wood-metal-lookdev",
      name: "Wood, gold and dark iron material separation",
      tier: "important",
      passIds: ["material-pass", "surface-pass"],
      minimumScore: 0.72,
      mustPass: false,
      componentRefs: ["root", "reinforcement-frame", "hinges"],
      evidenceRefs: ["full-object"],
    },
  ];
  commonPatch(spec);
  await writeFile(path, `${JSON.stringify(spec, null, 2)}\n`);
}

async function authorColumn() {
  const path = join(taskRoot, "round-column", "object-sculpt-spec.json");
  const spec = JSON.parse(await readFile(path, "utf8"));
  const stoneRecipe = colorRecipe(
    "rgba(91, 72, 112, 1)",
    "rgba(151, 111, 155, 1)",
    "stone",
  );
  const darkRecipe = colorRecipe(
    "rgba(48, 37, 67, 1)",
    "rgba(91, 72, 112, 1)",
    "stone",
  );
  spec.assumptions = [
    "Radial symmetry makes the generated side and rear reference views structurally equivalent.",
    "Crack and chip placement is deterministic but approximate because marks vary between views.",
    "Dimensions are normalized to the existing castle hall rather than architectural measurements.",
  ];
  spec.silhouette = {
    boundingShape:
      "tall tapered circular shaft between broad octagonal base and widened capital",
    aspectRatios: [
      "height:shaft-diameter=6.5",
      "base-width:shaft-diameter=1.75",
    ],
    symmetry: "eight-fold radial symmetry",
    dominantCurves: [
      "concentric base rings",
      "tapered drum shaft",
      "flared capital",
    ],
    negativeSpaces: [
      "cavity gaps between capital brackets",
      "recessed drum seams",
    ],
    landmarks: [
      "five shaft drums",
      "eight capital brackets",
      "two-course octagonal base",
    ],
  };
  spec.viewEvidence[0].observations = [
    "isolated connected silhouette",
    "circular shaft confirmed by three-quarter view",
    "base-to-capital axial stack fully visible",
  ];
  spec.viewEvidence[0].confidence = 0.98;
  spec.componentTree = [
    component({
      id: "root",
      name: "Octagonal base stack",
      level: "macro",
      role: "main assembly",
      primitive: "extrude",
      topologyClass: "assembled-solid",
      rationale:
        "Two rigid eight-sided plinth courses have countable faces and stepped bevels.",
      parent: null,
      material: "stone-material",
      dimensions: [2.05, 0.62, 2.05],
      position: [0, 0.31, 0],
      recipe: stoneRecipe,
      features: ["two-course-octagonal-plinth", "sparse-chips-cracks"],
    }),
    component({
      id: "shaft-drums",
      name: "Five circular shaft drums",
      level: "macro",
      role: "shaft assembly",
      primitive: "lathe",
      topologyClass: "continuous-sculpt",
      rationale:
        "The rotationally symmetric tapered shaft profile varies continuously around the vertical axis and is divided by intentional drum seams.",
      parent: "root",
      material: "stone-material",
      dimensions: [1.12, 3.45, 1.12],
      position: [0, 2.28, 0],
      recipe: stoneRecipe,
      features: ["five-segment-stack", "radial-flute-array"],
      collider: "cylinder",
    }),
    component({
      id: "capital-stack",
      name: "Ornate widened capital",
      level: "macro",
      role: "capital assembly",
      primitive: "lathe",
      topologyClass: "continuous-sculpt",
      rationale:
        "The neck and bowl transition form one rotationally symmetric widening profile beneath separate radial brackets.",
      parent: "shaft-drums",
      material: "stone-dark-material",
      dimensions: [1.65, 0.82, 1.65],
      position: [0, 2.1, 0],
      recipe: darkRecipe,
      features: ["capital-cavity-darkening", "flared-profile"],
      collider: "cylinder",
    }),
    component({
      id: "base-rings",
      name: "Triple base transition rings",
      level: "meso",
      role: "transition rings",
      primitive: "torus",
      topologyClass: "assembled-solid",
      rationale:
        "Three rigid circular ring courses socket the shaft into the octagonal plinth.",
      parent: "root",
      material: "stone-material",
      dimensions: [1.48, 0.34, 1.48],
      position: [0, 0.55, 0],
      recipe: stoneRecipe,
      features: ["triple-radius-transition"],
      collider: "torus",
    }),
    component({
      id: "drum-seams",
      name: "Drum seam rings",
      level: "meso",
      role: "shaft seams",
      primitive: "torus",
      topologyClass: "surface-relief",
      rationale:
        "Narrow circular bands interrupt the shaft surface at each drum boundary without replacing the main volume.",
      parent: "shaft-drums",
      material: "stone-dark-material",
      dimensions: [1.14, 0.06, 1.14],
      position: [0, 0, 0],
      recipe: darkRecipe,
      features: ["five-drum-boundaries"],
      collider: "torus",
    }),
    component({
      id: "capital-rings",
      name: "Double capital neck rings",
      level: "meso",
      role: "capital transition",
      primitive: "torus",
      topologyClass: "assembled-solid",
      rationale:
        "Two rounded circular rings bridge the shaft radius to the bracket capital.",
      parent: "capital-stack",
      material: "stone-material",
      dimensions: [1.42, 0.28, 1.42],
      position: [0, -0.32, 0],
      recipe: stoneRecipe,
      features: ["double-neck-transition"],
      collider: "torus",
    }),
    component({
      id: "capital-brackets",
      name: "Radial geometric leaf brackets",
      level: "meso",
      role: "capital ornaments",
      primitive: "extrude",
      topologyClass: "assembled-solid",
      rationale:
        "Each leaf bracket is a rigid faceted wedge with an extruded polygon profile and radial repetition.",
      parent: "capital-stack",
      material: "stone-material",
      dimensions: [0.36, 0.58, 0.24],
      position: [0, 0.18, 0.72],
      recipe: stoneRecipe,
      features: ["radial-leaf-array"],
    }),
    component({
      id: "top-slab",
      name: "Projecting octagonal top slab",
      level: "meso",
      role: "bearing slab",
      primitive: "extrude",
      topologyClass: "assembled-solid",
      rationale:
        "The wide eight-sided slab has rigid countable faces and a broad perimeter bevel.",
      parent: "capital-stack",
      material: "stone-material",
      dimensions: [1.95, 0.34, 1.95],
      position: [0, 0.62, 0],
      recipe: stoneRecipe,
      features: ["projecting-octagonal-course", "broad-bevel"],
    }),
  ];
  spec.materials = [
    material({
      id: "stone-material",
      name: "Purple-gray hand-hewn stone",
      color: "#5B4870",
      secondary: "#976F9B",
      materialClass: "stone",
      roughness: 0.88,
      metalness: 0,
      overrides: [
        "mauve-mottling",
        "sparse-chips-cracks",
        "warm-bevel-highlights",
      ],
    }),
    material({
      id: "stone-dark-material",
      name: "Violet seam and cavity stone",
      color: "#302543",
      secondary: "#5B4870",
      materialClass: "stone",
      roughness: 0.93,
      metalness: 0,
      overrides: ["capital-cavity-darkening", "drum-seam-darkening"],
    }),
    material({
      id: "stone-highlight-material",
      name: "Mauve exposed bevel stone",
      color: "#A57CA8",
      secondary: "#765B88",
      materialClass: "stone",
      roughness: 0.82,
      metalness: 0,
      overrides: ["selected-bevel-crests"],
    }),
  ];
  spec.repetitionSystems = [
    repetition(
      "capital-leaf-array",
      "capital-stack",
      "extrude",
      "stone-material",
      8,
      1.34,
      [0.28, 0.55, 0.18],
      "meso",
    ),
    repetition(
      "shaft-flute-array",
      "shaft-drums",
      "box",
      "stone-highlight-material",
      12,
      1.02,
      [0.035, 1.6, 0.055],
    ),
    repetition(
      "drum-seam-array",
      "shaft-drums",
      "torus",
      "stone-dark-material",
      4,
      0.08,
      [0.58, 0.055, 0.58],
      "meso",
    ),
  ];
  spec.preSpecAssessment.detailInventory.details = [
    detail("top-slab", "bevel", "top-slab:projecting-octagonal-course"),
    detail("capital-brackets", "contour", "capital-brackets:radial-leaf-array"),
    detail(
      "capital-cavities",
      "stain",
      "stone-dark-material:capital-cavity-darkening",
    ),
    detail("neck-rings", "ridge", "capital-rings:double-neck-transition"),
    detail("five-drum-seams", "seam", "shaft-drums:five-segment-stack"),
    detail("shaft-fluting", "groove", "shaft-drums:radial-flute-array"),
    detail("base-rings", "ridge", "base-rings:triple-radius-transition"),
    detail("octagonal-base", "contour", "root:two-course-octagonal-plinth"),
    detail("stone-mottling", "stain", "stone-material:mauve-mottling"),
    detail("stone-chips", "chip", "stone-material:sparse-chips-cracks"),
  ];
  spec.qualityContract.minimumSpecDepth = {
    macroComponents: 3,
    mesoComponents: 5,
    microFeatureGroups: 10,
    materialLayers: 3,
    repetitionSystems: 3,
    reviewViewpoints: 4,
  };
  spec.featureReviewTargets = [
    {
      id: "round-shaft-silhouette",
      name: "Circular tapered five-drum shaft silhouette",
      tier: "critical",
      passIds: ["blockout", "form-refinement"],
      minimumScore: 0.84,
      mustPass: true,
      componentRefs: ["root", "shaft-drums"],
      evidenceRefs: ["full-object"],
    },
    {
      id: "stepped-base-system",
      name: "Octagonal base and concentric transition system",
      tier: "critical",
      passIds: ["structural-pass", "form-refinement"],
      minimumScore: 0.8,
      mustPass: true,
      componentRefs: ["root", "base-rings"],
      evidenceRefs: ["full-object"],
    },
    {
      id: "radial-capital-system",
      name: "Radial bracket capital and projecting top slab",
      tier: "critical",
      passIds: ["structural-pass", "form-refinement"],
      minimumScore: 0.82,
      mustPass: true,
      componentRefs: ["capital-stack", "capital-brackets", "top-slab"],
      evidenceRefs: ["full-object"],
    },
    {
      id: "purple-stone-lookdev",
      name: "Purple-gray stone mottling, seams and bevel response",
      tier: "important",
      passIds: ["material-pass", "surface-pass"],
      minimumScore: 0.72,
      mustPass: false,
      componentRefs: ["root", "shaft-drums", "capital-stack"],
      evidenceRefs: ["full-object"],
    },
  ];
  commonPatch(spec);
  await writeFile(path, `${JSON.stringify(spec, null, 2)}\n`);
}

await authorChest();
await authorColumn();
