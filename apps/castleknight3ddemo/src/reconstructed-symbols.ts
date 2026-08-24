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

export interface ReconstructedSymbolMaterials {
  readonly wood: Material;
  readonly steel: Material;
  readonly iron: Material;
  readonly gold: Material;
  readonly leather: Material;
  readonly parchment: Material;
  readonly purple: Material;
  readonly blue: Material;
  readonly outline: Material;
}

function symbolMesh(
  geometry: BufferGeometry,
  material: Material,
  outlineMaterial: Material,
  name: string,
  outlineScale = 1.035,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const outline = new Mesh(geometry, outlineMaterial);
  outline.name = `${name}-outline`;
  outline.scale.setScalar(outlineScale);
  outline.castShadow = false;
  outline.receiveShadow = false;
  mesh.add(outline);
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

function axeBladeShape(): Shape {
  const shape = new Shape();
  shape.moveTo(0.12, -0.42);
  shape.bezierCurveTo(-0.36, -0.36, -0.78, -0.08, -0.88, 0.43);
  shape.bezierCurveTo(-0.5, 0.3, -0.18, 0.34, 0.12, 0.46);
  shape.lineTo(0.27, 0.22);
  shape.lineTo(0.27, -0.24);
  shape.closePath();
  return shape;
}

export function createCartoonBattleAxeSymbol(
  materials: ReconstructedSymbolMaterials,
): Group {
  const root = new Group();
  root.name = "img2threejs-cartoon-battle-axe-symbol";
  const haft = new Group();
  haft.name = "walnut-haft";
  const blade = new Group();
  blade.name = "crescent-steel-blade";
  const head = new Group();
  head.name = "gold-head-socket";
  const grip = new Group();
  grip.name = "burgundy-grip-wrap";

  const shaft = symbolMesh(
    new CylinderGeometry(0.065, 0.085, 1.55, 7),
    materials.wood,
    materials.outline,
    "tapered-walnut-shaft",
  );
  shaft.position.y = -0.08;
  haft.add(shaft);

  const bladeMesh = symbolMesh(
    new ExtrudeGeometry(axeBladeShape(), {
      depth: 0.12,
      bevelEnabled: true,
      bevelSize: 0.035,
      bevelThickness: 0.025,
      bevelSegments: 1,
    }),
    materials.steel,
    materials.outline,
    "concave-crescent-blade",
    1.025,
  );
  bladeMesh.position.set(-0.05, 0.56, -0.06);
  const spine = symbolMesh(
    new RoundedBoxGeometry(0.22, 0.74, 0.2, 2, 0.045),
    materials.iron,
    materials.outline,
    "dark-reinforced-blade-spine",
  );
  spine.position.set(0.18, 0.63, 0);
  blade.add(bladeMesh, spine);

  const collar = symbolMesh(
    new CylinderGeometry(0.16, 0.2, 0.44, 7),
    materials.gold,
    materials.outline,
    "faceted-gold-head-collar",
  );
  collar.position.y = 0.58;
  head.add(collar);
  for (const z of [-0.16, 0.16]) {
    const rivet = symbolMesh(
      new SphereGeometry(0.045, 6, 4),
      materials.gold,
      materials.outline,
      "domed-head-rivet",
    );
    rivet.position.set(0, 0.64, z);
    head.add(rivet);
  }

  for (let index = 0; index < 5; index += 1) {
    const band = symbolMesh(
      new TorusGeometry(0.088, 0.018, 5, 8),
      materials.leather,
      materials.outline,
      `leather-grip-wrap-${index + 1}`,
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.35 - index * 0.085;
    grip.add(band);
  }
  const pommel = symbolMesh(
    new DodecahedronGeometry(0.13, 0),
    materials.purple,
    materials.outline,
    "faceted-purple-pommel",
  );
  pommel.position.y = -0.93;
  grip.add(pommel);

  root.add(haft, blade, head, grip);
  root.rotation.z = -0.62;
  registerParts(root, { root, haft, blade, head, grip });
  return root;
}

export function createCartoonSpellbookSymbol(
  materials: ReconstructedSymbolMaterials,
): Group {
  const root = new Group();
  root.name = "img2threejs-cartoon-spellbook-symbol";
  const pages = new Group();
  pages.name = "layered-parchment-pages";
  const covers = new Group();
  covers.name = "crimson-leather-covers";
  const hardware = new Group();
  hardware.name = "gold-book-hardware";
  const jewel = new Group();
  jewel.name = "purple-cover-jewel";

  const pageBlock = symbolMesh(
    new RoundedBoxGeometry(1.14, 0.34, 0.86, 3, 0.08),
    materials.parchment,
    materials.outline,
    "rounded-parchment-page-block",
    1.025,
  );
  pages.add(pageBlock);
  for (let index = 0; index < 5; index += 1) {
    const line = symbolMesh(
      new BoxGeometry(1.08, 0.016, 0.88),
      index % 2 === 0 ? materials.parchment : materials.gold,
      materials.outline,
      `visible-page-course-${index + 1}`,
      1.012,
    );
    line.position.y = -0.13 + index * 0.065;
    pages.add(line);
  }

  for (const [name, y] of [
    ["upper-crimson-cover", 0.24],
    ["lower-crimson-cover", -0.24],
  ] as const) {
    const cover = symbolMesh(
      new RoundedBoxGeometry(1.35, 0.13, 1.0, 3, 0.07),
      materials.leather,
      materials.outline,
      name,
    );
    cover.position.y = y;
    covers.add(cover);
  }
  const spine = symbolMesh(
    new CylinderGeometry(0.18, 0.18, 0.98, 8, 1, false, 0, Math.PI),
    materials.leather,
    materials.outline,
    "rounded-leather-spine",
  );
  spine.rotation.x = Math.PI / 2;
  spine.position.set(-0.64, 0, 0);
  covers.add(spine);

  for (const z of [-0.42, 0.42]) {
    for (const x of [-0.57, 0.57]) {
      const guard = symbolMesh(
        new RoundedBoxGeometry(0.24, 0.1, 0.24, 2, 0.035),
        materials.gold,
        materials.outline,
        "gold-corner-guard",
      );
      guard.position.set(x, 0.335, z);
      hardware.add(guard);
    }
  }
  for (const z of [-0.32, 0, 0.32]) {
    const band = symbolMesh(
      new TorusGeometry(0.2, 0.035, 5, 8, Math.PI),
      materials.gold,
      materials.outline,
      "gold-spine-band",
    );
    band.rotation.set(0, Math.PI / 2, Math.PI / 2);
    band.position.set(-0.66, 0, z);
    hardware.add(band);
  }
  const clasp = symbolMesh(
    new RoundedBoxGeometry(0.24, 0.16, 0.38, 2, 0.04),
    materials.gold,
    materials.outline,
    "front-gold-clasp",
  );
  clasp.position.set(0.67, 0.08, 0);
  hardware.add(clasp);

  const bezel = symbolMesh(
    new CylinderGeometry(0.19, 0.19, 0.07, 6),
    materials.gold,
    materials.outline,
    "gold-jewel-bezel",
  );
  bezel.position.set(0.08, 0.35, 0);
  const gem = symbolMesh(
    new DodecahedronGeometry(0.13, 0),
    materials.purple,
    materials.outline,
    "faceted-purple-cover-gem",
  );
  gem.scale.y = 0.55;
  gem.position.set(0.08, 0.41, 0);
  jewel.add(bezel, gem);

  root.add(pages, covers, hardware, jewel);
  root.rotation.set(0.48, -0.2, 0.08);
  registerParts(root, { root, pages, covers, hardware, jewel });
  return root;
}

export function createCartoonCrownSymbol(
  materials: ReconstructedSymbolMaterials,
): Group {
  const root = new Group();
  root.name = "img2threejs-cartoon-crown-symbol";
  const circlet = new Group();
  circlet.name = "antique-gold-circlet";
  const points = new Group();
  points.name = "five-crown-points";
  const cap = new Group();
  cap.name = "burgundy-velvet-cap";
  const jewels = new Group();
  jewels.name = "three-jewel-layout";

  const band = symbolMesh(
    new CylinderGeometry(0.52, 0.57, 0.3, 10),
    materials.gold,
    materials.outline,
    "thick-faceted-circlet-band",
  );
  circlet.add(band);
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const rivet = symbolMesh(
      new SphereGeometry(0.035, 6, 4),
      materials.gold,
      materials.outline,
      "domed-circlet-rivet",
    );
    rivet.position.set(Math.sin(angle) * 0.535, 0.03, Math.cos(angle) * 0.535);
    circlet.add(rivet);
  }

  const velvet = symbolMesh(
    new SphereGeometry(0.47, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2),
    materials.leather,
    materials.outline,
    "domed-burgundy-cap",
  );
  velvet.position.y = 0.12;
  cap.add(velvet);
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    const point = symbolMesh(
      new ConeGeometry(index === 0 ? 0.15 : 0.13, index === 0 ? 0.78 : 0.64, 4),
      materials.gold,
      materials.outline,
      index === 0 ? "dominant-front-crown-point" : "radial-crown-point",
    );
    point.position.set(
      Math.sin(angle) * 0.46,
      index === 0 ? 0.62 : 0.54,
      Math.cos(angle) * 0.46,
    );
    point.rotation.y = angle;
    points.add(point);
  }

  const centerGem = symbolMesh(
    new DodecahedronGeometry(0.14, 0),
    materials.purple,
    materials.outline,
    "purple-front-jewel",
  );
  centerGem.scale.z = 0.55;
  centerGem.position.set(0, 0.06, 0.58);
  jewels.add(centerGem);
  for (const side of [-1, 1]) {
    const gem = symbolMesh(
      new DodecahedronGeometry(0.095, 0),
      materials.blue,
      materials.outline,
      "blue-side-jewel",
    );
    gem.position.set(side * 0.38, 0.02, 0.43);
    jewels.add(gem);
  }

  root.add(circlet, points, cap, jewels);
  root.rotation.set(-0.12, -0.12, 0);
  registerParts(root, { root, circlet, points, cap, jewels });
  return root;
}
