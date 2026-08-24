import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  Object3D,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import type { BufferGeometry, Material } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

function propMesh(
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
  for (const [id, object] of Object.entries(parts)) {
    object.userData.sculptPartId = id;
  }

  root.userData.sculptRuntime = {
    nodeIds: Object.keys(parts),
    clickablePartIds: Object.keys(parts),
    explodablePartIds: Object.keys(parts).filter((id) => id !== "root"),
  };
}

export interface TreasureChestMaterials {
  readonly wood: Material;
  readonly gold: Material;
  readonly iron: Material;
  readonly gem: Material;
}

function createLockShape(): Shape {
  const shape = new Shape();
  shape.moveTo(0, 0.32);
  shape.lineTo(0.25, 0.08);
  shape.lineTo(0.18, -0.3);
  shape.lineTo(0, -0.43);
  shape.lineTo(-0.18, -0.3);
  shape.lineTo(-0.25, 0.08);
  shape.closePath();
  return shape;
}

export function createCartoonTreasureChest(
  materials: TreasureChestMaterials,
): Group {
  const root = new Group();
  root.name = "img2threejs-cartoon-treasure-chest";
  const body = new Group();
  body.name = "body-shell";
  const lidPivot = new Group();
  lidPivot.name = "lid-shell";
  lidPivot.position.set(0, 0.24, -0.25);
  const reinforcement = new Group();
  reinforcement.name = "reinforcement-frame";
  const lock = new Group();
  lock.name = "front-lock";

  const bodyCore = propMesh(
    new RoundedBoxGeometry(0.98, 0.56, 0.62, 4, 0.07),
    materials.wood,
    "beveled-walnut-body",
  );
  bodyCore.position.y = -0.08;
  body.add(bodyCore);
  const plankGeometry = new RoundedBoxGeometry(0.78, 0.105, 0.055, 2, 0.025);
  for (const [index, y] of [-0.25, -0.09, 0.07].entries()) {
    const plank = propMesh(
      plankGeometry,
      materials.wood,
      `front-plank-${index + 1}`,
    );
    plank.position.set(0, y, 0.326);
    body.add(plank);
  }

  const lidCore = propMesh(
    new RoundedBoxGeometry(0.92, 0.32, 0.54, 4, 0.1),
    materials.wood,
    "solid-arched-lid-core",
  );
  lidCore.position.set(0, 0.15, 0.25);
  lidPivot.add(lidCore);
  const lidPlankGeometry = new RoundedBoxGeometry(0.9, 0.16, 0.145, 3, 0.035);
  const arcAngles = [-1.03, -0.52, 0, 0.52, 1.03];
  arcAngles.forEach((angle, index) => {
    const plank = propMesh(
      lidPlankGeometry,
      materials.wood,
      `arched-lid-plank-${index + 1}`,
    );
    plank.position.set(
      0,
      Math.cos(angle) * 0.33,
      0.25 + Math.sin(angle) * 0.27,
    );
    plank.rotation.x = angle;
    lidPivot.add(plank);
  });
  for (const x of [-0.39, 0.39]) {
    const hoop = propMesh(
      new TorusGeometry(0.36, 0.055, 6, 16, Math.PI),
      materials.gold,
      "faceted-gold-lid-hoop",
    );
    hoop.rotation.y = Math.PI / 2;
    hoop.position.set(x, 0, 0.25);
    lidPivot.add(hoop);
  }

  const upperRail = propMesh(
    new RoundedBoxGeometry(1.08, 0.13, 0.68, 3, 0.035),
    materials.gold,
    "upper-gold-rail",
  );
  upperRail.position.y = 0.2;
  const lowerRail = propMesh(
    new RoundedBoxGeometry(1.08, 0.12, 0.68, 3, 0.035),
    materials.gold,
    "lower-gold-rail",
  );
  lowerRail.position.y = -0.37;
  reinforcement.add(upperRail, lowerRail);

  const postGeometry = new RoundedBoxGeometry(0.14, 0.59, 0.16, 3, 0.04);
  const footGeometry = new RoundedBoxGeometry(0.23, 0.2, 0.22, 3, 0.055);
  for (const x of [-0.47, 0.47]) {
    for (const z of [-0.27, 0.27]) {
      const post = propMesh(
        postGeometry,
        materials.gold,
        "vertical-corner-post",
      );
      post.position.set(x, -0.08, z);
      const foot = propMesh(
        footGeometry,
        materials.gold,
        "projecting-corner-foot",
      );
      foot.position.set(x, -0.34, z);
      reinforcement.add(post, foot);
    }
    for (const y of [-0.27, 0.12]) {
      const rivet = propMesh(
        new SphereGeometry(0.047, 8, 5),
        materials.gold,
        "domed-gold-rivet",
      );
      rivet.scale.z = 0.48;
      rivet.position.set(x, y, 0.374);
      reinforcement.add(rivet);
    }
  }

  const escutcheon = propMesh(
    new ExtrudeGeometry(createLockShape(), {
      depth: 0.075,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.018,
      bevelSegments: 2,
    }),
    materials.gold,
    "pointed-gold-escutcheon",
  );
  const inset = propMesh(
    new DodecahedronGeometry(0.19, 0),
    materials.gem,
    "faceted-purple-gem",
  );
  inset.scale.set(0.78, 1.25, 0.42);
  inset.position.set(0, -0.03, 0.105);
  lock.add(escutcheon, inset);
  lock.position.set(0, -0.02, 0.37);
  lock.scale.setScalar(0.76);

  const plateGeometry = new RoundedBoxGeometry(0.2, 0.16, 0.055, 2, 0.025);
  for (const x of [-0.3, 0.3]) {
    const plate = propMesh(
      plateGeometry,
      materials.iron,
      "stepped-iron-front-plate",
    );
    plate.position.set(x, 0.08, 0.365);
    reinforcement.add(plate);
    const pin = propMesh(
      new SphereGeometry(0.035, 7, 5),
      materials.iron,
      "iron-rivet",
    );
    pin.scale.z = 0.45;
    pin.position.set(x, 0.08, 0.402);
    reinforcement.add(pin);
  }
  for (const x of [-0.28, 0.28]) {
    const hinge = propMesh(
      new BoxGeometry(0.19, 0.17, 0.06),
      materials.iron,
      "rear-hinge-plate",
    );
    hinge.position.set(x, 0.18, -0.35);
    reinforcement.add(hinge);
  }

  root.add(body, lidPivot, reinforcement, lock);
  registerParts(root, { root, body, lid: lidPivot, reinforcement, lock });
  return root;
}

export interface RoundColumnMaterials {
  readonly stone: Material;
  readonly stoneLight: Material;
  readonly stoneDark: Material;
}

function createCapitalLeafShape(): Shape {
  const shape = new Shape();
  shape.moveTo(0, 0.32);
  shape.lineTo(0.18, 0.08);
  shape.lineTo(0.14, -0.22);
  shape.lineTo(0, -0.38);
  shape.lineTo(-0.14, -0.22);
  shape.lineTo(-0.18, 0.08);
  shape.closePath();
  return shape;
}

export function createRoundCastleColumn(
  materials: RoundColumnMaterials,
): Group {
  const root = new Group();
  root.name = "img2threejs-round-castle-column";
  const base = new Group();
  base.name = "octagonal-base-stack";
  const shaft = new Group();
  shaft.name = "five-drum-shaft";
  const capital = new Group();
  capital.name = "radial-leaf-capital";

  const lowerPlinth = propMesh(
    new CylinderGeometry(0.72, 0.78, 0.34, 8, 1, false),
    materials.stoneDark,
    "lower-octagonal-plinth",
  );
  lowerPlinth.position.y = 0.17;
  const upperPlinth = propMesh(
    new CylinderGeometry(0.6, 0.67, 0.28, 8, 1, false),
    materials.stone,
    "upper-octagonal-plinth",
  );
  upperPlinth.position.y = 0.46;
  base.add(lowerPlinth, upperPlinth);
  for (const [index, data] of [
    [0.53, 0.1, 0.62],
    [0.62, 0.11, 0.54],
    [0.7, 0.08, 0.47],
  ].entries()) {
    const [y, tube, radius] = data;
    const ring = propMesh(
      new TorusGeometry(radius, tube, 7, 18),
      index === 1 ? materials.stoneLight : materials.stone,
      `base-transition-ring-${index + 1}`,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    base.add(ring);
  }

  const drumGeometry = new CylinderGeometry(0.38, 0.4, 0.72, 16, 2, false);
  const fluteGeometry = new RoundedBoxGeometry(0.065, 0.64, 0.065, 2, 0.025);
  for (let drumIndex = 0; drumIndex < 5; drumIndex += 1) {
    const drum = propMesh(
      drumGeometry,
      materials.stone,
      `round-stone-drum-${drumIndex + 1}`,
    );
    drum.position.y = 1.07 + drumIndex * 0.69;
    drum.scale.setScalar(1 - drumIndex * 0.012);
    shaft.add(drum);
    for (let fluteIndex = 0; fluteIndex < 12; fluteIndex += 1) {
      const angle = (fluteIndex / 12) * Math.PI * 2;
      const flute = propMesh(
        fluteGeometry,
        materials.stoneLight,
        "shallow-vertical-flute",
      );
      flute.position.set(
        Math.cos(angle) * 0.39,
        drum.position.y,
        Math.sin(angle) * 0.39,
      );
      flute.rotation.y = -angle;
      flute.scale.setScalar(1 - drumIndex * 0.012);
      shaft.add(flute);
    }
    if (drumIndex < 4) {
      const seam = propMesh(
        new TorusGeometry(0.392 - drumIndex * 0.004, 0.025, 6, 16),
        materials.stoneDark,
        "dark-drum-seam",
      );
      seam.rotation.x = Math.PI / 2;
      seam.position.y = 1.415 + drumIndex * 0.69;
      shaft.add(seam);
    }
  }

  for (const [index, y] of [4.29, 4.43].entries()) {
    const ring = propMesh(
      new TorusGeometry(0.45 + index * 0.04, 0.065, 7, 18),
      materials.stoneLight,
      `capital-neck-ring-${index + 1}`,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    capital.add(ring);
  }
  const leafGeometry = new ExtrudeGeometry(createCapitalLeafShape(), {
    depth: 0.16,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.025,
    bevelSegments: 1,
  });
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const leaf = propMesh(
      leafGeometry,
      materials.stone,
      "geometric-capital-leaf",
    );
    leaf.position.set(Math.cos(angle) * 0.48, 4.71, Math.sin(angle) * 0.48);
    leaf.rotation.y = -angle + Math.PI / 2;
    leaf.scale.set(0.82, 0.88, 0.9);
    capital.add(leaf);
  }
  const capitalBand = propMesh(
    new CylinderGeometry(0.67, 0.56, 0.24, 8, 1, false),
    materials.stoneDark,
    "capital-abacus-band",
  );
  capitalBand.position.y = 5.02;
  const slab = propMesh(
    new CylinderGeometry(0.75, 0.73, 0.34, 8, 1, false),
    materials.stone,
    "projecting-octagonal-top-slab",
  );
  slab.position.y = 5.27;
  capital.add(capitalBand, slab);

  root.add(base, shaft, capital);
  registerParts(root, { root, base, shaft, capital });
  return root;
}

export interface CastleWoodPropMaterials {
  readonly wood: Material;
  readonly woodDark: Material;
  readonly iron: Material;
}

function createBenchSupportShape(): Shape {
  const shape = new Shape();
  shape.moveTo(-0.43, 0);
  shape.lineTo(-0.34, 0.62);
  shape.quadraticCurveTo(-0.25, 0.88, -0.12, 0.92);
  shape.lineTo(0.12, 0.92);
  shape.quadraticCurveTo(0.25, 0.88, 0.34, 0.62);
  shape.lineTo(0.43, 0);
  shape.lineTo(0.2, 0);
  shape.quadraticCurveTo(0.12, 0.37, 0, 0.5);
  shape.quadraticCurveTo(-0.12, 0.37, -0.2, 0);
  shape.closePath();
  return shape;
}

export function createCartoonCastleBench(
  materials: CastleWoodPropMaterials,
): Group {
  const root = new Group();
  root.name = "img2threejs-cartoon-castle-bench";
  const seat = new Group();
  seat.name = "three-plank-seat";
  const supports = new Group();
  supports.name = "carved-trestle-supports";
  const hardware = new Group();
  hardware.name = "forged-iron-straps";

  const plankGeometry = new RoundedBoxGeometry(1.72, 0.19, 0.26, 3, 0.055);
  for (const [index, z] of [-0.28, 0, 0.28].entries()) {
    const plank = propMesh(
      plankGeometry,
      materials.wood,
      `uneven-seat-plank-${index + 1}`,
    );
    plank.position.set(0, 0.91 + (index === 1 ? 0.015 : 0), z);
    plank.rotation.z = (index - 1) * 0.008;
    seat.add(plank);
  }

  const supportGeometry = new ExtrudeGeometry(createBenchSupportShape(), {
    depth: 0.22,
    bevelEnabled: true,
    bevelSize: 0.045,
    bevelThickness: 0.035,
    bevelSegments: 2,
  });
  for (const x of [-0.63, 0.63]) {
    const support = propMesh(
      supportGeometry,
      materials.woodDark,
      "curved-trestle-support",
    );
    support.rotation.y = Math.PI / 2;
    support.position.set(x - 0.11, 0, 0);
    supports.add(support);
  }
  const brace = propMesh(
    new RoundedBoxGeometry(1.32, 0.16, 0.18, 3, 0.045),
    materials.woodDark,
    "low-cross-brace",
  );
  brace.position.set(0, 0.34, 0);
  supports.add(brace);

  const strapGeometry = new RoundedBoxGeometry(0.15, 0.095, 0.84, 3, 0.035);
  for (const x of [-0.64, 0.64]) {
    const strap = propMesh(
      strapGeometry,
      materials.iron,
      "seat-end-iron-strap",
    );
    strap.position.set(x, 1.03, 0);
    hardware.add(strap);
    for (const z of [-0.27, 0, 0.27]) {
      const rivet = propMesh(
        new SphereGeometry(0.048, 8, 5),
        materials.iron,
        "domed-bench-rivet",
      );
      rivet.scale.y = 0.48;
      rivet.position.set(x, 1.09, z);
      hardware.add(rivet);
    }
  }
  for (const x of [-0.57, 0.57]) {
    const bracePlate = propMesh(
      new RoundedBoxGeometry(0.2, 0.25, 0.04, 2, 0.03),
      materials.iron,
      "cross-brace-end-plate",
    );
    bracePlate.position.set(x, 0.34, 0.11);
    hardware.add(bracePlate);
  }

  root.add(seat, supports, hardware);
  registerParts(root, { root, seat, supports, hardware });
  return root;
}

export function createCartoonOakBarrel(
  materials: CastleWoodPropMaterials,
): Group {
  const root = new Group();
  root.name = "img2threejs-cartoon-oak-barrel";
  const shell = new Group();
  shell.name = "bulging-stave-shell";
  const hoops = new Group();
  hoops.name = "three-forged-hoops";
  const top = new Group();
  top.name = "recessed-lid-and-bung";

  const profile = [
    new Vector2(0.39, 0),
    new Vector2(0.45, 0.08),
    new Vector2(0.5, 0.34),
    new Vector2(0.52, 0.64),
    new Vector2(0.49, 0.98),
    new Vector2(0.43, 1.18),
    new Vector2(0.39, 1.24),
  ];
  const body = propMesh(
    new LatheGeometry(profile, 14),
    materials.wood,
    "lathed-bulging-barrel-body",
  );
  shell.add(body);
  const staveGeometry = new RoundedBoxGeometry(0.018, 1.05, 0.028, 2, 0.008);
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2;
    const stave = propMesh(
      staveGeometry,
      materials.woodDark,
      `raised-stave-seam-${index + 1}`,
    );
    stave.position.set(Math.cos(angle) * 0.505, 0.62, Math.sin(angle) * 0.505);
    stave.rotation.y = -angle;
    shell.add(stave);
  }

  for (const [hoopIndex, y] of [0.14, 0.62, 1.08].entries()) {
    const hoop = propMesh(
      new TorusGeometry(hoopIndex === 1 ? 0.515 : 0.47, 0.055, 6, 18),
      materials.iron,
      `hammered-iron-hoop-${hoopIndex + 1}`,
    );
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    hoops.add(hoop);
    for (let rivetIndex = 0; rivetIndex < 6; rivetIndex += 1) {
      const angle = (rivetIndex / 6) * Math.PI * 2;
      const rivet = propMesh(
        new SphereGeometry(0.037, 7, 4),
        materials.iron,
        "barrel-hoop-rivet",
      );
      const radius = hoopIndex === 1 ? 0.56 : 0.515;
      rivet.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      rivet.scale.set(1, 0.7, 1);
      hoops.add(rivet);
    }
  }

  const lid = propMesh(
    new CylinderGeometry(0.37, 0.39, 0.075, 14),
    materials.wood,
    "recessed-barrel-lid",
  );
  lid.position.y = 1.235;
  const rim = propMesh(
    new TorusGeometry(0.4, 0.035, 5, 14),
    materials.wood,
    "raised-lid-rim",
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.28;
  const bung = propMesh(
    new CylinderGeometry(0.085, 0.095, 0.12, 10),
    materials.woodDark,
    "wooden-barrel-bung",
  );
  bung.position.set(0.14, 1.33, -0.08);
  top.add(lid, rim, bung);

  root.add(shell, hoops, top);
  registerParts(root, { root, shell, hoops, top });
  return root;
}

export interface CastleWallMaterials {
  readonly stone: Material;
  readonly stoneLight: Material;
  readonly stoneDark: Material;
  readonly mortar: Material;
}

export function createCartoonCastleWallSection(
  materials: CastleWallMaterials,
  withPilaster = true,
): Group {
  const root = new Group();
  root.name = "img2threejs-cartoon-castle-wall-section";
  const masonry = new Group();
  masonry.name = "alternating-beveled-masonry";
  const pilaster = new Group();
  pilaster.name = "engaged-round-pilaster";
  const cornice = new Group();
  cornice.name = "layered-wall-cornice";

  const mortarCore = propMesh(
    new RoundedBoxGeometry(3.26, 6.2, 0.42, 2, 0.05),
    materials.mortar,
    "deep-mortar-wall-core",
  );
  mortarCore.position.y = 3.1;
  masonry.add(mortarCore);

  const brickGeometry = new RoundedBoxGeometry(0.98, 0.69, 0.42, 2, 0.07);
  const brickLightGeometry = new RoundedBoxGeometry(0.98, 0.69, 0.44, 2, 0.07);
  const brickCount = 24;
  const bricks = new InstancedMesh(brickGeometry, materials.stone, brickCount);
  bricks.name = "instanced-cut-stone-courses";
  const edgeBricks = new InstancedMesh(
    brickLightGeometry,
    materials.stoneLight,
    16,
  );
  edgeBricks.name = "instanced-alternate-edge-stones";
  const dummy = new Object3D();
  let brickIndex = 0;
  let edgeIndex = 0;
  for (let row = 0; row < 8; row += 1) {
    const offset = row % 2 === 0 ? 0 : 0.5;
    for (let column = -2; column <= 2; column += 1) {
      const x = column * 0.82 + offset * 0.82;
      if (Math.abs(x) > 1.45) continue;
      dummy.position.set(
        x,
        0.43 + row * 0.72,
        0.24 + ((row + column) % 2) * 0.012,
      );
      dummy.rotation.set(0, 0, (((row * 7 + column * 3) % 5) - 2) * 0.006);
      dummy.scale.set(0.95 + ((row + column + 7) % 3) * 0.025, 0.95, 1);
      dummy.updateMatrix();
      if ((row + column) % 3 === 0 && edgeIndex < edgeBricks.count) {
        edgeBricks.setMatrixAt(edgeIndex, dummy.matrix);
        edgeBricks.setColorAt(edgeIndex, new Color(0xb6a4bc));
        edgeIndex += 1;
      } else if (brickIndex < bricks.count) {
        bricks.setMatrixAt(brickIndex, dummy.matrix);
        bricks.setColorAt(
          brickIndex,
          new Color(0x8f809d).offsetHSL(0, 0, ((row + column) % 4) * 0.018),
        );
        brickIndex += 1;
      }
    }
  }
  bricks.count = brickIndex;
  edgeBricks.count = edgeIndex;
  bricks.instanceMatrix.needsUpdate = true;
  edgeBricks.instanceMatrix.needsUpdate = true;
  if (bricks.instanceColor) bricks.instanceColor.needsUpdate = true;
  if (edgeBricks.instanceColor) edgeBricks.instanceColor.needsUpdate = true;
  for (const mesh of [bricks, edgeBricks]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  masonry.add(bricks, edgeBricks);

  if (withPilaster) {
    const lowerBase = propMesh(
      new CylinderGeometry(0.52, 0.62, 0.28, 10),
      materials.stoneDark,
      "pilaster-lower-stepped-base",
    );
    lowerBase.position.set(0, 0.18, 0.56);
    const upperBase = propMesh(
      new CylinderGeometry(0.44, 0.5, 0.22, 10),
      materials.stoneLight,
      "pilaster-upper-stepped-base",
    );
    upperBase.position.set(0, 0.43, 0.56);
    pilaster.add(lowerBase, upperBase);
    for (let index = 0; index < 5; index += 1) {
      const drum = propMesh(
        new CylinderGeometry(0.3, 0.32, 0.89, 12, 1, false),
        index % 2 === 0 ? materials.stone : materials.stoneLight,
        `engaged-pilaster-drum-${index + 1}`,
      );
      drum.position.set(0, 0.94 + index * 0.86, 0.54);
      pilaster.add(drum);
      if (index < 4) {
        const seam = propMesh(
          new TorusGeometry(0.315, 0.027, 5, 12),
          materials.stoneDark,
          "pilaster-drum-seam",
        );
        seam.rotation.x = Math.PI / 2;
        seam.position.set(0, 1.37 + index * 0.86, 0.54);
        pilaster.add(seam);
      }
    }
    const neck = propMesh(
      new CylinderGeometry(0.46, 0.32, 0.26, 10),
      materials.stoneDark,
      "pilaster-capital-neck",
    );
    neck.position.set(0, 5.18, 0.54);
    const capital = propMesh(
      new RoundedBoxGeometry(1.18, 0.32, 0.78, 3, 0.07),
      materials.stoneLight,
      "projecting-pilaster-capital",
    );
    capital.position.set(0, 5.48, 0.48);
    pilaster.add(neck, capital);
  }

  for (const [index, data] of [
    [0.17, 3.32, 0.2],
    [5.82, 3.34, 0.22],
    [6.08, 3.52, 0.28],
  ].entries()) {
    const [y, width, depth] = data;
    const band = propMesh(
      new RoundedBoxGeometry(width, index === 0 ? 0.22 : 0.28, depth, 2, 0.045),
      index === 1 ? materials.stoneDark : materials.stoneLight,
      `wall-cornice-course-${index + 1}`,
    );
    band.position.set(0, y, 0.36);
    cornice.add(band);
  }

  root.add(masonry, pilaster, cornice);
  registerParts(root, { root, masonry, pilaster, cornice });
  return root;
}

export interface CastleTorchMaterials {
  readonly iron: Material;
  readonly ironLight: Material;
  readonly gold: Material;
}

function createTorchBackplateShape(): Shape {
  const shape = new Shape();
  shape.moveTo(0, 0.72);
  shape.lineTo(0.42, 0);
  shape.lineTo(0, -0.72);
  shape.lineTo(-0.42, 0);
  shape.closePath();
  return shape;
}

export function createCartoonWallTorch(materials: CastleTorchMaterials): Group {
  const root = new Group();
  root.name = "img2threejs-cartoon-wall-torch";
  const backplate = new Group();
  backplate.name = "layered-diamond-backplate";
  const bracket = new Group();
  bracket.name = "curled-forged-bracket";
  const brazier = new Group();
  brazier.name = "crown-brazier-cup";

  const plate = propMesh(
    new ExtrudeGeometry(createTorchBackplateShape(), {
      depth: 0.12,
      bevelEnabled: true,
      bevelSize: 0.045,
      bevelThickness: 0.035,
      bevelSegments: 2,
    }),
    materials.iron,
    "hammered-diamond-wall-plate",
  );
  plate.position.z = -0.06;
  const inset = propMesh(
    new ExtrudeGeometry(createTorchBackplateShape(), {
      depth: 0.04,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.018,
      bevelSegments: 1,
    }),
    materials.ironLight,
    "raised-diamond-plate-border",
  );
  inset.scale.set(0.79, 0.79, 1);
  inset.position.z = 0.085;
  backplate.add(plate, inset);
  for (const [x, y] of [
    [0, 0.48],
    [0.27, 0],
    [0, -0.48],
    [-0.27, 0],
  ]) {
    const rivet = propMesh(
      new SphereGeometry(0.065, 8, 5),
      materials.gold,
      "gold-wall-plate-rivet",
    );
    rivet.scale.z = 0.48;
    rivet.position.set(x, y, 0.16);
    backplate.add(rivet);
  }

  const bracketCurve = new CatmullRomCurve3([
    new Vector3(0, -0.12, 0.1),
    new Vector3(0, -0.36, 0.38),
    new Vector3(0, -0.24, 0.72),
    new Vector3(0, 0.02, 0.83),
  ]);
  const arm = propMesh(
    new TubeGeometry(bracketCurve, 14, 0.075, 7, false),
    materials.iron,
    "curved-projecting-iron-arm",
  );
  bracket.add(arm);
  const collar = propMesh(
    new RoundedBoxGeometry(0.32, 0.3, 0.12, 2, 0.045),
    materials.gold,
    "gold-bracket-wall-collar",
  );
  collar.position.set(0, -0.1, 0.12);
  bracket.add(collar);

  const cup = propMesh(
    new CylinderGeometry(0.34, 0.23, 0.38, 10, 1, false),
    materials.iron,
    "faceted-brazier-cup",
  );
  cup.position.set(0, 0.18, 0.83);
  brazier.add(cup);
  const upperRing = propMesh(
    new TorusGeometry(0.34, 0.06, 6, 10),
    materials.ironLight,
    "brazier-upper-rim",
  );
  upperRing.rotation.x = Math.PI / 2;
  upperRing.position.set(0, 0.38, 0.83);
  brazier.add(upperRing);
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const tooth = propMesh(
      new RoundedBoxGeometry(0.13, 0.23, 0.09, 2, 0.025),
      materials.ironLight,
      "crown-brazier-tooth",
    );
    tooth.position.set(
      Math.cos(angle) * 0.31,
      0.48,
      0.83 + Math.sin(angle) * 0.31,
    );
    tooth.rotation.y = -angle;
    brazier.add(tooth);
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    const stud = propMesh(
      new SphereGeometry(0.045, 7, 4),
      materials.gold,
      "gold-brazier-stud",
    );
    stud.position.set(
      Math.cos(angle) * 0.29,
      0.18,
      0.83 + Math.sin(angle) * 0.29,
    );
    brazier.add(stud);
  }

  const flameSocket = new Group();
  flameSocket.name = "flame-socket";
  flameSocket.position.set(0, 0.78, 0.83);
  brazier.add(flameSocket);

  root.add(backplate, bracket, brazier);
  registerParts(root, { root, backplate, bracket, brazier, flameSocket });
  root.userData.flameSocketName = flameSocket.name;
  return root;
}
