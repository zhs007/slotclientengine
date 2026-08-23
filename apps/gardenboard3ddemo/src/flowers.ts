import {
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

const PETALS_PER_FLOWER = 8;
const UP = new Vector3(0, 1, 0);

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
        color: 0xffc6d7,
      }),
      placements.length * PETALS_PER_FLOWER,
    );
    this.#centres = new InstancedMesh(
      new SphereGeometry(1, 10, 6),
      new MeshBasicMaterial({
        color: 0xffba2f,
      }),
      placements.length,
    );
    this.#stems.castShadow = true;
    this.#petals.castShadow = true;
    this.#centres.castShadow = true;
    this.add(this.#stems, this.#petals, this.#centres);
    this.update(0);
  }

  update(timeSeconds: number): void {
    this.#placements.forEach((placement, flowerIndex) => {
      const height = 0.52 + placement.scale * 0.42;
      const sway = Math.sin(timeSeconds * 1.18 + placement.phase) * 0.1;
      const crossSway =
        Math.sin(timeSeconds * 1.73 + placement.phase * 1.7) * 0.045;
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
      for (let petal = 0; petal < PETALS_PER_FLOWER; petal += 1) {
        const angle =
          placement.rotation + (petal / PETALS_PER_FLOWER) * Math.PI * 2;
        const radius = 0.17 * crownScale;
        const position = new Vector3(
          this.#crown.x + Math.cos(angle) * radius,
          this.#crown.y + 0.025,
          this.#crown.z + Math.sin(angle) * radius,
        );
        this.#quaternion.setFromAxisAngle(UP, -angle);
        this.#scale.set(
          0.13 * crownScale,
          0.055 * crownScale,
          0.27 * crownScale,
        );
        this.#matrix.compose(position, this.#quaternion, this.#scale);
        this.#petals.setMatrixAt(
          flowerIndex * PETALS_PER_FLOWER + petal,
          this.#matrix,
        );
      }
      this.#quaternion.identity();
      this.#scale.setScalar(0.14 * crownScale);
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
