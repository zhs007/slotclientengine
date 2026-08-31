import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  type PerspectiveCamera,
} from "three";

const bubbleVertexShader = /* glsl */ `
uniform float uTime;
attribute float aPhase;
attribute float aDepthFade;
varying vec3 vNormalView;
varying vec3 vViewPosition;
varying float vDepthFade;
varying float vPhase;

void main() {
  vec3 transformed = position;
  float middle = 1.0 - abs(position.y);
  float membraneWobble = sin(uTime * 1.18 + aPhase + position.y * 2.7) *
    0.018 * middle;
  transformed.xz *= 1.0 + membraneWobble;

  vec4 instancePosition = instanceMatrix * vec4(transformed, 1.0);
  vec4 viewPosition = modelViewMatrix * instancePosition;
  vNormalView = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vViewPosition = viewPosition.xyz;
  vDepthFade = aDepthFade;
  vPhase = aPhase;
  gl_Position = projectionMatrix * viewPosition;
}
`;

const bubbleFragmentShader = /* glsl */ `
uniform float uTime;
varying vec3 vNormalView;
varying vec3 vViewPosition;
varying float vDepthFade;
varying float vPhase;

void main() {
  vec3 normal = normalize(vNormalView);
  vec3 viewDirection = normalize(-vViewPosition);
  float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float rim = pow(1.0 - facing, 2.65);

  vec3 keyDirection = normalize(vec3(-0.42, 0.76, 0.5));
  vec3 fillDirection = normalize(vec3(0.68, 0.34, 0.62));
  float keyGlint = pow(max(dot(normal, keyDirection), 0.0), 78.0);
  float fillGlint = pow(max(dot(normal, fillDirection), 0.0), 42.0) * 0.32;
  float pulse = 0.94 + sin(uTime * 0.74 + vPhase) * 0.06;

  vec3 rimColor = mix(vec3(0.12, 0.58, 0.72), vec3(0.62, 0.91, 0.95), facing);
  vec3 color = rimColor * (0.72 + rim * 0.48) +
    vec3(0.86, 0.98, 1.0) * (keyGlint + fillGlint);
  float membrane = pow(1.0 - abs(facing - 0.43), 5.0) * 0.018;
  float alpha = (rim * 0.23 + keyGlint * 0.58 + fillGlint * 0.28 + membrane) *
    vDepthFade * pulse;
  gl_FragColor = vec4(color, alpha);
}
`;

interface BubbleState {
  readonly depth: number;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly phase: number;
  readonly radius: number;
  readonly riseSpeed: number;
  readonly sway: number;
  readonly swaySpeed: number;
}

const bubbleStates: readonly BubbleState[] = [
  {
    depth: -4.6,
    normalizedX: -0.66,
    normalizedY: -1.04,
    phase: 0.3,
    radius: 0.18,
    riseSpeed: 0.067,
    sway: 0.035,
    swaySpeed: 0.31,
  },
  {
    depth: -4.2,
    normalizedX: -0.61,
    normalizedY: -0.84,
    phase: 1.7,
    radius: 0.11,
    riseSpeed: 0.081,
    sway: 0.026,
    swaySpeed: 0.39,
  },
  {
    depth: -5.1,
    normalizedX: -0.72,
    normalizedY: -0.67,
    phase: 3.1,
    radius: 0.14,
    riseSpeed: 0.074,
    sway: 0.031,
    swaySpeed: 0.34,
  },
  {
    depth: -3.8,
    normalizedX: -0.59,
    normalizedY: -0.47,
    phase: 4.6,
    radius: 0.08,
    riseSpeed: 0.092,
    sway: 0.021,
    swaySpeed: 0.44,
  },
  {
    depth: -10.8,
    normalizedX: 0.48,
    normalizedY: -0.52,
    phase: 0.9,
    radius: 0.18,
    riseSpeed: 0.052,
    sway: 0.028,
    swaySpeed: 0.27,
  },
  {
    depth: -11.6,
    normalizedX: 0.54,
    normalizedY: -0.34,
    phase: 2.5,
    radius: 0.12,
    riseSpeed: 0.063,
    sway: 0.023,
    swaySpeed: 0.33,
  },
  {
    depth: -10.1,
    normalizedX: 0.43,
    normalizedY: -0.16,
    phase: 5.2,
    radius: 0.09,
    riseSpeed: 0.071,
    sway: 0.018,
    swaySpeed: 0.41,
  },
  {
    depth: -15.4,
    normalizedX: 0.09,
    normalizedY: 0.02,
    phase: 1.2,
    radius: 0.19,
    riseSpeed: 0.044,
    sway: 0.025,
    swaySpeed: 0.24,
  },
  {
    depth: -14.7,
    normalizedX: 0.15,
    normalizedY: 0.19,
    phase: 3.8,
    radius: 0.13,
    riseSpeed: 0.057,
    sway: 0.017,
    swaySpeed: 0.29,
  },
  {
    depth: -15.9,
    normalizedX: 0.04,
    normalizedY: 0.36,
    phase: 5.8,
    radius: 0.09,
    riseSpeed: 0.066,
    sway: 0.015,
    swaySpeed: 0.36,
  },
  {
    depth: 4.8,
    normalizedX: -0.18,
    normalizedY: -1.13,
    phase: 0.6,
    radius: 0.3,
    riseSpeed: 0.086,
    sway: 0.052,
    swaySpeed: 0.38,
  },
  {
    depth: 5.6,
    normalizedX: -0.08,
    normalizedY: -0.93,
    phase: 2.9,
    radius: 0.18,
    riseSpeed: 0.102,
    sway: 0.041,
    swaySpeed: 0.46,
  },
  {
    depth: 3.9,
    normalizedX: -0.25,
    normalizedY: -0.72,
    phase: 4.4,
    radius: 0.12,
    riseSpeed: 0.094,
    sway: 0.033,
    swaySpeed: 0.42,
  },
] as const;

export class BubbleField {
  readonly mesh: InstancedMesh;
  readonly #dummy = new Object3D();
  readonly #material: ShaderMaterial;

  constructor() {
    const geometry = new SphereGeometry(1, 24, 16);
    geometry.setAttribute(
      "aPhase",
      new InstancedBufferAttribute(
        new Float32Array(bubbleStates.map((bubble) => bubble.phase)),
        1,
      ),
    );
    geometry.setAttribute(
      "aDepthFade",
      new InstancedBufferAttribute(
        new Float32Array(
          bubbleStates.map((bubble) =>
            bubble.depth > 0 ? 1 : bubble.depth > -8 ? 0.82 : 0.64,
          ),
        ),
        1,
      ),
    );

    this.#material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: bubbleVertexShader,
      fragmentShader: bubbleFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new InstancedMesh(
      geometry,
      this.#material,
      bubbleStates.length,
    );
    this.mesh.name = "sparse-depth-bubble-clusters";
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
  }

  update(time: number, camera: PerspectiveCamera): void {
    this.#material.uniforms.uTime.value = time;
    const halfFov = (camera.fov * Math.PI) / 360;

    for (let index = 0; index < bubbleStates.length; index += 1) {
      const bubble = bubbleStates[index];
      const distance = camera.position.z - bubble.depth;
      const visibleHeight = 2 * Math.tan(halfFov) * distance;
      const visibleWidth = visibleHeight * camera.aspect;
      const rise = bubble.normalizedY + time * bubble.riseSpeed;
      const lowerLimit = -1.18;
      const upperLimit = 0.52;
      const verticalSpan = upperLimit - lowerLimit;
      const wrappedY =
        ((((rise - lowerLimit) % verticalSpan) + verticalSpan) % verticalSpan) +
        lowerLimit;
      const surfaceFade = Math.max(
        0,
        Math.min(1, 1 - (wrappedY - 0.3) / (upperLimit - 0.3)),
      );
      const driftX =
        bubble.normalizedX +
        Math.sin(time * bubble.swaySpeed + bubble.phase) * bubble.sway;
      const squash = Math.sin(time * 1.06 + bubble.phase) * 0.045;

      this.#dummy.position.set(
        driftX * visibleWidth * 0.5,
        -0.2 + wrappedY * visibleHeight * 0.5,
        bubble.depth,
      );
      this.#dummy.rotation.set(0, time * 0.08 + bubble.phase, 0);
      this.#dummy.scale.set(
        bubble.radius * (1 + squash) * surfaceFade,
        bubble.radius * (1 - squash) * surfaceFade,
        bubble.radius * (1 + squash * 0.35) * surfaceFade,
      );
      this.#dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.#dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
