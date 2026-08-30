import {
  AnimationMixer,
  Box3,
  Group,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  Texture,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const modelUrl = new URL(
  "../assets/models/20260829155447_d0c3ff02-rigged.glb",
  import.meta.url,
).href;

export interface PufferfishSymbolPlacement {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly modelSpan: number;
  readonly rotationY: number;
  readonly motionPhase: number;
  readonly idleSpeed: number;
}

interface PufferfishInstance {
  readonly root: Group;
  readonly model: Object3D;
  readonly mixer: AnimationMixer;
  readonly baseY: number;
  readonly motionPhase: number;
}

const pufferCausticVertexPars = /* glsl */ `
varying vec3 vPufferWorldPosition;
`;

const pufferCausticVertexProject = /* glsl */ `
#include <project_vertex>
vPufferWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const pufferCausticFragmentPars = /* glsl */ `
uniform sampler2D uPufferCausticTexture;
uniform float uPufferCausticTime;
uniform float uPufferCausticMix;
varying vec3 vPufferWorldPosition;
`;

const pufferCausticFragment = /* glsl */ `
vec3 pufferBaseColor = diffuseColor.rgb;
float pufferLuminance = dot(
  pufferBaseColor,
  vec3(0.2126, 0.7152, 0.0722)
);
float pufferHighestChannel = max(
  pufferBaseColor.r,
  max(pufferBaseColor.g, pufferBaseColor.b)
);
float pufferLowestChannel = min(
  pufferBaseColor.r,
  min(pufferBaseColor.g, pufferBaseColor.b)
);
float pufferChroma = pufferHighestChannel - pufferLowestChannel;
float pufferEyeWhiteMask = smoothstep(0.68, 0.9, pufferLuminance) *
  (1.0 - smoothstep(0.1, 0.27, pufferChroma));
float pufferDarkFeatureMask = 1.0 - smoothstep(0.045, 0.16, pufferLuminance);
float pufferRedFeatureMask = smoothstep(
  0.08,
  0.3,
  pufferBaseColor.r - max(pufferBaseColor.g, pufferBaseColor.b)
);
float pufferFacialProtection = max(
  pufferEyeWhiteMask,
  max(pufferDarkFeatureMask, pufferRedFeatureMask)
);

vec2 pufferCausticUvA = vPufferWorldPosition.xz * 0.19 +
  vec2(uPufferCausticTime * 0.011, -uPufferCausticTime * 0.006);
vec4 pufferCausticFieldA = texture2D(
  uPufferCausticTexture,
  pufferCausticUvA
);
vec2 pufferCausticFlow = pufferCausticFieldA.ba * 2.0 - 1.0;
vec2 pufferCausticUvB = pufferCausticUvA * 1.43 +
  pufferCausticFlow * 0.026 +
  vec2(-uPufferCausticTime * 0.007, uPufferCausticTime * 0.003);
float pufferCausticDetail = texture2D(
  uPufferCausticTexture,
  pufferCausticUvB
).g;
float pufferCausticRidge = smoothstep(
  0.3,
  0.82,
  max(pufferCausticFieldA.r * 0.76, pufferCausticDetail * 0.68)
);
float pufferUpperFacing = smoothstep(0.08, 0.76, normal.y);
float pufferSkinMask = (1.0 - pufferFacialProtection) * pufferUpperFacing;
float pufferCausticLight = pufferCausticRidge * pufferSkinMask *
  uPufferCausticMix;
outgoingLight += vec3(0.19, 0.58, 0.64) * pufferCausticLight * 0.105;

#include <opaque_fragment>
`;

function replaceRequiredShaderSource(
  source: string,
  search: string,
  replacement: string,
  label: string,
): string {
  if (!source.includes(search)) {
    throw new Error(`Pufferfish caustic shader is missing ${label}`);
  }
  return source.replace(search, replacement);
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value && typeof value === "object" && "isTexture" in value) {
      (value as Texture).dispose();
    }
  }
  material.dispose();
}

function disposeModel(model: Object3D): void {
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) disposeMaterial(material);
  });
}

export class PufferfishActor {
  readonly root = new Group();
  readonly #placements: readonly PufferfishSymbolPlacement[];
  readonly #instances: PufferfishInstance[] = [];
  #lastUpdateTime = 0;
  #loadError: Error | null = null;
  #disposed = false;
  readonly #causticPlaceholder = new Texture();
  readonly #causticUniforms = {
    texture: { value: this.#causticPlaceholder },
    time: { value: 0 },
    mix: { value: 0 },
  };

  constructor(placements: readonly PufferfishSymbolPlacement[]) {
    if (placements.length === 0) {
      throw new Error("Pufferfish symbol row requires placements");
    }
    this.#placements = placements;
    this.root.name = "pufferfish-symbol-row";
    void this.#load();
  }

  update(time: number): void {
    if (this.#loadError) {
      const error = this.#loadError;
      this.#loadError = null;
      throw error;
    }

    const delta = Math.min(0.05, Math.max(0, time - this.#lastUpdateTime));
    this.#lastUpdateTime = time;
    this.#causticUniforms.time.value = time;
    for (const instance of this.#instances) {
      instance.mixer.update(delta);
      instance.root.position.y =
        instance.baseY + Math.sin(time * 0.42 + instance.motionPhase) * 0.025;
      instance.root.rotation.z =
        Math.sin(time * 0.31 + instance.motionPhase + 0.8) * 0.009;
    }
  }

  setSurfaceCausticTexture(texture: Texture): void {
    if (this.#causticUniforms.texture.value === this.#causticPlaceholder) {
      this.#causticPlaceholder.dispose();
    }
    this.#causticUniforms.texture.value = texture;
    this.#causticUniforms.mix.value = 1;
  }

  dispose(): void {
    this.#disposed = true;
    for (const instance of this.#instances) {
      instance.mixer.stopAllAction();
      instance.mixer.uncacheRoot(instance.model);
    }
    this.#instances.length = 0;
    this.#causticUniforms.mix.value = 0;
    if (this.#causticUniforms.texture.value === this.#causticPlaceholder) {
      this.#causticPlaceholder.dispose();
    }
  }

  async #load(): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync(modelUrl);
      if (this.#disposed) {
        disposeModel(gltf.scene);
        return;
      }

      const idle = gltf.animations.find((clip) => clip.name === "idle");
      if (!idle)
        throw new Error("Pufferfish GLB is missing required idle animation");

      const causticMaterials = new Set<Material>();
      for (const placement of this.#placements) {
        const instanceRoot = new Group();
        instanceRoot.name = `pufferfish-symbol-${placement.name}`;
        instanceRoot.position.set(...placement.position);

        const model = cloneSkeleton(gltf.scene);
        model.name = `pufferfish-${placement.name}-idle-model`;
        model.rotation.y = placement.rotationY;
        model.updateMatrixWorld(true);
        const unscaledSize = new Box3()
          .setFromObject(model)
          .getSize(new Vector3());
        const largestDimension = Math.max(
          unscaledSize.x,
          unscaledSize.y,
          unscaledSize.z,
          0.001,
        );
        model.scale.setScalar(placement.modelSpan / largestDimension);
        model.updateMatrixWorld(true);
        const center = new Box3().setFromObject(model).getCenter(new Vector3());
        model.position.sub(center);
        model.updateMatrixWorld(true);
        model.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          object.castShadow = false;
          object.receiveShadow = false;
          object.frustumCulled = false;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) {
            if (causticMaterials.has(material)) continue;
            causticMaterials.add(material);
            this.#addCausticLighting(material);
          }
        });

        instanceRoot.add(model);
        this.root.add(instanceRoot);
        const mixer = new AnimationMixer(model);
        const action = mixer.clipAction(idle);
        action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
        action.time = idle.duration * ((placement.motionPhase / 6.28) % 1);
        action.timeScale = placement.idleSpeed;
        action.play();
        this.#instances.push({
          root: instanceRoot,
          model,
          mixer,
          baseY: placement.position[1],
          motionPhase: placement.motionPhase,
        });
      }
    } catch (error) {
      this.#loadError =
        error instanceof Error
          ? error
          : new Error(`Failed to load pufferfish GLB: ${String(error)}`);
    }
  }

  #addCausticLighting(material: Material): void {
    if (!(material instanceof MeshStandardMaterial)) {
      throw new Error(
        `Pufferfish caustics require MeshStandardMaterial, received ${material.type}`,
      );
    }

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uPufferCausticTexture = this.#causticUniforms.texture;
      shader.uniforms.uPufferCausticTime = this.#causticUniforms.time;
      shader.uniforms.uPufferCausticMix = this.#causticUniforms.mix;
      shader.vertexShader = replaceRequiredShaderSource(
        shader.vertexShader,
        "#include <common>",
        `#include <common>\n${pufferCausticVertexPars}`,
        "vertex common chunk",
      );
      shader.vertexShader = replaceRequiredShaderSource(
        shader.vertexShader,
        "#include <project_vertex>",
        pufferCausticVertexProject,
        "vertex project chunk",
      );
      shader.fragmentShader = replaceRequiredShaderSource(
        shader.fragmentShader,
        "#include <common>",
        `#include <common>\n${pufferCausticFragmentPars}`,
        "fragment common chunk",
      );
      shader.fragmentShader = replaceRequiredShaderSource(
        shader.fragmentShader,
        "#include <opaque_fragment>",
        pufferCausticFragment,
        "fragment opaque chunk",
      );
    };
    material.customProgramCacheKey = () => "pufferfish-surface-caustic-v1";
    material.needsUpdate = true;
  }
}
