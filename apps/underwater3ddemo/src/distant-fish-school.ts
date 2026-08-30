import {
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
} from "three";

const fishSchoolVertexShader = /* glsl */ `
uniform float uTime;
attribute float aDirection;
attribute float aOpacity;
attribute float aPhase;
attribute float aSpeed;
attribute float aTravelPhase;
attribute float aLayer;
varying float vDirection;
varying float vOpacity;
varying float vPhase;
varying float vLayer;
varying vec2 vUv;
#include <fog_pars_vertex>

void main() {
  vUv = uv;
  vDirection = aDirection;
  vOpacity = aOpacity;
  vPhase = aPhase;
  vLayer = aLayer;

  vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
  float travel = mod(uTime * aSpeed + aTravelPhase, 22.0) - 11.0;
  worldPosition.x += travel * aDirection;
  worldPosition.y += sin(uTime * 0.12 + aPhase) * 0.07;
  vec4 mvPosition = modelViewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fishSchoolFragmentShader = /* glsl */ `
uniform float uTime;
varying float vDirection;
varying float vOpacity;
varying float vPhase;
varying float vLayer;
varying vec2 vUv;
#include <fog_pars_fragment>

void main() {
  vec2 point = (vUv - 0.5) * 2.0;
  point.x *= vDirection;

  float bodyDistance = length((point - vec2(0.08, 0.0)) / vec2(0.7, 0.52)) - 1.0;
  float bodyMask = 1.0 - smoothstep(-0.025, 0.035, bodyDistance);

  float tailRange = step(-0.98, point.x) * step(point.x, -0.43);
  float tailHalfHeight = mix(
    0.42,
    0.015,
    smoothstep(-0.98, -0.43, point.x)
  );
  float tailWave = sin(uTime * 1.18 + vPhase) * 0.075 *
    (1.0 - smoothstep(-0.98, -0.43, point.x));
  float tailMask = tailRange *
    (1.0 - smoothstep(
      tailHalfHeight - 0.025,
      tailHalfHeight + 0.035,
      abs(point.y - tailWave)
    ));

  float silhouette = max(bodyMask, tailMask);
  if (silhouette < 0.003) discard;

  vec3 farColor = vec3(0.018, 0.13, 0.21);
  vec3 nearColor = vec3(0.008, 0.085, 0.16);
  vec3 color = mix(farColor, nearColor, vLayer);
  float pulse = 0.9 + sin(uTime * 0.17 + vPhase) * 0.1;
  gl_FragColor = vec4(color, silhouette * vOpacity * pulse);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

interface DistantFishState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly direction: 1 | -1;
  readonly opacity: number;
  readonly phase: number;
  readonly speed: number;
  readonly travelPhase: number;
  readonly layer: 0 | 1;
}

const farSchoolLayout = [
  [-2.2, 0.15, 0.38],
  [-1.45, -0.18, 0.31],
  [-0.8, 0.3, 0.34],
  [-0.15, -0.05, 0.3],
  [0.55, 0.2, 0.36],
  [1.15, -0.25, 0.28],
  [1.75, 0.08, 0.32],
  [2.35, 0.33, 0.27],
] as const;

const nearSchoolLayout = [
  [-2.45, 0.12, 0.55],
  [-1.55, 0.45, 0.46],
  [-0.75, -0.15, 0.5],
  [0.05, 0.23, 0.43],
  [0.82, -0.28, 0.47],
  [1.6, 0.1, 0.4],
  [2.3, 0.38, 0.44],
] as const;

const fishStates: readonly DistantFishState[] = [
  ...farSchoolLayout.map(([x, y, scale], index) => ({
    x,
    y: y + 5.75,
    z: -18,
    scale,
    direction: 1 as const,
    opacity: 0.12,
    phase: index * 0.83 + 0.4,
    speed: 0.65,
    travelPhase: 6,
    layer: 0 as const,
  })),
  ...nearSchoolLayout.map(([x, y, scale], index) => ({
    x,
    y: y + 3.55,
    z: -13.5,
    scale,
    direction: -1 as const,
    opacity: 0.17,
    phase: index * 0.91 + 2.1,
    speed: 0.55,
    travelPhase: 6,
    layer: 1 as const,
  })),
];

export class DistantFishSchool {
  readonly mesh: InstancedMesh;
  readonly #material: ShaderMaterial;

  constructor() {
    const geometry = new PlaneGeometry(2, 1);
    const attribute = (values: readonly number[]) =>
      new InstancedBufferAttribute(new Float32Array(values), 1);
    geometry.setAttribute(
      "aDirection",
      attribute(fishStates.map((fish) => fish.direction)),
    );
    geometry.setAttribute(
      "aOpacity",
      attribute(fishStates.map((fish) => fish.opacity)),
    );
    geometry.setAttribute(
      "aPhase",
      attribute(fishStates.map((fish) => fish.phase)),
    );
    geometry.setAttribute(
      "aSpeed",
      attribute(fishStates.map((fish) => fish.speed)),
    );
    geometry.setAttribute(
      "aTravelPhase",
      attribute(fishStates.map((fish) => fish.travelPhase)),
    );
    geometry.setAttribute(
      "aLayer",
      attribute(fishStates.map((fish) => fish.layer)),
    );

    this.#material = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }]),
      vertexShader: fishSchoolVertexShader,
      fragmentShader: fishSchoolFragmentShader,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.mesh = new InstancedMesh(geometry, this.#material, fishStates.length);
    this.mesh.name = "procedural-distant-fish-schools";
    this.mesh.position.z = -15.5;
    this.mesh.frustumCulled = false;

    const dummy = new Object3D();
    for (let index = 0; index < fishStates.length; index += 1) {
      const fish = fishStates[index];
      dummy.position.set(fish.x, fish.y, fish.z - this.mesh.position.z);
      dummy.scale.setScalar(fish.scale);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(index, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(time: number): void {
    this.#material.uniforms.uTime.value = time;
  }
}
