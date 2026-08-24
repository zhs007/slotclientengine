import {
  BoxGeometry,
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
