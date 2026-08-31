import {
  DoubleSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";

const sunDirection = new Vector3(0.04, -0.38, -0.92).normalize();

const surfaceVertexShader = /* glsl */ `
uniform float uTime;
varying vec2 vSurfacePoint;
varying vec3 vSurfaceWorldPosition;
varying vec3 vSurfaceWorldNormal;
varying float vWaveHeight;

void accumulateWave(
  vec2 point,
  vec2 direction,
  float amplitude,
  float frequency,
  float speed,
  inout float height,
  inout vec2 slope
) {
  vec2 waveDirection = normalize(direction);
  float phase = dot(point, waveDirection) * frequency + uTime * speed;
  height += sin(phase) * amplitude;
  slope += waveDirection * cos(phase) * amplitude * frequency;
}

void main() {
  vSurfacePoint = position.xy;
  float height = 0.0;
  vec2 slope = vec2(0.0);
  accumulateWave(position.xy, vec2(1.0, 0.28), 0.22, 0.28, 0.54, height, slope);
  accumulateWave(position.xy, vec2(-0.34, 1.0), 0.12, 0.55, 0.72, height, slope);
  accumulateWave(position.xy, vec2(0.72, 0.69), 0.065, 1.05, 0.94, height, slope);
  accumulateWave(position.xy, vec2(-0.9, 0.43), 0.03, 1.9, 1.24, height, slope);

  vec3 displaced = vec3(position.xy, position.z + height);
  vec3 localNormal = normalize(vec3(-slope.x, -slope.y, 1.0));
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vSurfaceWorldPosition = worldPosition.xyz;
  vSurfaceWorldNormal = normalize(mat3(modelMatrix) * localNormal);
  vWaveHeight = height;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const surfaceFragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDirection;
varying vec2 vSurfacePoint;
varying vec3 vSurfaceWorldPosition;
varying vec3 vSurfaceWorldNormal;
varying float vWaveHeight;

void main() {
  vec2 point = vSurfaceWorldPosition.xz;
  vec2 domainWarp = vec2(
    sin(dot(point, vec2(0.18, 0.27)) + uTime * 0.31),
    cos(dot(point, vec2(-0.24, 0.15)) - uTime * 0.26)
  ) * 0.28;
  vec2 warpedPoint = point + domainWarp;
  vec2 detailSlope = vec2(0.0);
  detailSlope += normalize(vec2(0.93, 0.37)) *
    cos(dot(warpedPoint, normalize(vec2(0.93, 0.37))) * 2.8 + uTime * 1.35) * 0.045;
  detailSlope += normalize(vec2(-0.42, 0.91)) *
    cos(dot(warpedPoint, normalize(vec2(-0.42, 0.91))) * 4.9 - uTime * 1.72) * 0.028;
  detailSlope += normalize(vec2(0.65, 0.76)) *
    cos(dot(warpedPoint, normalize(vec2(0.65, 0.76))) * 8.1 + uTime * 2.08) * 0.014;

  vec3 upwardNormal = normalize(
    vSurfaceWorldNormal + vec3(detailSlope.x, 0.0, detailSlope.y)
  );
  vec3 viewDirection = normalize(cameraPosition - vSurfaceWorldPosition);
  float viewFacing = abs(dot(upwardNormal, viewDirection));
  float fresnel = 0.08 + 0.92 * pow(1.0 - viewFacing, 3.0);
  vec3 transmittedDirection = reflect(-viewDirection, upwardNormal);
  float sunAlignment = max(dot(transmittedDirection, uSunDirection), 0.0);
  float broadGlint = pow(sunAlignment, 12.0);
  float sunPath = exp(-pow(abs(vSurfaceWorldPosition.x) / 1.9, 1.75));
  float crest = smoothstep(0.11, 0.31, vWaveHeight);

  vec3 waterColor = mix(
    vec3(0.055, 0.41, 0.58),
    vec3(0.16, 0.63, 0.74),
    fresnel
  );
  waterColor += vec3(0.12, 0.4, 0.48) * crest * 0.22;
  waterColor += vec3(1.0, 0.98, 0.9) * sunPath * broadGlint * 0.82;

  float farEdgeFade = 1.0 - smoothstep(5.3, 8.2, vSurfacePoint.y);
  gl_FragColor = vec4(waterColor, farEdgeFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class UnderwaterSurface {
  readonly mesh: Mesh;
  readonly #material: ShaderMaterial;

  constructor() {
    this.#material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
      },
      vertexShader: surfaceVertexShader,
      fragmentShader: surfaceFragmentShader,
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(52, 18, 80, 36), this.#material);
    this.mesh.name = "underwater-viewed-surface";
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0, 9.1, 3);
    this.mesh.frustumCulled = false;
  }

  update(time: number): void {
    this.#material.uniforms.uTime.value = time;
  }
}
