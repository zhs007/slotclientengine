import {
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
} from "three";

export interface WindMaterialHandle {
  readonly material: MeshStandardMaterial;
  setTime(timeSeconds: number): void;
}

export function createWindMaterial(
  parameters: MeshStandardMaterialParameters,
  amplitude: number,
): WindMaterialHandle {
  const material = new MeshStandardMaterial(parameters);
  const windTime = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.uniforms.uWindAmplitude = { value: amplitude };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uWindTime;
uniform float uWindAmplitude;`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
#ifdef USE_INSTANCING
  vec3 windOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 windOrigin = vec3(0.0);
#endif
float windMask = smoothstep(0.02, 0.86, max(position.y, 0.0));
float windPrimary = sin(uWindTime * 1.35 + windOrigin.x * 1.73 + windOrigin.z * 1.19);
float windDetail = sin(uWindTime * 2.7 + windOrigin.x * 0.61 - windOrigin.z * 2.13) * 0.32;
transformed.x += (windPrimary + windDetail) * uWindAmplitude * windMask * windMask;
transformed.z += cos(uWindTime * 1.08 + windOrigin.z * 1.51) * uWindAmplitude * 0.42 * windMask;`,
      );
  };
  material.customProgramCacheKey = () => `garden-wind-${amplitude}`;
  return {
    material,
    setTime: (timeSeconds) => {
      windTime.value = timeSeconds;
    },
  };
}
