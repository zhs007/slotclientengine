import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from "three";
import type { BufferGeometry, Material, Object3D } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

function furnishingMesh(
  geometry: BufferGeometry,
  material: Material,
  name: string,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function registerParts(root: Group, parts: Record<string, Object3D>): void {
  for (const [id, object] of Object.entries(parts))
    object.userData.sculptPartId = id;
  root.userData.sculptRuntime = {
    nodeIds: Object.keys(parts),
    clickablePartIds: Object.keys(parts),
    explodablePartIds: Object.keys(parts).filter((id) => id !== "root"),
  };
}

export interface ThroneDaisMaterials {
  readonly stone: Material;
  readonly stoneDark: Material;
  readonly gold: Material;
}

function createDiamond(material: Material, name: string): Mesh {
  const shape = new Shape();
  shape.moveTo(0, 0.22);
  shape.lineTo(0.16, 0);
  shape.lineTo(0, -0.22);
  shape.lineTo(-0.16, 0);
  shape.closePath();
  return furnishingMesh(
    new ExtrudeGeometry(shape, {
      depth: 0.035,
      bevelEnabled: true,
      bevelSize: 0.018,
      bevelThickness: 0.012,
      bevelSegments: 1,
    }),
    material,
    name,
  );
}

export function createCartoonThroneDais(materials: ThroneDaisMaterials): Group {
  const root = new Group();
  root.name = "img2threejs-cartoon-throne-dais";
  const steps = new Group();
  steps.name = "four-step-course";
  const cheeks = new Group();
  cheeks.name = "stepped-side-cheeks";
  const inlays = new Group();
  inlays.name = "gold-heraldic-inlays";
  const dais = new Group();
  dais.name = "octagonal-rear-dais";

  const courses = [
    [5.4, 0.28, 1.05, 0.14, 1.28],
    [4.85, 0.29, 1.02, 0.42, 0.63],
    [4.3, 0.3, 0.98, 0.71, 0.02],
    [3.78, 0.31, 0.94, 1.01, -0.55],
  ] as const;
  for (const [index, [width, height, depth, y, z]] of courses.entries()) {
    const tread = furnishingMesh(
      new RoundedBoxGeometry(width, height, depth, 3, 0.095),
      index % 2 === 0 ? materials.stone : materials.stoneDark,
      `rounded-stone-tread-${index + 1}`,
    );
    tread.position.set(0, y, z);
    steps.add(tread);
  }

  const platform = furnishingMesh(
    new CylinderGeometry(1.82, 1.95, 0.42, 8),
    materials.stoneDark,
    "octagonal-platform-core",
  );
  platform.scale.z = 0.76;
  platform.position.set(0, 1.28, -1.31);
  const platformTop = furnishingMesh(
    new CylinderGeometry(1.78, 1.78, 0.12, 8),
    materials.stone,
    "octagonal-platform-top",
  );
  platformTop.scale.z = 0.76;
  platformTop.position.set(0, 1.52, -1.31);
  dais.add(platform, platformTop);

  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 3; tier += 1) {
      const cheek = furnishingMesh(
        new RoundedBoxGeometry(0.48, 0.38 + tier * 0.3, 1.02, 3, 0.09),
        materials.stoneDark,
        `side-cheek-${side < 0 ? "left" : "right"}-${tier + 1}`,
      );
      cheek.position.set(
        side * (2.7 - tier * 0.28),
        0.19 + tier * 0.3,
        1.35 - tier * 0.68,
      );
      cheeks.add(cheek);
    }
    const heraldry = createDiamond(
      materials.gold,
      `gold-side-heraldry-${side < 0 ? "left" : "right"}`,
    );
    heraldry.scale.set(0.82, 1.08, 0.8);
    heraldry.position.set(side * 2.7, 0.28, 1.875);
    cheeks.add(heraldry);
  }

  for (const [index, z] of [1.82, 0.69, -0.39].entries()) {
    const diamond = createDiamond(materials.gold, `gold-diamond-${index + 1}`);
    diamond.rotation.x = -Math.PI / 2;
    diamond.scale.setScalar(index === 0 ? 1 : 0.82);
    diamond.position.set(
      0,
      courses[index][3] + courses[index][1] / 2 + 0.025,
      z,
    );
    inlays.add(diamond);
  }
  for (const x of [-1.72, -1.03, 1.03, 1.72]) {
    const stud = furnishingMesh(
      new SphereGeometry(0.055, 7, 5),
      materials.gold,
      "domed-gold-step-stud",
    );
    stud.scale.y = 0.42;
    stud.position.set(x, 1.185, -0.54);
    inlays.add(stud);
  }
  for (const [x, z] of [
    [-1.48, -1.93],
    [1.48, -1.93],
    [-1.48, -0.69],
    [1.48, -0.69],
  ] as const) {
    const finial = furnishingMesh(
      new ConeGeometry(0.16, 0.28, 4),
      materials.gold,
      "gold-dais-corner-finial",
    );
    finial.position.set(x, 1.78, z);
    inlays.add(finial);
  }

  root.add(steps, dais, cheeks, inlays);
  registerParts(root, { root, steps, dais, cheeks, inlays });
  return root;
}

export interface ThroneMaterials {
  readonly wood: Material;
  readonly woodDark: Material;
  readonly leather: Material;
  readonly gold: Material;
  readonly gem: Material;
}

function shieldShape(): Shape {
  const shape = new Shape();
  shape.moveTo(-0.75, -1.45);
  shape.lineTo(-0.82, 0.74);
  shape.quadraticCurveTo(-0.7, 1.35, -0.3, 1.62);
  shape.lineTo(0, 1.86);
  shape.lineTo(0.3, 1.62);
  shape.quadraticCurveTo(0.7, 1.35, 0.82, 0.74);
  shape.lineTo(0.75, -1.45);
  shape.closePath();
  return shape;
}

function crownCrestShape(): Shape {
  const shape = new Shape();
  shape.moveTo(-0.75, -0.2);
  shape.lineTo(-0.62, 0.45);
  shape.lineTo(-0.28, 0.05);
  shape.lineTo(0, 0.72);
  shape.lineTo(0.28, 0.05);
  shape.lineTo(0.62, 0.45);
  shape.lineTo(0.75, -0.2);
  shape.closePath();
  return shape;
}

export function createCartoonCastleThrone(materials: ThroneMaterials): Group {
  const root = new Group();
  root.name = "img2threejs-cartoon-castle-throne";
  const frame = new Group();
  frame.name = "carved-walnut-frame";
  const upholstery = new Group();
  upholstery.name = "crimson-upholstery";
  const arms = new Group();
  arms.name = "lion-armrests";
  const ornament = new Group();
  ornament.name = "crown-crest";
  const base = new Group();
  base.name = "layered-seat-base";

  const backFrame = furnishingMesh(
    new ExtrudeGeometry(shieldShape(), {
      depth: 0.34,
      bevelEnabled: true,
      bevelSize: 0.1,
      bevelThickness: 0.07,
      bevelSegments: 2,
    }),
    materials.woodDark,
    "shield-profile-back-frame",
  );
  backFrame.position.set(0, 2.45, -0.58);
  frame.add(backFrame);

  const goldTrim = furnishingMesh(
    new ExtrudeGeometry(shieldShape(), {
      depth: 0.16,
      bevelEnabled: true,
      bevelSize: 0.055,
      bevelThickness: 0.04,
      bevelSegments: 1,
    }),
    materials.gold,
    "continuous-gold-shield-trim",
  );
  goldTrim.scale.set(0.88, 0.9, 1);
  goldTrim.position.set(0, 2.45, -0.15);
  frame.add(goldTrim);

  const backCushion = furnishingMesh(
    new ExtrudeGeometry(shieldShape(), {
      depth: 0.15,
      bevelEnabled: true,
      bevelSize: 0.075,
      bevelThickness: 0.05,
      bevelSegments: 2,
    }),
    materials.leather,
    "padded-crimson-shield-back",
  );
  backCushion.scale.set(0.75, 0.82, 1);
  backCushion.position.set(0, 2.45, 0.04);
  upholstery.add(backCushion);

  const seat = furnishingMesh(
    new RoundedBoxGeometry(1.55, 0.38, 1.18, 4, 0.13),
    materials.leather,
    "padded-crimson-seat",
  );
  seat.position.set(0, 1.0, 0.02);
  upholstery.add(seat);

  for (const [index, [width, height, depth, y]] of [
    [2.2, 0.28, 1.5, 0.2],
    [1.92, 0.28, 1.34, 0.46],
    [1.72, 0.3, 1.22, 0.72],
  ].entries()) {
    const course = furnishingMesh(
      new RoundedBoxGeometry(width, height, depth, 3, 0.08),
      index === 1 ? materials.wood : materials.woodDark,
      `throne-base-course-${index + 1}`,
    );
    course.position.y = y;
    base.add(course);
  }

  for (const side of [-1, 1]) {
    const post = furnishingMesh(
      new CylinderGeometry(0.15, 0.19, 3.75, 9),
      materials.wood,
      "carved-flanking-post",
    );
    post.position.set(side * 0.98, 2.12, -0.44);
    const finial = furnishingMesh(
      new ConeGeometry(0.23, 0.48, 6),
      materials.gold,
      "gold-post-finial",
    );
    finial.position.set(side * 0.98, 4.22, -0.44);
    frame.add(post, finial);

    const armRail = furnishingMesh(
      new RoundedBoxGeometry(0.3, 0.28, 1.12, 3, 0.08),
      materials.woodDark,
      "walnut-arm-rail",
    );
    armRail.position.set(side * 0.94, 1.35, 0.12);
    const lionHead = furnishingMesh(
      new DodecahedronGeometry(0.3, 0),
      materials.gold,
      "faceted-lion-head",
    );
    lionHead.scale.set(1, 0.78, 1.12);
    lionHead.position.set(side * 0.94, 1.48, 0.53);
    const muzzle = furnishingMesh(
      new DodecahedronGeometry(0.15, 0),
      materials.wood,
      "lion-muzzle",
    );
    muzzle.position.set(side * 0.94, 1.38, 0.78);
    arms.add(armRail, lionHead, muzzle);
  }

  const crest = furnishingMesh(
    new ExtrudeGeometry(crownCrestShape(), {
      depth: 0.16,
      bevelEnabled: true,
      bevelSize: 0.045,
      bevelThickness: 0.03,
      bevelSegments: 1,
    }),
    materials.gold,
    "five-point-crown-crest",
  );
  crest.position.set(0, 4.18, -0.38);
  const jewel = furnishingMesh(
    new DodecahedronGeometry(0.18, 0),
    materials.gem,
    "purple-crest-jewel",
  );
  jewel.scale.z = 0.55;
  jewel.position.set(0, 4.3, -0.16);
  ornament.add(crest, jewel);

  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    const rivet = furnishingMesh(
      new SphereGeometry(0.045, 7, 5),
      materials.gold,
      "upholstery-rivet",
    );
    rivet.scale.z = 0.45;
    rivet.position.set(
      Math.sin(angle) * 0.57,
      2.45 + Math.cos(angle) * 1.15,
      0.22,
    );
    upholstery.add(rivet);
  }

  root.add(frame, upholstery, arms, ornament, base);
  registerParts(root, { root, frame, upholstery, arms, ornament, base });
  return root;
}

export interface ChandelierMaterials {
  readonly iron: Material;
  readonly ironLight: Material;
  readonly gold: Material;
  readonly candle: Material;
  readonly gem: Material;
}

export function createCartoonCastleChandelier(
  materials: ChandelierMaterials,
): Group {
  const root = new Group();
  root.name = "img2threejs-cartoon-castle-chandelier";
  const rings = new Group();
  rings.name = "twin-forged-rings";
  const candles = new Group();
  candles.name = "eight-candle-array";
  const chains = new Group();
  chains.name = "linked-suspension-chains";
  const hub = new Group();
  hub.name = "crown-ceiling-hub";
  const crystals = new Group();
  crystals.name = "purple-crystal-drops";

  for (const [radius, tube, y] of [
    [1.68, 0.13, 0],
    [0.94, 0.1, 0.08],
  ] as const) {
    const ring = furnishingMesh(
      new TorusGeometry(radius, tube, 7, 28),
      radius > 1 ? materials.iron : materials.ironLight,
      radius > 1 ? "hammered-outer-ring" : "hammered-inner-ring",
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    rings.add(ring);
  }
  for (let spokeIndex = 0; spokeIndex < 4; spokeIndex += 1) {
    const spoke = furnishingMesh(
      new BoxGeometry(1.46, 0.11, 0.12),
      materials.ironLight,
      "inner-ring-brace",
    );
    spoke.rotation.y = (spokeIndex / 4) * Math.PI;
    spoke.position.y = 0.08;
    rings.add(spoke);
  }

  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const radius = index % 2 === 0 ? 1.68 : 1.42;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const cup = furnishingMesh(
      new CylinderGeometry(0.18, 0.12, 0.17, 8),
      materials.gold,
      `flared-candle-cup-${index + 1}`,
    );
    cup.position.set(x, 0.2, z);
    const candle = furnishingMesh(
      new CylinderGeometry(0.07, 0.08, 0.46, 8),
      materials.candle,
      `wax-candle-${index + 1}`,
    );
    candle.position.set(x, 0.49, z);
    const socket = new Group();
    socket.name = `flame-socket-${index + 1}`;
    socket.position.set(x, 0.8, z);
    candles.add(cup, candle, socket);
  }

  for (let chainIndex = 0; chainIndex < 3; chainIndex += 1) {
    const angle = (chainIndex / 3) * Math.PI * 2;
    for (let linkIndex = 0; linkIndex < 14; linkIndex += 1) {
      const t = linkIndex / 13;
      const link = furnishingMesh(
        new TorusGeometry(0.12, 0.026, 5, 10),
        materials.iron,
        `chain-${chainIndex + 1}-link-${linkIndex + 1}`,
      );
      link.rotation.set(linkIndex % 2 === 0 ? Math.PI / 2 : 0, angle, 0);
      link.position.set(
        Math.cos(angle) * (1.52 * (1 - t) + 0.28 * t),
        0.18 + t * 2.88,
        Math.sin(angle) * (1.52 * (1 - t) + 0.28 * t),
      );
      chains.add(link);
    }
  }

  const hubCore = furnishingMesh(
    new CylinderGeometry(0.38, 0.48, 0.36, 8),
    materials.gold,
    "faceted-ceiling-hub",
  );
  hubCore.position.y = 3.18;
  hub.add(hubCore);
  for (let index = 0; index < 6; index += 1) {
    const tooth = furnishingMesh(
      new ConeGeometry(0.11, 0.3, 4),
      materials.gold,
      "ceiling-hub-crown-tooth",
    );
    const angle = (index / 6) * Math.PI * 2;
    tooth.position.set(Math.cos(angle) * 0.36, 3.48, Math.sin(angle) * 0.36);
    hub.add(tooth);
  }

  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2 + Math.PI / 6;
    const drop = furnishingMesh(
      new DodecahedronGeometry(0.13, 0),
      materials.gem,
      "purple-crystal-drop",
    );
    drop.scale.y = 1.45;
    drop.position.set(Math.cos(angle) * 1.42, -0.31, Math.sin(angle) * 1.42);
    crystals.add(drop);
  }

  root.add(rings, candles, chains, hub, crystals);
  registerParts(root, { root, rings, candles, chains, hub, crystals });
  return root;
}
