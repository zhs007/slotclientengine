import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import type { PlantPlacement } from "./layout.js";

const MAX_PETALS_PER_FLOWER = 10;
const UP = new Vector3(0, 1, 0);
const FLOWER_STYLES = [
  { petals: 8, width: 0.13, thickness: 0.055, length: 0.27, centre: 0.14 },
  { petals: 5, width: 0.19, thickness: 0.072, length: 0.21, centre: 0.17 },
  { petals: 10, width: 0.105, thickness: 0.048, length: 0.3, centre: 0.12 },
  { petals: 6, width: 0.16, thickness: 0.064, length: 0.24, centre: 0.15 },
] as const;
const PETAL_COLORS = [
  0xffc6d7, 0xff7898, 0xe4c3ff, 0x8bc8f2, 0xffefb0, 0xffaa5f, 0xfaf8ec,
  0xcf8ee8,
];
const CENTRE_COLORS = [0xffba2f, 0xffd65a, 0xf08b28, 0x8a5428];
const STEM_COLORS = [0x65a83b, 0x4e9335, 0x79b64b, 0x3f7f38];

export class FlowerField extends Group {
  readonly #placements: readonly PlantPlacement[];
  readonly #stems: InstancedMesh;
  readonly #petals: InstancedMesh;
  readonly #centres: InstancedMesh;
  readonly #matrix = new Matrix4();
  readonly #quaternion = new Quaternion();
  readonly #scale = new Vector3();
  readonly #root = new Vector3();
  readonly #crown = new Vector3();
  readonly #direction = new Vector3();

  constructor(placements: readonly PlantPlacement[]) {
    super();
    this.name = "wind-animated-flowers";
    this.#placements = placements;
    this.#stems = new InstancedMesh(
      new CylinderGeometry(0.035, 0.047, 1, 6, 4),
      new MeshStandardMaterial({
        color: 0x69a83a,
        emissive: 0x1f4815,
        emissiveIntensity: 0.8,
        roughness: 0.86,
      }),
      placements.length,
    );
    this.#petals = new InstancedMesh(
      new SphereGeometry(1, 9, 5),
      new MeshBasicMaterial({
        color: 0xffffff,
      }),
      placements.length * MAX_PETALS_PER_FLOWER,
    );
    this.#centres = new InstancedMesh(
      new SphereGeometry(1, 10, 6),
      new MeshBasicMaterial({
        color: 0xffffff,
      }),
      placements.length,
    );
    this.#stems.castShadow = true;
    this.#petals.castShadow = true;
    this.#centres.castShadow = true;
    this.add(this.#stems, this.#petals, this.#centres);
    placements.forEach((placement, flowerIndex) => {
      const paletteIndex = placement.paletteIndex;
      this.#stems.setColorAt(
        flowerIndex,
        new Color(STEM_COLORS[paletteIndex % STEM_COLORS.length]),
      );
      this.#centres.setColorAt(
        flowerIndex,
        new Color(CENTRE_COLORS[paletteIndex % CENTRE_COLORS.length]),
      );
      for (let petal = 0; petal < MAX_PETALS_PER_FLOWER; petal += 1) {
        const petalColor = new Color(
          PETAL_COLORS[paletteIndex % PETAL_COLORS.length],
        ).offsetHSL(0, 0, petal % 2 === 0 ? 0.025 : -0.018);
        this.#petals.setColorAt(
          flowerIndex * MAX_PETALS_PER_FLOWER + petal,
          petalColor,
        );
      }
    });
    this.#stems.instanceColor!.needsUpdate = true;
    this.#petals.instanceColor!.needsUpdate = true;
    this.#centres.instanceColor!.needsUpdate = true;
    this.update(0);
  }

  update(timeSeconds: number): void {
    this.#placements.forEach((placement, flowerIndex) => {
      const style =
        FLOWER_STYLES[placement.paletteIndex % FLOWER_STYLES.length];
      const height = 0.52 + placement.scale * 0.42;
      const sway = Math.sin(timeSeconds * 1.42 + placement.phase) * 0.18;
      const crossSway =
        Math.sin(timeSeconds * 2.05 + placement.phase * 1.7) * 0.09;
      this.#root.set(placement.x, 0.01, placement.z);
      this.#crown.set(
        placement.x + sway * placement.scale,
        height,
        placement.z + crossSway * placement.scale,
      );
      this.#direction.subVectors(this.#crown, this.#root);
      const stemLength = this.#direction.length();
      this.#quaternion.setFromUnitVectors(UP, this.#direction.normalize());
      this.#scale.set(placement.scale, stemLength, placement.scale);
      this.#matrix.compose(
        this.#root.clone().lerp(this.#crown, 0.5),
        this.#quaternion,
        this.#scale,
      );
      this.#stems.setMatrixAt(flowerIndex, this.#matrix);

      const crownScale = placement.scale * 0.86;
      for (let petal = 0; petal < MAX_PETALS_PER_FLOWER; petal += 1) {
        const instanceIndex = flowerIndex * MAX_PETALS_PER_FLOWER + petal;
        if (petal >= style.petals) {
          this.#quaternion.identity();
          this.#scale.setScalar(0);
          this.#matrix.compose(this.#crown, this.#quaternion, this.#scale);
          this.#petals.setMatrixAt(instanceIndex, this.#matrix);
          continue;
        }
        const angle = placement.rotation + (petal / style.petals) * Math.PI * 2;
        const radius = 0.17 * crownScale;
        const position = new Vector3(
          this.#crown.x + Math.cos(angle) * radius,
          this.#crown.y + 0.025,
          this.#crown.z + Math.sin(angle) * radius,
        );
        this.#quaternion.setFromAxisAngle(UP, -angle);
        this.#scale.set(
          style.width * crownScale,
          style.thickness * crownScale,
          style.length * crownScale,
        );
        this.#matrix.compose(position, this.#quaternion, this.#scale);
        this.#petals.setMatrixAt(instanceIndex, this.#matrix);
      }
      this.#quaternion.identity();
      this.#scale.setScalar(style.centre * crownScale);
      this.#scale.y *= 0.72;
      this.#matrix.compose(
        new Vector3(this.#crown.x, this.#crown.y + 0.065, this.#crown.z),
        this.#quaternion,
        this.#scale,
      );
      this.#centres.setMatrixAt(flowerIndex, this.#matrix);
    });
    this.#stems.instanceMatrix.needsUpdate = true;
    this.#petals.instanceMatrix.needsUpdate = true;
    this.#centres.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.#stems, this.#petals, this.#centres]) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) material.dispose();
    }
  }
}
