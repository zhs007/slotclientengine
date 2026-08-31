import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { BubbleField } from "./bubble-field.js";
import { DistantFishSchool } from "./distant-fish-school.js";
import {
  PufferfishActor,
  type PufferfishSymbolPlacement,
} from "./pufferfish-actor.js";
import { UnderwaterPass } from "./underwater-pass.js";
import { UnderwaterSurface } from "./underwater-surface.js";

const densityFlowTextureUrl = new URL(
  "../assets/textures/water-density-flow.ktx2",
  import.meta.url,
).href;
const surfaceCausticTextureUrl = new URL(
  "../assets/textures/surface-caustic-field.ktx2",
  import.meta.url,
).href;
const surfaceLightShaftTextureUrls = [
  new URL("../assets/textures/surface-light-shafts-main.ktx2", import.meta.url)
    .href,
] as const;

const pufferfishRowPlacements = [
  {
    name: "one",
    position: [-5.2, -0.2, -2.2],
    modelSpan: 4.05,
    rotationY: -0.44,
    motionPhase: 0.3,
    idleSpeed: 0.66,
  },
  {
    name: "two",
    position: [-2.6, -0.2, -2.2],
    modelSpan: 4.05,
    rotationY: -0.44,
    motionPhase: 1.45,
    idleSpeed: 0.72,
  },
  {
    name: "three",
    position: [0, -0.2, -2.2],
    modelSpan: 4.05,
    rotationY: -0.44,
    motionPhase: 2.65,
    idleSpeed: 0.69,
  },
  {
    name: "four",
    position: [2.6, -0.2, -2.2],
    modelSpan: 4.05,
    rotationY: -0.44,
    motionPhase: 3.95,
    idleSpeed: 0.74,
  },
  {
    name: "five",
    position: [5.2, -0.2, -2.2],
    modelSpan: 4.05,
    rotationY: -0.44,
    motionPhase: 5.1,
    idleSpeed: 0.7,
  },
] as const satisfies readonly PufferfishSymbolPlacement[];

function createNeutralTexture(name: string): Texture {
  const texture = new DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1);
  texture.name = name;
  texture.needsUpdate = true;
  return texture;
}

function createBlackTexture(name: string): Texture {
  const texture = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  texture.name = name;
  texture.needsUpdate = true;
  return texture;
}

const waterVolumeVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const waterVolumeFragmentShader = /* glsl */ `
uniform float uTime;
varying vec2 vUv;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

void main() {
  vec3 deepWater = vec3(0.004, 0.055, 0.14);
  vec3 midWater = vec3(0.006, 0.235, 0.46);
  vec3 shallowWater = vec3(0.035, 0.52, 0.72);

  float depth = smoothstep(0.02, 0.74, vUv.y);
  vec3 color = mix(deepWater, midWater, depth);
  color = mix(color, shallowWater, smoothstep(0.72, 1.0, vUv.y));

  float broadHaze = sin(vUv.y * 4.2 + sin(vUv.x * 2.4 + uTime * 0.11));
  float currentA = sin(vUv.x * 5.2 + vUv.y * 2.1 + uTime * 0.18);
  float currentB = sin(vUv.x * -2.8 + vUv.y * 6.1 - uTime * 0.12);
  float currentMask = smoothstep(0.04, 0.22, vUv.y) *
    (1.0 - smoothstep(0.86, 1.0, vUv.y));
  float current = (currentA + currentB) * 0.5 * currentMask;
  color += vec3(0.008, 0.035, 0.052) * broadHaze;
  color += vec3(0.012, 0.045, 0.058) * current;

  float grain = hash21(vUv * vec2(720.0, 1080.0)) - 0.5;
  color += grain * 0.009;
  gl_FragColor = vec4(color, 1.0);
}
`;

const depthHazeVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const depthHazeFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uPhase;
uniform float uDensity;
uniform float uTextureMix;
uniform vec3 uColor;
uniform sampler2D uDensityFlow;
varying vec2 vUv;

float hash21(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

void main() {
  vec2 drift = vec2(uTime * 0.024, -uTime * 0.014);
  vec2 point = vUv * vec2(2.6, 3.4) + drift + uPhase;
  float proceduralHaze = valueNoise(point) * 0.62 + valueNoise(point * 2.15 - drift) * 0.38;
  proceduralHaze = smoothstep(0.26, 0.84, proceduralHaze);
  vec2 fieldUv = vUv * vec2(0.78, 1.08) + vec2(uPhase * 0.071) + drift * 0.32;
  vec4 densityFlow = texture2D(uDensityFlow, fieldUv);
  vec2 flow = densityFlow.ba * 2.0 - 1.0;
  float detail = texture2D(
    uDensityFlow,
    fieldUv * 1.83 + flow * 0.075 - drift * 0.41
  ).g;
  float mappedDensity = densityFlow.r * 0.7 + detail * 0.3;
  float mappedHaze = 0.46 + (mappedDensity - 0.5) * 0.42;
  float haze = mix(proceduralHaze, mappedHaze, uTextureMix);
  float edgeFade = smoothstep(0.0, 0.15, vUv.x) *
    smoothstep(0.0, 0.15, 1.0 - vUv.x) *
    smoothstep(0.0, 0.12, vUv.y) *
    smoothstep(0.0, 0.12, 1.0 - vUv.y);
  gl_FragColor = vec4(uColor, haze * edgeFade * uDensity);
}
`;

const ambientLightFieldFragmentShader = /* glsl */ `
uniform float uTime;
varying vec2 vUv;

float hash21(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 center = vec2(
    0.5 + sin(uTime * 0.09) * 0.035,
    0.73 + cos(uTime * 0.072) * 0.018
  );
  vec2 delta = (vUv - center) * vec2(0.68, 1.0);
  float field = exp(-3.8 * dot(delta, delta));
  float variation = hash21(floor(vUv * vec2(24.0, 32.0)) + floor(uTime * 0.4));
  float edgeFade = smoothstep(0.0, 0.18, vUv.x) *
    smoothstep(0.0, 0.18, 1.0 - vUv.x) *
    smoothstep(0.0, 0.14, vUv.y) *
    smoothstep(0.0, 0.14, 1.0 - vUv.y);
  float alpha = field * edgeFade * (0.055 + variation * 0.008);
  gl_FragColor = vec4(vec3(0.17, 0.58, 0.7), alpha);
}
`;

const primaryVolumeLightVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const primaryVolumeLightFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform sampler2D uPrimaryShaftMap;
varying vec2 vUv;

float sampleShaftLayer(vec2 uv, float rotation, float scale) {
  vec2 pivot = vec2(0.5, 0.025);
  vec2 localUv = (uv - pivot) / scale;
  float sine = sin(rotation);
  float cosine = cos(rotation);
  localUv = mat2(cosine, -sine, sine, cosine) * localUv;
  vec2 layerUv = clamp(localUv + pivot, vec2(0.002), vec2(0.998));
  return texture2D(uPrimaryShaftMap, layerUv).r;
}

void main() {
  float depth = 1.0 - vUv.y;
  vec2 shaftUv = vec2(vUv.x, clamp((depth - 0.025) / 0.62, 0.0, 1.0));
  float layerARotation = sin(uTime * 0.22) * 0.055;
  float layerAScale = 1.025 + sin(uTime * 0.16 + 0.7) * 0.018;
  float shaftBase = pow(sampleShaftLayer(shaftUv, 0.0, 1.0), 1.12);
  float shaftLayerA = pow(
    sampleShaftLayer(shaftUv, layerARotation, layerAScale),
    1.26
  );
  float shaftLight = clamp(
    shaftBase * 0.64 + shaftLayerA * 0.34,
    0.0,
    0.98
  );

  float edgeFade = smoothstep(0.02, 0.17, vUv.x) *
    smoothstep(0.02, 0.17, 1.0 - vUv.x);
  float verticalFade = smoothstep(0.005, 0.055, depth) *
    (1.0 - smoothstep(0.42, 0.64, depth));
  float opacityPulse = 0.985 + sin(uTime * 0.22) * 0.015;
  float overexposedCore = pow(smoothstep(0.52, 0.94, shaftLight), 1.36) *
    (1.0 - smoothstep(0.25, 0.5, depth));
  float surfaceHotspot = pow(smoothstep(0.72, 0.98, shaftLight), 1.18) *
    (1.0 - smoothstep(0.08, 0.26, depth));
  float lightEnergy = shaftLight * 1.02 + overexposedCore * 0.86 +
    surfaceHotspot;
  float alpha = lightEnergy * verticalFade * edgeFade * uOpacity *
    opacityPulse;
  vec3 color = mix(
    vec3(0.14, 0.54, 0.68),
    vec3(1.0, 0.95, 0.82),
    pow(1.0 - depth, 0.72)
  );
  color *= 1.04 + overexposedCore * 0.9 + surfaceHotspot * 1.3;
  gl_FragColor = vec4(color, alpha);
}
`;

interface DepthHazeLayer {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  readonly baseX: number;
  readonly baseY: number;
  readonly phase: number;
  readonly drift: number;
}

export class UnderwaterRenderer {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(49, 1, 0.1, 100);
  readonly #root = new Group();
  readonly #drawingBufferSize = new Vector2();
  readonly #underwaterPass = new UnderwaterPass();
  readonly #underwaterSurface = new UnderwaterSurface();
  readonly #surfaceKeyLight = new DirectionalLight(0xc8ffff, 0.58);
  readonly #animatedMaterials: ShaderMaterial[] = [];
  readonly #depthHazeLayers: DepthHazeLayer[] = [];
  readonly #bubbleField = new BubbleField();
  readonly #distantFishSchool = new DistantFishSchool();
  readonly #pufferfish = new PufferfishActor(pufferfishRowPlacements);
  readonly #ktx2Loader: KTX2Loader;
  #densityFlowTexture = createNeutralTexture("density-flow-placeholder");
  #surfaceCausticTexture = createNeutralTexture("surface-caustic-placeholder");
  #surfaceLightShaftTextures = surfaceLightShaftTextureUrls.map((_, index) =>
    createBlackTexture(`surface-light-shafts-placeholder-${index}`),
  );
  #densityFlowReady = false;
  #surfaceCausticReady = false;
  #textureLoadError: Error | null = null;
  #destroyed = false;

  constructor(host: HTMLElement) {
    this.#renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.#renderer.domElement.className = "underwater-canvas";
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.08;
    this.#renderer.setClearColor(0x021331, 1);
    host.prepend(this.#renderer.domElement);

    this.#ktx2Loader = new KTX2Loader().detectSupport(this.#renderer);
    this.#loadDensityFlowTexture();
    this.#loadSurfaceCausticTexture();
    this.#loadSurfaceLightShaftTextures();

    this.#scene.background = new Color(0x021331);
    this.#scene.fog = new FogExp2(0x052a4d, 0.032);
    this.#scene.add(this.#root);
    this.#createModelLighting();
    this.#createWaterVolume();
    this.#root.add(this.#underwaterSurface.mesh);
    this.#createAmbientLightField();
    this.#createPrimaryVolumeLight();
    this.#createDepthHaze();
    this.#root.add(this.#distantFishSchool.mesh);
    this.#root.add(this.#pufferfish.root);
    this.#bubbleField.mesh.renderOrder = 20;
    this.#root.add(this.#bubbleField.mesh);

    this.#camera.position.set(0, -0.45, 18.8);
    this.#camera.lookAt(0, 0.65, -5.2);
    this.resize(host.clientWidth, host.clientHeight);
    this.#renderer.setAnimationLoop(this.#renderFrame);
  }

  resize(width: number, height: number): void {
    if (this.#destroyed) return;
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    const aspect = safeWidth / safeHeight;
    this.#camera.aspect = aspect;
    this.#camera.fov = aspect < 0.72 ? 49 : aspect < 1.1 ? 45 : 39;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.55));
    this.#renderer.setSize(safeWidth, safeHeight, false);
    this.#renderer.getDrawingBufferSize(this.#drawingBufferSize);
    this.#underwaterPass.setSize(
      this.#drawingBufferSize.x,
      this.#drawingBufferSize.y,
    );
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#renderer.setAnimationLoop(null);

    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    this.#pufferfish.dispose();
    this.#root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of objectMaterials) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
      }
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
    this.#densityFlowTexture.dispose();
    this.#surfaceCausticTexture.dispose();
    for (const texture of this.#surfaceLightShaftTextures) texture.dispose();
    this.#ktx2Loader.dispose();
    this.#underwaterPass.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  readonly #renderFrame = (timeMilliseconds: number): void => {
    if (this.#destroyed) return;
    if (this.#textureLoadError) throw this.#textureLoadError;
    const time = timeMilliseconds / 1000;
    for (const material of this.#animatedMaterials) {
      material.uniforms.uTime.value = time;
      if (material.uniforms.uTextureMix) {
        material.uniforms.uTextureMix.value = this.#densityFlowReady ? 1 : 0;
      }
      if (material.uniforms.uSurfaceMix) {
        material.uniforms.uSurfaceMix.value = this.#surfaceCausticReady ? 1 : 0;
      }
    }

    for (const layer of this.#depthHazeLayers) {
      layer.mesh.position.x =
        layer.baseX + Math.sin(time * layer.drift + layer.phase) * 0.16;
      layer.mesh.position.y =
        layer.baseY + Math.cos(time * layer.drift * 0.73 + layer.phase) * 0.1;
    }
    this.#underwaterSurface.update(time);
    this.#surfaceKeyLight.intensity = 0.56 + Math.sin(time * 0.105) * 0.035;
    this.#distantFishSchool.update(time);
    this.#pufferfish.update(time);
    this.#bubbleField.update(time, this.#camera);

    this.#underwaterPass.render(
      this.#renderer,
      this.#scene,
      this.#camera,
      time,
    );
  };

  #createWaterVolume(): void {
    const material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: waterVolumeVertexShader,
      fragmentShader: waterVolumeFragmentShader,
      depthWrite: false,
      fog: false,
    });
    this.#animatedMaterials.push(material);
    const volume = new Mesh(new PlaneGeometry(72, 38), material);
    volume.name = "water-volume-gradient";
    volume.position.set(0, 0.7, -24);
    this.#root.add(volume);
  }

  #createModelLighting(): void {
    const waterFill = new HemisphereLight(0xa9ecf2, 0x03152d, 1.3);
    waterFill.name = "underwater-model-fill";
    this.#scene.add(waterFill);

    const keyLight = new DirectionalLight(0xd6ffff, 2.35);
    keyLight.name = "underwater-model-key";
    keyLight.position.set(-4.5, 7.5, 6);
    this.#scene.add(keyLight);

    const rimLight = new DirectionalLight(0x29bde0, 1.45);
    rimLight.name = "underwater-model-rim";
    rimLight.position.set(5, 1.8, -5);
    this.#scene.add(rimLight);

    this.#surfaceKeyLight.name = "surface-shaft-model-light";
    this.#surfaceKeyLight.position.set(0.8, 9, 3.5);
    this.#scene.add(this.#surfaceKeyLight);
  }

  #createDepthHaze(): void {
    const geometry = new PlaneGeometry(1, 1);
    const layers = [
      {
        name: "far",
        z: -18.5,
        width: 66,
        height: 36,
        density: 0.065,
        color: 0x063656,
        phase: 0.7,
        drift: 0.09,
      },
      {
        name: "middle",
        z: -10,
        width: 48,
        height: 28,
        density: 0.042,
        color: 0x0b6073,
        phase: 2.3,
        drift: 0.125,
      },
      {
        name: "near",
        z: -2,
        width: 34,
        height: 21,
        density: 0.022,
        color: 0x158493,
        phase: 4.8,
        drift: 0.16,
      },
    ] as const;

    for (const layer of layers) {
      const material = new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: layer.phase },
          uDensity: { value: layer.density },
          uColor: { value: new Color(layer.color) },
          uTextureMix: { value: 0 },
          uDensityFlow: { value: this.#densityFlowTexture },
        },
        vertexShader: depthHazeVertexShader,
        fragmentShader: depthHazeFragmentShader,
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      const mesh = new Mesh(geometry, material);
      mesh.name = `water-depth-haze-${layer.name}`;
      mesh.position.set(0, 0.25, layer.z);
      mesh.scale.set(layer.width, layer.height, 1);
      this.#animatedMaterials.push(material);
      this.#depthHazeLayers.push({
        mesh,
        material,
        baseX: mesh.position.x,
        baseY: mesh.position.y,
        phase: layer.phase,
        drift: layer.drift,
      });
      this.#root.add(mesh);
    }
  }

  #createAmbientLightField(): void {
    const material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: depthHazeVertexShader,
      fragmentShader: ambientLightFieldFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    const field = new Mesh(new PlaneGeometry(58, 34), material);
    field.name = "broad-underwater-ambient-light";
    field.position.set(0, 0.55, -15.5);
    this.#animatedMaterials.push(material);
    this.#root.add(field);
  }

  #createPrimaryVolumeLight(): void {
    const material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.66 },
        uPrimaryShaftMap: { value: this.#surfaceLightShaftTextures[0] },
      },
      vertexShader: primaryVolumeLightVertexShader,
      fragmentShader: primaryVolumeLightFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    const light = new Mesh(new PlaneGeometry(46, 29), material);
    light.name = "surface-lightmap-volume";
    light.position.set(0, -0.15, -8.1);
    this.#animatedMaterials.push(material);
    this.#root.add(light);
  }

  #loadDensityFlowTexture(): void {
    this.#ktx2Loader.load(
      densityFlowTextureUrl,
      (texture) => {
        if (this.#destroyed) {
          texture.dispose();
          return;
        }
        const placeholder = this.#densityFlowTexture;
        this.#configureDataTexture(texture, "water-density-flow-data");
        this.#densityFlowTexture = texture;
        this.#replaceTextureUniform("uDensityFlow", texture);
        placeholder.dispose();
        this.#densityFlowReady = true;
      },
      undefined,
      (cause) => {
        this.#textureLoadError = new Error(
          `Failed to load underwater density/flow texture: ${densityFlowTextureUrl}`,
          { cause },
        );
      },
    );
  }

  #loadSurfaceCausticTexture(): void {
    this.#ktx2Loader.load(
      surfaceCausticTextureUrl,
      (texture) => {
        if (this.#destroyed) {
          texture.dispose();
          return;
        }
        const placeholder = this.#surfaceCausticTexture;
        this.#configureDataTexture(texture, "surface-caustic-field-data");
        this.#surfaceCausticTexture = texture;
        this.#replaceTextureUniform("uSurfaceCaustic", texture);
        this.#pufferfish.setSurfaceCausticTexture(texture);
        placeholder.dispose();
        this.#surfaceCausticReady = true;
      },
      undefined,
      (cause) => {
        this.#textureLoadError = new Error(
          `Failed to load underwater surface caustic texture: ${surfaceCausticTextureUrl}`,
          { cause },
        );
      },
    );
  }

  #loadSurfaceLightShaftTextures(): void {
    surfaceLightShaftTextureUrls.forEach((textureUrl, index) => {
      this.#ktx2Loader.load(
        textureUrl,
        (texture) => {
          if (this.#destroyed) {
            texture.dispose();
            return;
          }
          const placeholder = this.#surfaceLightShaftTextures[index];
          this.#configureLightMaskTexture(
            texture,
            `surface-light-shafts-${index}`,
          );
          this.#surfaceLightShaftTextures[index] = texture;
          this.#replaceExactTextureUniform(
            "uPrimaryShaftMap",
            placeholder,
            texture,
          );
          placeholder.dispose();
        },
        undefined,
        (cause) => {
          this.#textureLoadError = new Error(
            `Failed to load underwater light-shaft texture: ${textureUrl}`,
            { cause },
          );
        },
      );
    });
  }

  #configureDataTexture(texture: Texture, name: string): void {
    texture.name = name;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = NoColorSpace;
    texture.generateMipmaps = false;
    texture.anisotropy = Math.min(
      8,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    texture.needsUpdate = true;
  }

  #configureLightMaskTexture(texture: Texture, name: string): void {
    texture.name = name;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = NoColorSpace;
    texture.generateMipmaps = false;
    texture.anisotropy = Math.min(
      8,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    texture.needsUpdate = true;
  }

  #replaceTextureUniform(uniformName: string, texture: Texture): void {
    for (const material of this.#animatedMaterials) {
      if (material.uniforms[uniformName]) {
        material.uniforms[uniformName].value = texture;
      }
    }
  }

  #replaceExactTextureUniform(
    uniformName: string,
    previousTexture: Texture,
    texture: Texture,
  ): void {
    for (const material of this.#animatedMaterials) {
      if (material.uniforms[uniformName]?.value === previousTexture) {
        material.uniforms[uniformName].value = texture;
      }
    }
  }
}
