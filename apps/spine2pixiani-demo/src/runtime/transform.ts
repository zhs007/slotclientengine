import type { AffineMatrix, WorldTransform } from "./spine-types.js";

const RADIAN_FACTOR = Math.PI / 180;

type TransformLike = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX?: number;
  shearY?: number;
};

export function createIdentityMatrix(): AffineMatrix {
  return {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    tx: 0,
    ty: 0
  };
}

export function createMatrixFromTransform(transform: TransformLike): AffineMatrix {
  const shearXRadians = (transform.rotation + (transform.shearX ?? 0)) * RADIAN_FACTOR;
  const shearYRadians = (transform.rotation + 90 + (transform.shearY ?? 0)) * RADIAN_FACTOR;

  return {
    a: Math.cos(shearXRadians) * transform.scaleX,
    b: Math.sin(shearXRadians) * transform.scaleX,
    c: Math.cos(shearYRadians) * transform.scaleY,
    d: Math.sin(shearYRadians) * transform.scaleY,
    tx: transform.x,
    ty: transform.y
  };
}

export function multiplyAffineMatrices(parent: AffineMatrix, child: AffineMatrix): AffineMatrix {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty
  };
}

export function applyAffineToPoint(matrix: AffineMatrix, point: { x: number; y: number }) {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.tx,
    y: matrix.b * point.x + matrix.d * point.y + matrix.ty
  };
}

export function createSceneMatrix(matrix: AffineMatrix): AffineMatrix {
  return {
    a: matrix.a,
    b: -matrix.b,
    c: -matrix.c,
    d: matrix.d,
    tx: matrix.tx,
    ty: -matrix.ty
  };
}

export function applyWorldTransformToScenePoint(transform: WorldTransform, point: { x: number; y: number }) {
  return applyAffineToPoint(createSceneMatrix(transform.matrix), point);
}

export function deriveWorldTransform(matrix: AffineMatrix): WorldTransform {
  return {
    x: matrix.tx,
    y: matrix.ty,
    rotation: Math.atan2(matrix.b, matrix.a) / RADIAN_FACTOR,
    scaleX: Math.hypot(matrix.a, matrix.b),
    scaleY: Math.sign(matrix.a * matrix.d - matrix.b * matrix.c || 1) * Math.hypot(matrix.c, matrix.d),
    matrix
  };
}

export function composeWorldTransform(transform: TransformLike, parent?: WorldTransform): WorldTransform {
  const localMatrix = createMatrixFromTransform(transform);
  const matrix = parent ? multiplyAffineMatrices(parent.matrix, localMatrix) : localMatrix;

  return deriveWorldTransform(matrix);
}