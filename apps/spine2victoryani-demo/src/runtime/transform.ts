import type { AffineMatrix, BonePose, WorldTransform } from "./spine-types.js";

const RADIAN_FACTOR = Math.PI / 180;

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

export function createMatrixFromTransform(transform: BonePose): AffineMatrix {
  const radians = transform.rotation * RADIAN_FACTOR;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    a: cos * transform.scaleX,
    b: sin * transform.scaleX,
    c: -sin * transform.scaleY,
    d: cos * transform.scaleY,
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

export function composeWorldTransform(transform: BonePose, parent?: WorldTransform): WorldTransform {
  const localMatrix = createMatrixFromTransform(transform);
  const matrix = parent ? multiplyAffineMatrices(parent.matrix, localMatrix) : localMatrix;

  return deriveWorldTransform(matrix);
}