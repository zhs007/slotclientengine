import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  FrontSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
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

export type SymbolType = (typeof SYMBOL_TYPES)[number];

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
  readonly roughness: CanvasTexture;
  readonly bump: CanvasTexture;
  dispose(): void;
}

interface SurfaceOptions {
  readonly seed: number;
  readonly base: string;
  readonly accent: string;
  readonly pattern: "pores" | "mottle" | "spots" | "seeds" | "ridges" | "veins";
}

interface AnimatedSymbol {
  readonly pivot: Group;
  readonly shadow: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly placement: SymbolPlacement;
}

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable.");
  return context;
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
  const roughnessCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  for (const canvas of [albedoCanvas, roughnessCanvas, bumpCanvas]) {
    canvas.width = size;
    canvas.height = size;
  }
  const albedo = requireContext(albedoCanvas);
  const roughness = requireContext(roughnessCanvas);
  const bump = requireContext(bumpCanvas);
  albedo.fillStyle = options.base;
  albedo.fillRect(0, 0, size, size);
  roughness.fillStyle = "#bdbdbd";
  roughness.fillRect(0, 0, size, size);
  bump.fillStyle = "#7b7b7b";
  bump.fillRect(0, 0, size, size);

  const accent = new Color(options.accent);
  const marks = options.pattern === "pores" ? 520 : 250;
  for (let index = 0; index < marks; index += 1) {
    const x = random.range(0, size);
    const y = random.range(0, size);
    const radius =
      options.pattern === "spots"
        ? random.range(2.4, 7.2)
        : options.pattern === "pores"
          ? random.range(0.45, 1.8)
          : random.range(0.8, 3.2);
    const color = accent
      .clone()
      .offsetHSL(random.range(-0.02, 0.02), 0, random.range(-0.08, 0.08));
    albedo.fillStyle = `#${color.getHexString()}`;
    albedo.globalAlpha = random.range(0.13, 0.5);
    if (options.pattern === "ridges" || options.pattern === "veins") {
      albedo.strokeStyle = albedo.fillStyle;
      albedo.lineWidth = random.range(0.5, 1.5);
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

    const roughValue = Math.floor(random.range(132, 224));
    roughness.fillStyle = `rgb(${roughValue}, ${roughValue}, ${roughValue})`;
    roughness.globalAlpha = random.range(0.25, 0.72);
    roughness.beginPath();
    roughness.arc(
      x + random.range(-2, 2),
      y + random.range(-2, 2),
      radius * 1.2,
      0,
      Math.PI * 2,
    );
    roughness.fill();

    const bumpValue = Math.floor(
      options.pattern === "pores"
        ? random.range(35, 95)
        : random.range(110, 225),
    );
    bump.fillStyle = `rgb(${bumpValue}, ${bumpValue}, ${bumpValue})`;
    bump.globalAlpha = random.range(0.38, 0.8);
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
  roughness.globalAlpha = 1;
  bump.globalAlpha = 1;

  const albedoTexture = new CanvasTexture(albedoCanvas);
  const roughnessTexture = new CanvasTexture(roughnessCanvas);
  const bumpTexture = new CanvasTexture(bumpCanvas);
  albedoTexture.colorSpace = SRGBColorSpace;
  for (const texture of [albedoTexture, roughnessTexture, bumpTexture]) {
    configureTexture(texture);
  }
  return {
    albedo: albedoTexture,
    roughness: roughnessTexture,
    bump: bumpTexture,
    dispose: () => {
      albedoTexture.dispose();
      roughnessTexture.dispose();
      bumpTexture.dispose();
    },
  };
}

function makeStandardMaterial(
  textures: SurfaceTextureSet,
  options: {
    readonly roughness: number;
    readonly bumpScale: number;
    readonly clearcoat?: number;
    readonly side?: typeof DoubleSide;
  },
): MeshStandardMaterial | MeshPhysicalMaterial {
  const parameters = {
    map: textures.albedo,
    roughnessMap: textures.roughness,
    bumpMap: textures.bump,
    roughness: options.roughness,
    bumpScale: options.bumpScale,
    metalness: 0,
    side: options.side ?? FrontSide,
  };
  return options.clearcoat
    ? new MeshPhysicalMaterial({
        ...parameters,
        clearcoat: options.clearcoat,
        clearcoatRoughness: 0.22,
      })
    : new MeshStandardMaterial(parameters);
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
  const tubularSegments = 30;
  const radialSegments = 10;
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
      indices.push(a, b, a + 1, b, b + 1, a + 1);
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

function createDonut(textures: SurfaceTextureSet[]): Group {
  const group = new Group();
  const doughTexture = createSurfaceTextures({
    seed: 0xd011,
    base: "#B96522",
    accent: "#F0B35D",
    pattern: "pores",
  });
  const icingTexture = createSurfaceTextures({
    seed: 0x1c1c,
    base: "#F25F8D",
    accent: "#FF9DBA",
    pattern: "mottle",
  });
  textures.push(doughTexture, icingTexture);
  const dough = registerMesh(
    new Mesh(
      new TorusGeometry(0.31, 0.145, 16, 32),
      makeStandardMaterial(doughTexture, { roughness: 0.72, bumpScale: 0.018 }),
    ),
  );
  const icing = registerMesh(
    new Mesh(
      new TorusGeometry(0.31, 0.123, 14, 32),
      makeStandardMaterial(icingTexture, {
        roughness: 0.28,
        bumpScale: 0.012,
        clearcoat: 0.28,
      }),
    ),
  );
  icing.position.z = 0.09;
  icing.scale.set(1.01, 1.01, 0.72);
  group.add(dough, icing);

  const sprinkleGeometry = new CylinderGeometry(0.014, 0.014, 0.09, 6);
  const sprinkleMaterials = [0xffdf48, 0x56c9ee, 0xffffff, 0x7aca35].map(
    (color) =>
      new MeshPhysicalMaterial({ color, roughness: 0.33, clearcoat: 0.35 }),
  );
  const random = createRandom(0x5a12);
  const sprinkleCounts = sprinkleMaterials.map(
    (_, materialIndex) =>
      Array.from({ length: 15 }, (_, index) => index).filter(
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
  for (let index = 0; index < 15; index += 1) {
    const angle = (index / 15) * Math.PI * 2 + random.range(-0.12, 0.12);
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

function createToast(textures: SurfaceTextureSet[]): Group {
  const group = new Group();
  const crustTexture = createSurfaceTextures({
    seed: 0x70a57,
    base: "#B95418",
    accent: "#E78A2F",
    pattern: "ridges",
  });
  const crumbTexture = createSurfaceTextures({
    seed: 0xc2a6b,
    base: "#F4C66E",
    accent: "#A95A22",
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
      makeStandardMaterial(crustTexture, { roughness: 0.7, bumpScale: 0.022 }),
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
  const crumbMaterial = makeStandardMaterial(crumbTexture, {
    roughness: 0.82,
    bumpScale: 0.032,
  });
  const front = registerMesh(new Mesh(crumbGeometry, crumbMaterial));
  const back = registerMesh(new Mesh(crumbGeometry, crumbMaterial));
  front.position.z = 0.145;
  back.position.z = -0.145;
  group.add(crust, front, back);
  group.name = "toast-model";
  return group;
}

function createBanana(textures: SurfaceTextureSet[]): Group {
  const group = new Group();
  const peelTexture = createSurfaceTextures({
    seed: 0xba4a4a,
    base: "#F1C62D",
    accent: "#9B691C",
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
      makeStandardMaterial(peelTexture, {
        roughness: 0.52,
        bumpScale: 0.016,
        clearcoat: 0.12,
      }),
    ),
  );
  group.add(peel);
  const tipMaterial = makeStandardMaterial(tipTexture, {
    roughness: 0.84,
    bumpScale: 0.025,
  });
  const tipGeometry = new SphereGeometry(0.075, 10, 8);
  const leftTip = registerMesh(new Mesh(tipGeometry, tipMaterial));
  leftTip.position.set(-0.455, 0.205, 0);
  leftTip.scale.set(0.72, 1.35, 0.72);
  leftTip.rotation.z = -0.4;
  const rightTip = registerMesh(new Mesh(tipGeometry, tipMaterial));
  rightTip.position.set(0.46, 0.225, 0);
  rightTip.scale.set(0.66, 1.5, 0.66);
  rightTip.rotation.z = 0.25;
  group.add(leftTip, rightTip);
  group.name = "banana-model";
  return group;
}

function createStrawberry(textures: SurfaceTextureSet[]): Group {
  const group = new Group();
  const berryTexture = createSurfaceTextures({
    seed: 0x57a9,
    base: "#D91D17",
    accent: "#F65A3E",
    pattern: "seeds",
  });
  const leafTexture = createSurfaceTextures({
    seed: 0x1eaf,
    base: "#4E8D1B",
    accent: "#86B934",
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
  const berryGeometry = new LatheGeometry(berryProfile, 24);
  const berry = registerMesh(
    new Mesh(
      berryGeometry,
      makeStandardMaterial(berryTexture, {
        roughness: 0.42,
        bumpScale: 0.018,
        clearcoat: 0.18,
      }),
    ),
  );
  group.add(berry);

  const seedGeometry = new SphereGeometry(0.029, 7, 5);
  const seedMaterial = new MeshStandardMaterial({
    color: 0xf6d56b,
    emissive: 0x694812,
    emissiveIntensity: 0.24,
    roughness: 0.58,
  });
  const seedRows = [
    [-0.35, 0.18, 4],
    [-0.18, 0.29, 6],
    [0.01, 0.36, 7],
    [0.19, 0.35, 6],
    [0.33, 0.25, 4],
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
  const leafMaterial = makeStandardMaterial(leafTexture, {
    roughness: 0.72,
    bumpScale: 0.022,
    side: DoubleSide,
  });
  for (let index = 0; index < 7; index += 1) {
    const leaf = registerMesh(new Mesh(leafGeometry, leafMaterial));
    leaf.position.set(0, 0.39, 0);
    leaf.rotation.set(Math.PI / 2 - 0.2, (index / 7) * Math.PI * 2, 0);
    leaf.scale.set(0.62, 0.55, 0.62);
    group.add(leaf);
  }
  const stem = registerMesh(
    new Mesh(new CylinderGeometry(0.035, 0.045, 0.2, 8), leafMaterial),
  );
  stem.position.y = 0.51;
  group.add(stem);
  group.name = "strawberry-model";
  return group;
}

function createCarrot(textures: SurfaceTextureSet[]): Group {
  const group = new Group();
  const rootTexture = createSurfaceTextures({
    seed: 0xca2207,
    base: "#EA7217",
    accent: "#B94B0E",
    pattern: "ridges",
  });
  const leafTexture = createSurfaceTextures({
    seed: 0xca1eaf,
    base: "#43891B",
    accent: "#86B43A",
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
      new LatheGeometry(profile, 22),
      makeStandardMaterial(rootTexture, {
        roughness: 0.58,
        bumpScale: 0.025,
        clearcoat: 0.08,
      }),
    ),
  );
  group.add(root);
  const grooveMaterial = new MeshStandardMaterial({
    color: 0xbd4c0e,
    roughness: 0.82,
  });
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
  const leafMaterial = makeStandardMaterial(leafTexture, {
    roughness: 0.75,
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
  readonly #symbols: AnimatedSymbol[] = [];
  readonly #masters: ReadonlyMap<SymbolType, Group>;
  readonly #shadowGeometry = new CircleGeometry(0.34, 20);
  #phase: SymbolFieldPhase = "entering";
  #phaseStartedAt: number | null = null;
  #lastUpdateAt: number | null = null;
  #pendingPlacements: readonly SymbolPlacement[] | null = null;

  constructor(placements: readonly SymbolPlacement[]) {
    super();
    this.name = "animated-game-symbols";
    this.#masters = new Map<SymbolType, Group>([
      ["donut", createDonut(this.#textures)],
      ["toast", createToast(this.#textures)],
      ["banana", createBanana(this.#textures)],
      ["strawberry", createStrawberry(this.#textures)],
      ["carrot", createCarrot(this.#textures)],
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
    for (const textures of this.#textures) textures.dispose();
  }

  #populate(placements: readonly SymbolPlacement[]): void {
    for (const placement of placements) {
      const pivot = new Group();
      pivot.name = `${placement.type}-symbol`;
      pivot.position.set(placement.x, BOARD.cellHeight + 0.55, placement.z);
      pivot.rotation.y = placement.rotation;
      pivot.scale.setScalar(0);
      const model = this.#masters.get(placement.type)!.clone(true);
      model.rotation.x = -0.12;
      pivot.add(model);
      const shadow = new Mesh(
        this.#shadowGeometry,
        new MeshBasicMaterial({
          color: 0x173b16,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      shadow.name = `${placement.type}-hover-shadow`;
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(placement.x, BOARD.cellHeight + 0.025, placement.z);
      shadow.scale.set(1, 0.58, 1);
      this.add(shadow, pivot);
      this.#symbols.push({ pivot, shadow, placement });
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
      symbol.shadow.material.opacity = 0.2 * smoothstep(progress);
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
      symbol.shadow.material.opacity = 0.2 * motion.scale;
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
    symbol.pivot.scale.setScalar(symbol.placement.scale * scaleFactor);
    symbol.pivot.position.y =
      BOARD.cellHeight +
      0.55 +
      Math.sin(timeSeconds * 1.25 + symbol.placement.phase) * 0.075 +
      yOffset;
    symbol.pivot.rotation.y = symbol.placement.rotation - timeSeconds * 0.56;
    symbol.pivot.rotation.x =
      Math.sin(timeSeconds * 0.9 + symbol.placement.phase) * 0.095;
    symbol.pivot.rotation.z =
      Math.sin(timeSeconds * 0.62 + symbol.placement.phase * 0.73) * 0.025;
    const shadowPulse =
      1 - Math.sin(timeSeconds * 1.25 + symbol.placement.phase) * 0.08;
    symbol.shadow.scale.set(shadowPulse, shadowPulse * 0.58, shadowPulse);
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
