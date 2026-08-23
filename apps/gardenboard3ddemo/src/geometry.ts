import { BufferGeometry, Float32BufferAttribute, Matrix4 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function createBladeGeometry(
  width: number,
  height: number,
): BufferGeometry {
  const levels = [0, 0.28, 0.58, 0.82, 1];
  const widths = [0.22, 0.5, 0.42, 0.27, 0];
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let index = 0; index < levels.length; index += 1) {
    const y = levels[index] * height;
    const halfWidth = widths[index] * width;
    positions.push(-halfWidth, y, 0, halfWidth, y, 0);
    uvs.push(0, levels[index], 1, levels[index]);
  }
  const indices: number[] = [];
  for (let index = 0; index < levels.length - 1; index += 1) {
    const left = index * 2;
    indices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createGrassClumpGeometry(
  width: number,
  height: number,
): BufferGeometry {
  const blades = [0, Math.PI / 3, (Math.PI * 2) / 3].map((angle) => {
    const blade = createBladeGeometry(width, height);
    blade.applyMatrix4(new Matrix4().makeRotationY(angle));
    return blade;
  });
  const clump = mergeGeometries(blades, false);
  for (const blade of blades) blade.dispose();
  if (!clump) throw new Error("Unable to merge procedural grass clump.");
  return clump;
}
