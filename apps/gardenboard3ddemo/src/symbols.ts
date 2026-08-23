import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  ExtrudeGeometry,
  FrontSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  RepeatWrapping,
  RedFormat,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  UnsignedByteType,
  Vector2,
  Vector3,
  type Texture,
} from "three";
import { BOARD, boardDepth, boardWidth } from "./config.js";
import { createRandom, type RandomSource } from "./random.js";

export const SYMBOL_TYPES = [
  "donut",
  "toast",
  "banana",
  "strawberry",
  "carrot",
] as const;

const SYMBOL_STAGGER_SECONDS = 0.014;
const SYMBOL_CAMERA_TILT_RADIANS = (Math.PI / 180) * 30;
const SYMBOL_TILT_ROTATION_X = -Math.PI / 2 + SYMBOL_CAMERA_TILT_RADIANS;
const HOVER_SHADOW_OPACITY = 0.14;

export type SymbolType = (typeof SYMBOL_TYPES)[number];

const SYMBOL_VISUAL_SCALE: Readonly<Record<SymbolType, number>> = {
  donut: 1,
  toast: 1,
  banana: 1.08,
  strawberry: 1.04,
  carrot: 1.06,
};

export interface SymbolPlacement {
  readonly type: SymbolType;
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly phase: number;
  readonly rotation: number;
  readonly delay: number;
}

interface SurfaceTextureSet {
  readonly albedo: CanvasTexture;
  readonly bump: CanvasTexture;
  readonly baseColor: Color;
  dispose(): void;
}

interface SurfaceOptions {
  readonly seed: number;
  readonly base: string;
  readonly accent: string;
  readonly pattern: "pores" | "mottle" | "spots" | "seeds" | "ridges" | "veins";
}

interface ToonStyleResources {
  readonly gradientMap: DataTexture;
  readonly outlineMaterial: MeshBasicMaterial;
}

interface AnimatedSymbol {
  readonly pivot: Group;
  readonly tilt: Group;
  readonly spinner: Group;
  readonly shadow: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly placement: SymbolPlacement;
  readonly spinSpeed: number;
}

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable.");
  return context;
}

function createHoverShadowTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = requireContext(canvas);
  const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.92)");
  gradient.addColorStop(0.48, "rgba(255, 255, 255, 0.58)");
  gradient.addColorStop(0.78, "rgba(255, 255, 255, 0.18)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

function configureTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1.35, 1.35);
}

function createSurfaceTextures(options: SurfaceOptions): SurfaceTextureSet {
  const size = 256;
  const random = createRandom(options.seed);
  const albedoCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  for (const canvas of [albedoCanvas, bumpCanvas]) {
    canvas.width = size;
    canvas.height = size;
  }
  const albedo = requireContext(albedoCanvas);
  const bump = requireContext(bumpCanvas);
  albedo.fillStyle = options.base;
  albedo.fillRect(0, 0, size, size);
  bump.fillStyle = "#7b7b7b";
  bump.fillRect(0, 0, size, size);

  const accent = new Color(options.accent);
  const marks =
    options.pattern === "pores" ? 180 : options.pattern === "spots" ? 70 : 110;
  for (let index = 0; index < marks; index += 1) {
    const x = random.range(0, size);
    const y = random.range(0, size);
    const radius =
      options.pattern === "spots"
        ? random.range(3.5, 8.5)
        : options.pattern === "pores"
          ? random.range(1, 2.8)
          : random.range(1.8, 4.6);
    const color = accent
      .clone()
      .offsetHSL(random.range(-0.02, 0.02), 0, random.range(-0.08, 0.08));
    albedo.fillStyle = `#${color.getHexString()}`;
    albedo.globalAlpha = random.range(0.1, 0.32);
    if (options.pattern === "ridges" || options.pattern === "veins") {
      albedo.strokeStyle = albedo.fillStyle;
      albedo.lineWidth = random.range(1, 2.2);
      albedo.beginPath();
      albedo.moveTo(x, y);
      albedo.lineTo(x + random.range(-3, 3), y + random.range(7, 18));
      albedo.stroke();
    } else {
      albedo.beginPath();
      albedo.ellipse(
        x,
        y,
        radius,
        radius * random.range(0.45, 1),
        0,
        0,
        Math.PI * 2,
      );
      albedo.fill();
    }

    const bumpValue = Math.floor(
      options.pattern === "pores"
        ? random.range(70, 115)
        : random.range(120, 190),
    );
    bump.fillStyle = `rgb(${bumpValue}, ${bumpValue}, ${bumpValue})`;
    bump.globalAlpha = random.range(0.25, 0.55);
    bump.beginPath();
    bump.ellipse(
      x,
      y,
      radius,
      radius * random.range(0.35, 1),
      0,
      0,
      Math.PI * 2,
    );
    bump.fill();
  }
  albedo.globalAlpha = 1;
  bump.globalAlpha = 1;

  const albedoTexture = new CanvasTexture(albedoCanvas);
  const bumpTexture = new CanvasTexture(bumpCanvas);
  albedoTexture.colorSpace = SRGBColorSpace;
  for (const texture of [albedoTexture, bumpTexture]) {
    configureTexture(texture);
  }
  return {
    albedo: albedoTexture,
    bump: bumpTexture,
    baseColor: new Color(options.base),
    dispose: () => {
      albedoTexture.dispose();
      bumpTexture.dispose();
    },
  };
}

function createToonStyleResources(): ToonStyleResources {
  const gradientMap = new DataTexture(
    new Uint8Array([36, 98, 162, 210]),
    4,
    1,
    RedFormat,
    UnsignedByteType,
  );
  gradientMap.minFilter = NearestFilter;
  gradientMap.magFilter = NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return {
    gradientMap,
    outlineMaterial: new MeshBasicMaterial({
      color: 0x2c2438,
      side: BackSide,
      toneMapped: false,
    }),
  };
}

function makeToonMaterial(
  textures: SurfaceTextureSet,
  style: ToonStyleResources,
  options: {
    readonly bumpScale: number;
    readonly side?: typeof DoubleSide;
  },
): MeshToonMaterial {
  return new MeshToonMaterial({
    color: 0xb8b8b8,
    map: textures.albedo,
    gradientMap: style.gradientMap,
    bumpMap: textures.bump,
    bumpScale: options.bumpScale * 0.34,
    side: options.side ?? FrontSide,
    emissive: textures.baseColor,
    emissiveIntensity: 0.02,
  });
}

function makeSolidToonMaterial(
  color: number,
  style: ToonStyleResources,
): MeshToonMaterial {
  return new MeshToonMaterial({
    color,
    gradientMap: style.gradientMap,
  });
}

function addToonOutline(
  mesh: Mesh,
  style: ToonStyleResources,
  thickness = 0.02,
): void {
  const outlineGeometry = mesh.geometry.clone();
  const positions = outlineGeometry.getAttribute("position");
  const normals = outlineGeometry.getAttribute("normal");
  if (!positions || !normals || positions.count !== normals.count) {
    throw new Error("Toon outlines require matching position and normal data.");
  }
  for (let index = 0; index < positions.count; index += 1) {
    positions.setXYZ(
      index,
      positions.getX(index) + normals.getX(index) * thickness,
      positions.getY(index) + normals.getY(index) * thickness,
      positions.getZ(index) + normals.getZ(index) * thickness,
    );
  }
  positions.needsUpdate = true;
  outlineGeometry.computeBoundingBox();
  outlineGeometry.computeBoundingSphere();
  const outline = new Mesh(outlineGeometry, style.outlineMaterial);
  outline.name = `${mesh.name || "symbol-part"}-outline`;
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
}

function registerMesh(mesh: Mesh): Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeToastShape(scale = 1): Shape {
  const shape = new Shape();
  shape.moveTo(-0.38 * scale, -0.42 * scale);
  shape.quadraticCurveTo(
    -0.47 * scale,
    -0.25 * scale,
    -0.43 * scale,
    0.12 * scale,
  );
  shape.quadraticCurveTo(
    -0.45 * scale,
    0.4 * scale,
    -0.22 * scale,
    0.43 * scale,
  );
  shape.quadraticCurveTo(-0.06 * scale, 0.46 * scale, 0, 0.32 * scale);
  shape.quadraticCurveTo(
    0.08 * scale,
    0.47 * scale,
    0.27 * scale,
    0.42 * scale,
  );
  shape.quadraticCurveTo(0.47 * scale, 0.36 * scale, 0.43 * scale, 0.1 * scale);
  shape.quadraticCurveTo(
    0.47 * scale,
    -0.25 * scale,
    0.37 * scale,
    -0.42 * scale,
  );
  shape.quadraticCurveTo(0, -0.49 * scale, -0.38 * scale, -0.42 * scale);
  return shape;
}

function centerExtrusion(
  geometry: ExtrudeGeometry,
  depth: number,
): ExtrudeGeometry {
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createTaperedTubeGeometry(): BufferGeometry {
  const curve = new CatmullRomCurve3([
    new Vector3(-0.45, 0.2, 0),
    new Vector3(-0.34, -0.03, 0),
    new Vector3(-0.1, -0.19, 0),
    new Vector3(0.19, -0.14, 0),
    new Vector3(0.42, 0.08, 0),
    new Vector3(0.46, 0.22, 0),
  ]);
  const tubularSegments = 24;
  const radialSegments = 8;
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= tubularSegments; segment += 1) {
    const t = segment / tubularSegments;
    const point = curve.getPointAt(t);
    const taper = 0.62 + Math.sin(Math.PI * t) * 0.38;
    const radius = 0.115 * taper;
    for (let radial = 0; radial <= radialSegments; radial += 1) {
      const angle = (radial / radialSegments) * Math.PI * 2;
      const normal = frames.normals[segment];
      const binormal = frames.binormals[segment];
      const offset = normal
        .clone()
        .multiplyScalar(Math.cos(angle) * radius)
        .add(binormal.clone().multiplyScalar(Math.sin(angle) * radius));
      positions.push(
        point.x + offset.x,
        point.y + offset.y,
        point.z + offset.z,
      );
      uvs.push(t, radial / radialSegments);
    }
  }
  for (let segment = 0; segment < tubularSegments; segment += 1) {
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const a = segment * (radialSegments + 1) + radial;
      const b = a + radialSegments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLeafGeometry(): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(-0.1, 0.2, -0.065, 0.54);
  shape.quadraticCurveTo(0, 0.71, 0.065, 0.54);
  shape.quadraticCurveTo(0.1, 0.2, 0, 0);
  return new ShapeGeometry(shape, 5);
}

function createDonut(
  textures: SurfaceTextureSet[],
  style: ToonStyleResources,
): Group {
  const group = new Group();
  const doughTexture = createSurfaceTextures({
    seed: 0xd011,
    base: "#B85E29",
    accent: "#D99755",
    pattern: "pores",
  });
  const icingTexture = createSurfaceTextures({
    seed: 0x1c1c,
    base: "#E65F91",
    accent: "#ED96B2",
    pattern: "mottle",
  });
  textures.push(doughTexture, icingTexture);
  const dough = registerMesh(
    new Mesh(
      new TorusGeometry(0.31, 0.145, 10, 22),
      makeToonMaterial(doughTexture, style, { bumpScale: 0.018 }),
    ),
  );
  const icing = registerMesh(
    new Mesh(
      new TorusGeometry(0.31, 0.123, 9, 22),
      makeToonMaterial(icingTexture, style, { bumpScale: 0.012 }),
    ),
  );
  icing.position.z = 0.09;
  icing.scale.set(1.01, 1.01, 0.72);
  dough.name = "donut-dough";
  icing.name = "donut-icing";
  addToonOutline(dough, style, 0.022);
  addToonOutline(icing, style, 0.016);
  group.add(dough, icing);

  const sprinkleGeometry = new CylinderGeometry(0.014, 0.014, 0.09, 6);
  const sprinkleMaterials = [0xffdf48, 0x56c9ee, 0xffffff, 0x7aca35].map(
    (color) => makeSolidToonMaterial(color, style),
  );
  const random = createRandom(0x5a12);
  const sprinkleCount = 11;
  const sprinkleCounts = sprinkleMaterials.map(
    (_, materialIndex) =>
      Array.from({ length: sprinkleCount }, (_, index) => index).filter(
        (index) => index % sprinkleMaterials.length === materialIndex,
      ).length,
  );
  const sprinkleMeshes = sprinkleMaterials.map((material, index) => {
    const mesh = new InstancedMesh(
      sprinkleGeometry,
      material,
      sprinkleCounts[index],
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  });
  const sprinkleIndices = sprinkleMaterials.map(() => 0);
  const dummy = new Object3D();
  for (let index = 0; index < sprinkleCount; index += 1) {
    const angle =
      (index / sprinkleCount) * Math.PI * 2 + random.range(-0.12, 0.12);
    const radius = random.range(0.25, 0.37);
    dummy.position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      0.205,
    );
    dummy.rotation.set(
      Math.PI / 2,
      random.range(-0.8, 0.8),
      angle + random.range(-0.7, 0.7),
    );
    dummy.updateMatrix();
    const materialIndex = index % sprinkleMaterials.length;
    sprinkleMeshes[materialIndex].setMatrixAt(
      sprinkleIndices[materialIndex],
      dummy.matrix,
    );
    sprinkleIndices[materialIndex] += 1;
  }
  for (const mesh of sprinkleMeshes) mesh.instanceMatrix.needsUpdate = true;
  group.name = "donut-model";
  return group;
}

function createToast(
  textures: SurfaceTextureSet[],
  style: ToonStyleResources,
): Group {
  const group = new Group();
  const crustTexture = createSurfaceTextures({
    seed: 0x70a57,
    base: "#BD6629",
    accent: "#DB8942",
    pattern: "ridges",
  });
  const crumbTexture = createSurfaceTextures({
    seed: 0xc2a6b,
    base: "#EDC56B",
    accent: "#C77B38",
    pattern: "pores",
  });
  textures.push(crustTexture, crumbTexture);
  const crustDepth = 0.25;
  const crust = registerMesh(
    new Mesh(
      centerExtrusion(
        new ExtrudeGeometry(makeToastShape(), {
          depth: crustDepth,
          bevelEnabled: true,
          bevelSize: 0.035,
          bevelThickness: 0.035,
          bevelSegments: 3,
          curveSegments: 10,
        }),
        crustDepth,
      ),
      makeToonMaterial(crustTexture, style, { bumpScale: 0.022 }),
    ),
  );
  const crumbDepth = 0.065;
  const crumbGeometry = centerExtrusion(
    new ExtrudeGeometry(makeToastShape(0.83), {
      depth: crumbDepth,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.02,
      bevelSegments: 2,
      curveSegments: 10,
    }),
    crumbDepth,
  );
  const crumbMaterial = makeToonMaterial(crumbTexture, style, {
    bumpScale: 0.032,
  });
  const front = registerMesh(new Mesh(crumbGeometry, crumbMaterial));
  const back = registerMesh(new Mesh(crumbGeometry, crumbMaterial));
  front.position.z = 0.145;
  back.position.z = -0.145;
  crust.name = "toast-crust";
  front.name = "toast-front";
  back.name = "toast-back";
  addToonOutline(crust, style, 0.022);
  addToonOutline(front, style, 0.014);
  addToonOutline(back, style, 0.014);
  group.add(crust, front, back);
  group.name = "toast-model";
  return group;
}

function createBanana(
  textures: SurfaceTextureSet[],
  style: ToonStyleResources,
): Group {
  const group = new Group();
  const peelTexture = createSurfaceTextures({
    seed: 0xba4a4a,
    base: "#E8C43B",
    accent: "#875D1B",
    pattern: "spots",
  });
  const tipTexture = createSurfaceTextures({
    seed: 0x71f5,
    base: "#6E4218",
    accent: "#B6772F",
    pattern: "ridges",
  });
  textures.push(peelTexture, tipTexture);
  const peel = registerMesh(
    new Mesh(
      createTaperedTubeGeometry(),
      makeToonMaterial(peelTexture, style, { bumpScale: 0.016 }),
    ),
  );
  peel.name = "banana-peel";
  addToonOutline(peel, style, 0.022);
  group.add(peel);
  const tipMaterial = makeToonMaterial(tipTexture, style, {
    bumpScale: 0.025,
  });
  const tipGeometry = new SphereGeometry(0.075, 10, 8);
  const leftTip = registerMesh(new Mesh(tipGeometry, tipMaterial));
  leftTip.position.set(-0.455, 0.205, 0);
  leftTip.scale.set(0.72, 1.35, 0.72);
  leftTip.rotation.z = -0.4;
  leftTip.name = "banana-left-tip";
  addToonOutline(leftTip, style, 0.007);
  const rightTip = registerMesh(new Mesh(tipGeometry, tipMaterial));
  rightTip.position.set(0.46, 0.225, 0);
  rightTip.scale.set(0.66, 1.5, 0.66);
  rightTip.rotation.z = 0.25;
  rightTip.name = "banana-right-tip";
  addToonOutline(rightTip, style, 0.007);
  group.add(leftTip, rightTip);
  group.name = "banana-model";
  return group;
}

function createStrawberry(
  textures: SurfaceTextureSet[],
  style: ToonStyleResources,
): Group {
  const group = new Group();
  const berryTexture = createSurfaceTextures({
    seed: 0x57a9,
    base: "#D63831",
    accent: "#E96156",
    pattern: "seeds",
  });
  const leafTexture = createSurfaceTextures({
    seed: 0x1eaf,
    base: "#417B18",
    accent: "#6D9D2B",
    pattern: "veins",
  });
  textures.push(berryTexture, leafTexture);
  const berryProfile = [
    new Vector2(0.012, -0.52),
    new Vector2(0.12, -0.43),
    new Vector2(0.24, -0.29),
    new Vector2(0.34, -0.08),
    new Vector2(0.38, 0.13),
    new Vector2(0.34, 0.29),
    new Vector2(0.2, 0.4),
    new Vector2(0.055, 0.43),
  ];
  const berryGeometry = new LatheGeometry(berryProfile, 16);
  const berry = registerMesh(
    new Mesh(
      berryGeometry,
      makeToonMaterial(berryTexture, style, { bumpScale: 0.018 }),
    ),
  );
  berry.name = "strawberry-berry";
  addToonOutline(berry, style, 0.02);
  group.add(berry);

  const seedGeometry = new SphereGeometry(0.029, 7, 5);
  const seedMaterial = makeSolidToonMaterial(0xf6d56b, style);
  const seedRows = [
    [-0.31, 0.22, 3],
    [-0.11, 0.34, 4],
    [0.11, 0.37, 5],
    [0.3, 0.27, 4],
  ] as const;
  const seeds = new InstancedMesh(
    seedGeometry,
    seedMaterial,
    seedRows.reduce((total, [, , count]) => total + count, 0),
  );
  seeds.castShadow = true;
  seeds.receiveShadow = true;
  const seedDummy = new Object3D();
  let seedIndex = 0;
  for (const [rowY, radius, count] of seedRows) {
    for (let index = 0; index < count; index += 1) {
      const angle =
        (index / count) * Math.PI * 2 +
        (Math.round((rowY + 0.4) * 10) % 2) * 0.42;
      seedDummy.position.set(
        Math.cos(angle) * (radius + 0.012),
        rowY,
        Math.sin(angle) * (radius + 0.012),
      );
      seedDummy.scale.set(0.72, 1.18, 0.5);
      seedDummy.lookAt(
        new Vector3(
          Math.cos(angle) * radius * 2,
          rowY,
          Math.sin(angle) * radius * 2,
        ),
      );
      seedDummy.updateMatrix();
      seeds.setMatrixAt(seedIndex, seedDummy.matrix);
      seedIndex += 1;
    }
  }
  seeds.instanceMatrix.needsUpdate = true;
  group.add(seeds);

  const leafGeometry = createLeafGeometry();
  const leafMaterial = makeToonMaterial(leafTexture, style, {
    bumpScale: 0.022,
    side: DoubleSide,
  });
  for (let index = 0; index < 5; index += 1) {
    const leaf = registerMesh(new Mesh(leafGeometry, leafMaterial));
    leaf.position.set(0, 0.39, 0);
    leaf.rotation.set(Math.PI / 2 - 0.2, (index / 5) * Math.PI * 2, 0);
    leaf.scale.set(0.62, 0.55, 0.62);
    group.add(leaf);
  }
  const stem = registerMesh(
    new Mesh(new CylinderGeometry(0.035, 0.045, 0.2, 8), leafMaterial),
  );
  stem.position.y = 0.51;
  stem.name = "strawberry-stem";
  addToonOutline(stem, style, 0.006);
  group.add(stem);
  group.name = "strawberry-model";
  return group;
}

function createCarrot(
  textures: SurfaceTextureSet[],
  style: ToonStyleResources,
): Group {
  const group = new Group();
  const rootTexture = createSurfaceTextures({
    seed: 0xca2207,
    base: "#E77F2A",
    accent: "#C05418",
    pattern: "ridges",
  });
  const leafTexture = createSurfaceTextures({
    seed: 0xca1eaf,
    base: "#387718",
    accent: "#6B982F",
    pattern: "veins",
  });
  textures.push(rootTexture, leafTexture);
  const profile: Vector2[] = [];
  const profileCount = 18;
  for (let index = 0; index <= profileCount; index += 1) {
    const t = index / profileCount;
    const y = -0.62 + t * 0.88;
    const taper = Math.sin(Math.min(1, t * 1.14) * Math.PI * 0.5);
    const shoulder = 0.29 * taper * (1 - Math.max(0, t - 0.82) * 1.35);
    const groove = index > 4 && index < 15 && index % 3 === 0 ? -0.018 : 0;
    profile.push(new Vector2(Math.max(0.015, shoulder + groove), y));
  }
  const root = registerMesh(
    new Mesh(
      new LatheGeometry(profile, 16),
      makeToonMaterial(rootTexture, style, { bumpScale: 0.025 }),
    ),
  );
  root.name = "carrot-root";
  addToonOutline(root, style, 0.018);
  group.add(root);
  const grooveMaterial = makeSolidToonMaterial(0xbd4c0e, style);
  for (const [radius, y, arc] of [
    [0.245, -0.02, 0.75],
    [0.205, -0.2, 0.62],
    [0.145, -0.39, 0.5],
  ] as const) {
    const groove = registerMesh(
      new Mesh(
        new TorusGeometry(radius, 0.009, 5, 18, Math.PI * arc),
        grooveMaterial,
      ),
    );
    groove.position.y = y;
    groove.rotation.set(Math.PI / 2, 0, -Math.PI * 0.2);
    group.add(groove);
  }
  const leafGeometry = createLeafGeometry();
  const leafMaterial = makeToonMaterial(leafTexture, style, {
    bumpScale: 0.026,
    side: DoubleSide,
  });
  for (let index = 0; index < 6; index += 1) {
    const leaf = registerMesh(new Mesh(leafGeometry, leafMaterial));
    leaf.position.set(0, 0.22, 0);
    leaf.rotation.set(
      0,
      (index / 6) * Math.PI * 2,
      (index % 2 === 0 ? 1 : -1) * 0.28,
    );
    leaf.scale.set(0.72, 0.62 + (index % 3) * 0.1, 0.72);
    group.add(leaf);
  }
  const crown = registerMesh(
    new Mesh(new ConeGeometry(0.16, 0.14, 10), leafMaterial),
  );
  crown.position.y = 0.28;
  crown.name = "carrot-crown";
  addToonOutline(crown, style, 0.008);
  group.add(crown);
  group.rotation.z = -0.58;
  group.name = "carrot-model";
  return group;
}

function shuffle<T>(items: T[], random: RandomSource): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = random.integer(0, index);
    [items[index], items[target]] = [items[target], items[index]];
  }
  return items;
}

export function createSymbolPlacements(
  seed: number,
  count: number,
): SymbolPlacement[] {
  const capacity = BOARD.columns * BOARD.rows;
  if (!Number.isInteger(count) || count < 0 || count > capacity) {
    throw new RangeError(
      `Symbol count must be an integer from 0 to ${capacity}.`,
    );
  }
  const random = createRandom(seed);
  const cells = shuffle(
    Array.from({ length: capacity }, (_, index) => index),
    random,
  );
  return cells.slice(0, count).map((cell, index) => {
    const column = cell % BOARD.columns;
    const row = Math.floor(cell / BOARD.columns);
    return {
      type:
        index < SYMBOL_TYPES.length
          ? SYMBOL_TYPES[index]
          : SYMBOL_TYPES[random.integer(0, SYMBOL_TYPES.length - 1)],
      column,
      row,
      x:
        -boardWidth / 2 +
        BOARD.cellSize / 2 +
        column * (BOARD.cellSize + BOARD.cellGap),
      z:
        -boardDepth / 2 +
        BOARD.cellSize / 2 +
        row * (BOARD.cellSize + BOARD.cellGap),
      scale: random.range(0.78, 0.9),
      phase: random.range(0, Math.PI * 2),
      rotation: random.range(-0.35, 0.35),
      delay: (column * BOARD.rows + row) * SYMBOL_STAGGER_SECONDS,
    };
  });
}

function easeOutBack(value: number): number {
  const overshoot = 1.38;
  const shifted = value - 1;
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(value, 1));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

export interface SymbolMotion {
  readonly scale: number;
  readonly yOffset: number;
}

export function sampleSymbolEntrance(progress: number): SymbolMotion {
  const value = clamp01(progress);
  return {
    scale: value === 0 ? 0 : easeOutBack(value),
    yOffset: -0.2 * (1 - smoothstep(value)) + Math.sin(Math.PI * value) * 0.16,
  };
}

export function sampleSymbolExit(progress: number): SymbolMotion {
  const value = clamp01(progress);
  return {
    scale: 1 - smoothstep((value - 0.08) / 0.92),
    yOffset: Math.sin(Math.PI * value) * 0.3 + value * 0.12,
  };
}

type SymbolFieldPhase = "entering" | "idle" | "exiting";

export class SymbolField extends Group {
  readonly #textures: SurfaceTextureSet[] = [];
  readonly #toonStyle = createToonStyleResources();
  readonly #symbols: AnimatedSymbol[] = [];
  readonly #masters: ReadonlyMap<SymbolType, Group>;
  readonly #shadowGeometry = new CircleGeometry(0.34, 20);
  readonly #shadowTexture = createHoverShadowTexture();
  #phase: SymbolFieldPhase = "entering";
  #phaseStartedAt: number | null = null;
  #lastUpdateAt: number | null = null;
  #pendingPlacements: readonly SymbolPlacement[] | null = null;

  constructor(placements: readonly SymbolPlacement[]) {
    super();
    this.name = "animated-game-symbols";
    this.#masters = new Map<SymbolType, Group>([
      ["donut", createDonut(this.#textures, this.#toonStyle)],
      ["toast", createToast(this.#textures, this.#toonStyle)],
      ["banana", createBanana(this.#textures, this.#toonStyle)],
      ["strawberry", createStrawberry(this.#textures, this.#toonStyle)],
      ["carrot", createCarrot(this.#textures, this.#toonStyle)],
    ]);
    this.#populate(placements);
  }

  replace(placements: readonly SymbolPlacement[]): boolean {
    if (this.#phase !== "idle" || this.#lastUpdateAt === null) return false;
    this.#pendingPlacements = [...placements];
    this.#phase = "exiting";
    this.#phaseStartedAt = this.#lastUpdateAt;
    return true;
  }

  update(timeSeconds: number): void {
    this.#lastUpdateAt = timeSeconds;
    this.#phaseStartedAt ??= timeSeconds;
    const elapsed = timeSeconds - this.#phaseStartedAt;
    if (this.#phase === "exiting") {
      this.#updateExiting(elapsed, timeSeconds);
      return;
    }
    if (this.#phase === "entering") {
      this.#updateEntering(elapsed, timeSeconds);
      return;
    }
    for (const symbol of this.#symbols) {
      this.#applyIdleMotion(symbol, timeSeconds, 1);
    }
  }

  disposeTextures(): void {
    this.#clearSymbols();
    this.#shadowGeometry.dispose();
    this.#shadowTexture.dispose();
    for (const textures of this.#textures) textures.dispose();
    this.#toonStyle.gradientMap.dispose();
    this.#toonStyle.outlineMaterial.dispose();
  }

  #populate(placements: readonly SymbolPlacement[]): void {
    for (const placement of placements) {
      const pivot = new Group();
      pivot.name = `${placement.type}-symbol`;
      pivot.position.set(placement.x, BOARD.cellHeight + 0.55, placement.z);
      pivot.scale.setScalar(0);
      const tilt = new Group();
      tilt.name = `${placement.type}-camera-tilt`;
      tilt.rotation.x = SYMBOL_TILT_ROTATION_X;
      const spinner = new Group();
      spinner.name = `${placement.type}-inclined-spinner`;
      spinner.rotation.z = placement.rotation;
      const model = this.#masters.get(placement.type)!.clone(true);
      if (placement.type === "banana") model.rotation.z += Math.PI;
      spinner.add(model);
      tilt.add(spinner);
      pivot.add(tilt);
      const shadow = new Mesh(
        this.#shadowGeometry,
        new MeshBasicMaterial({
          color: 0x173b16,
          map: this.#shadowTexture,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      shadow.name = `${placement.type}-hover-shadow`;
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(placement.x, BOARD.cellHeight + 0.025, placement.z);
      shadow.scale.set(1.12, 0.65, 1.12);
      this.add(shadow, pivot);
      this.#symbols.push({
        pivot,
        tilt,
        spinner,
        shadow,
        placement,
        spinSpeed: 0.56 * (1 + Math.sin(placement.phase * 1.91 + 0.43) * 0.08),
      });
    }
  }

  #updateEntering(elapsed: number, timeSeconds: number): void {
    let finished = true;
    for (const symbol of this.#symbols) {
      const localTime = elapsed - symbol.placement.delay;
      const progress = clamp01(localTime / 0.46);
      if (progress < 1) finished = false;
      const motion = sampleSymbolEntrance(progress);
      this.#applyIdleMotion(symbol, timeSeconds, motion.scale, motion.yOffset);
      symbol.shadow.material.opacity =
        HOVER_SHADOW_OPACITY * smoothstep(progress);
    }
    if (finished) {
      this.#phase = "idle";
      this.#phaseStartedAt = timeSeconds;
    }
  }

  #updateExiting(elapsed: number, timeSeconds: number): void {
    let finished = true;
    for (const symbol of this.#symbols) {
      const localTime = elapsed - symbol.placement.delay;
      const progress = clamp01(localTime / 0.3);
      if (progress < 1) finished = false;
      const motion = sampleSymbolExit(progress);
      this.#applyIdleMotion(symbol, timeSeconds, motion.scale, motion.yOffset);
      symbol.shadow.material.opacity = HOVER_SHADOW_OPACITY * motion.scale;
    }
    if (!finished) return;
    const nextPlacements = this.#pendingPlacements;
    this.#pendingPlacements = null;
    this.#clearSymbols();
    if (!nextPlacements) {
      this.#phase = "idle";
      return;
    }
    this.#populate(nextPlacements);
    this.#phase = "entering";
    this.#phaseStartedAt = timeSeconds;
  }

  #applyIdleMotion(
    symbol: AnimatedSymbol,
    timeSeconds: number,
    scaleFactor: number,
    yOffset = 0,
  ): void {
    const visualScale = SYMBOL_VISUAL_SCALE[symbol.placement.type];
    symbol.pivot.scale.setScalar(
      symbol.placement.scale * visualScale * scaleFactor,
    );
    symbol.pivot.position.y =
      BOARD.cellHeight +
      0.55 +
      Math.sin(timeSeconds * 1.25 + symbol.placement.phase) * 0.075 +
      yOffset;
    symbol.spinner.rotation.z =
      symbol.placement.rotation - timeSeconds * symbol.spinSpeed;
    symbol.tilt.rotation.x =
      SYMBOL_TILT_ROTATION_X +
      Math.sin(timeSeconds * 0.9 + symbol.placement.phase) * 0.065;
    symbol.tilt.rotation.y =
      Math.sin(timeSeconds * 0.62 + symbol.placement.phase * 0.73) * 0.025;
    const shadowPulse =
      1 - Math.sin(timeSeconds * 1.25 + symbol.placement.phase) * 0.08;
    const shadowScale = shadowPulse * visualScale * 1.12;
    symbol.shadow.scale.set(shadowScale, shadowScale * 0.58, shadowScale);
  }

  #clearSymbols(): void {
    for (const symbol of this.#symbols) {
      this.remove(symbol.pivot, symbol.shadow);
      symbol.shadow.material.dispose();
    }
    this.#symbols.length = 0;
  }
}

export function createSessionSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0];
}
