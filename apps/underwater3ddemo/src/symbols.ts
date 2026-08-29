import {
  Color,
  ConeGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  MeshToonMaterial,
  Object3D,
  SphereGeometry,
} from "three";
import { createSymbolPlacements, type SymbolPlacement } from "./layout.js";

const symbolPalette = [
  0xff8a22, 0x2f7eff, 0xffdc2d, 0x78d62f, 0xa94fe8, 0xff4e86, 0x55d6c5,
] as const;

function toon(color: number): MeshToonMaterial {
  return new MeshToonMaterial({ color });
}

export class SymbolField extends Object3D {
  readonly #placements: SymbolPlacement[];
  readonly #body: InstancedMesh;
  readonly #tail: InstancedMesh;
  readonly #topFin: InstancedMesh;
  readonly #eye: InstancedMesh;
  readonly #pupil: InstancedMesh;
  readonly #dummy = new Object3D();

  constructor(seed: number) {
    super();
    this.name = "instanced-fish-symbol-grid";
    this.#placements = createSymbolPlacements(seed);
    const count = this.#placements.length;
    this.#body = new InstancedMesh(
      new SphereGeometry(0.55, 18, 12),
      toon(0xffffff),
      count,
    );
    this.#tail = new InstancedMesh(
      new ConeGeometry(0.38, 0.68, 3, 1),
      toon(0xffffff),
      count,
    );
    this.#topFin = new InstancedMesh(
      new ConeGeometry(0.22, 0.48, 3, 1),
      toon(0xffffff),
      count,
    );
    this.#eye = new InstancedMesh(
      new SphereGeometry(0.115, 12, 8),
      new MeshStandardMaterial({ color: 0xf5ffff, roughness: 0.28 }),
      count,
    );
    this.#pupil = new InstancedMesh(
      new SphereGeometry(0.052, 10, 8),
      new MeshStandardMaterial({
        color: 0x07192c,
        roughness: 0.15,
        emissive: 0x04101c,
        emissiveIntensity: 0.25,
      }),
      count,
    );
    for (const mesh of [
      this.#body,
      this.#tail,
      this.#topFin,
      this.#eye,
      this.#pupil,
    ]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
    this.add(this.#body, this.#tail, this.#topFin, this.#eye, this.#pupil);
    this.#applyColors();
    this.update(0);
  }

  update(time: number): void {
    for (let index = 0; index < this.#placements.length; index += 1) {
      const placement = this.#placements[index];
      const bob = Math.sin(time * 1.25 + placement.phase) * 0.055;
      const sway = Math.sin(time * 0.82 + placement.phase * 1.7) * 0.055;
      const scale = placement.scale;
      this.#setPart(
        this.#body,
        index,
        placement.x,
        placement.y + bob,
        placement.z,
        0,
        0,
        sway,
        0.82 * scale,
        0.6 * scale,
        0.46 * scale,
      );
      this.#setPart(
        this.#tail,
        index,
        placement.x - 0.68 * scale,
        placement.y + bob - 0.01,
        placement.z,
        0,
        0,
        Math.PI / 2 + sway * 1.8,
        0.72 * scale,
        0.76 * scale,
        0.52 * scale,
      );
      this.#setPart(
        this.#topFin,
        index,
        placement.x - 0.06,
        placement.y + bob + 0.45 * scale,
        placement.z - 0.02,
        0,
        0,
        Math.PI + sway,
        0.7 * scale,
        0.7 * scale,
        0.48 * scale,
      );
      this.#setPart(
        this.#eye,
        index,
        placement.x + 0.42 * scale,
        placement.y + bob + 0.14 * scale,
        placement.z + 0.39 * scale,
        0,
        0,
        sway,
        scale,
        scale,
        0.55 * scale,
      );
      this.#setPart(
        this.#pupil,
        index,
        placement.x + 0.45 * scale,
        placement.y + bob + 0.14 * scale,
        placement.z + 0.48 * scale,
        0,
        0,
        sway,
        scale,
        scale,
        0.5 * scale,
      );
    }
    for (const mesh of [
      this.#body,
      this.#tail,
      this.#topFin,
      this.#eye,
      this.#pupil,
    ]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of [
      this.#body,
      this.#tail,
      this.#topFin,
      this.#eye,
      this.#pupil,
    ]) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        for (const material of mesh.material) material.dispose();
      } else {
        mesh.material.dispose();
      }
    }
  }

  #applyColors(): void {
    const color = new Color();
    for (let index = 0; index < this.#placements.length; index += 1) {
      const paletteColor = symbolPalette[this.#placements[index].paletteIndex];
      color.setHex(paletteColor);
      this.#body.setColorAt(index, color);
      this.#tail.setColorAt(index, color.clone().offsetHSL(0.015, 0.03, -0.08));
      this.#topFin.setColorAt(
        index,
        color.clone().offsetHSL(-0.012, 0.05, -0.04),
      );
    }
    if (this.#body.instanceColor) this.#body.instanceColor.needsUpdate = true;
    if (this.#tail.instanceColor) this.#tail.instanceColor.needsUpdate = true;
    if (this.#topFin.instanceColor)
      this.#topFin.instanceColor.needsUpdate = true;
  }

  #setPart(
    mesh: InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    rotationX: number,
    rotationY: number,
    rotationZ: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
  ): void {
    this.#dummy.position.set(x, y, z);
    this.#dummy.rotation.set(rotationX, rotationY, rotationZ);
    this.#dummy.scale.set(scaleX, scaleY, scaleZ);
    this.#dummy.updateMatrix();
    mesh.setMatrixAt(index, this.#dummy.matrix);
  }
}
