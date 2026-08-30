import {
  ACESFilmicToneMapping,
  BackSide,
  ClampToEdgeWrapping,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MirroredRepeatWrapping,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import {
  clampOceanPixelRatio,
  getOceanCameraProfile,
  getUnderwaterBufferSize,
} from "./ocean-config.js";
import {
  oceanFragmentShader,
  oceanVertexShader,
  seabedFragmentShader,
  seabedVertexShader,
  skyFragmentShader,
  skyVertexShader,
} from "./ocean-shaders.js";

const sunDirection = new Vector3(0.045, 0.155, -1).normalize();
const waterHeightTextureUrl = new URL(
  "../assets/textures/water-height-v2.ktx2",
  import.meta.url,
).href;
const seabedCausticTextureUrl = new URL(
  "../assets/textures/seabed-caustics-v2.ktx2",
  import.meta.url,
).href;
const cloudBankTextureUrl = new URL(
  "../assets/textures/cloud-bank-v3.ktx2",
  import.meta.url,
).href;
const smallCloudTextureUrl = new URL(
  "../assets/textures/small-clouds-v2.ktx2",
  import.meta.url,
).href;
const skySunlightTextureUrl = new URL(
  "../assets/textures/sky-sunlight-v3.ktx2",
  import.meta.url,
).href;

export class OceanSurfaceRenderer {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #underwaterScene = new Scene();
  readonly #camera = new PerspectiveCamera(48, 1, 0.1, 1100);
  readonly #drawingBufferSize = new Vector2();
  readonly #ktx2Loader: KTX2Loader;
  readonly #underwaterTarget = new WebGLRenderTarget(1, 1, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  });
  readonly #skyMaterial: ShaderMaterial;
  readonly #oceanMaterial: ShaderMaterial;
  readonly #seabedMaterial: ShaderMaterial;
  readonly #sky: Mesh<SphereGeometry, ShaderMaterial>;
  #waterHeightTexture = new Texture();
  #seabedCausticTexture = new Texture();
  #cloudBankTexture = new Texture();
  #smallCloudTexture = new Texture();
  #skySunlightTexture = new Texture();
  #waterHeightReady = false;
  #seabedCausticReady = false;
  #cloudBankReady = false;
  #smallCloudReady = false;
  #skySunlightReady = false;
  #textureLoadError: Error | null = null;
  #destroyed = false;

  constructor(host: HTMLElement) {
    this.#renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.#renderer.domElement.className = "ocean-canvas";
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 0.98;
    this.#renderer.setClearColor(0x0e95d3, 1);
    host.prepend(this.#renderer.domElement);
    this.#ktx2Loader = new KTX2Loader().detectSupport(this.#renderer);

    this.#underwaterTarget.texture.name = "shallow-underwater-source";
    this.#underwaterTarget.texture.colorSpace = NoColorSpace;
    this.#underwaterScene.background = new Color(0x00668c);

    this.#seabedMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCausticTexture: { value: this.#seabedCausticTexture },
        uCausticTextureMix: { value: 0 },
      },
      vertexShader: seabedVertexShader,
      fragmentShader: seabedFragmentShader,
      toneMapped: false,
    });
    const seabed = new Mesh(new PlaneGeometry(520, 720), this.#seabedMaterial);
    seabed.name = "procedural-shallow-seabed";
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.set(0, -4.8, -330);
    seabed.frustumCulled = false;
    this.#underwaterScene.add(seabed);

    this.#skyMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
        uCloudTexture: { value: this.#cloudBankTexture },
        uCloudTextureMix: { value: 0 },
        uSmallCloudTexture: { value: this.#smallCloudTexture },
        uSmallCloudTextureMix: { value: 0 },
        uSkySunlight: { value: this.#skySunlightTexture },
        uSkySunlightMix: { value: 0 },
        uResolution: { value: new Vector2(1, 1) },
      },
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: BackSide,
      depthWrite: false,
      toneMapped: true,
    });
    this.#sky = new Mesh(new SphereGeometry(760, 48, 24), this.#skyMaterial);
    this.#sky.name = "procedural-ocean-sky";
    this.#scene.add(this.#sky);

    this.#oceanMaterial = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
        uDeepColor: { value: new Color(0x005998) },
        uMidColor: { value: new Color(0x008fbe) },
        uShallowColor: { value: new Color(0x00b5c9) },
        uUnderwaterTexture: { value: this.#underwaterTarget.texture },
        uResolution: { value: new Vector2(1, 1) },
        uWaterHeight: { value: this.#waterHeightTexture },
        uWaterHeightMix: { value: 0 },
      },
      vertexShader: oceanVertexShader,
      fragmentShader: oceanFragmentShader,
      toneMapped: true,
    });
    const ocean = new Mesh(
      new PlaneGeometry(900, 1600, 180, 260),
      this.#oceanMaterial,
    );
    ocean.name = "gerstner-style-ocean-surface";
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.z = -780;
    ocean.frustumCulled = false;
    this.#scene.add(ocean);
    this.#loadWaterHeightTexture();
    this.#loadSeabedCausticTexture();
    this.#loadCloudBankTexture();
    this.#loadSmallCloudTexture();
    this.#loadSkySunlightTexture();

    this.#camera.position.set(0, 5.8, 14);
    this.resize(host.clientWidth, host.clientHeight);
    this.#renderer.setAnimationLoop(this.#renderFrame);
  }

  resize(width: number, height: number): void {
    if (this.#destroyed) return;
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    const aspect = safeWidth / safeHeight;
    const profile = getOceanCameraProfile(aspect);
    this.#camera.aspect = aspect;
    this.#camera.fov = profile.fov;
    this.#camera.lookAt(0, profile.lookY, profile.lookZ);
    this.#camera.updateProjectionMatrix();
    this.#renderer.setPixelRatio(
      clampOceanPixelRatio(window.devicePixelRatio || 1),
    );
    this.#renderer.setSize(safeWidth, safeHeight, false);
    this.#renderer.getDrawingBufferSize(this.#drawingBufferSize);
    const underwaterSize = getUnderwaterBufferSize(
      this.#drawingBufferSize.x,
      this.#drawingBufferSize.y,
    );
    this.#underwaterTarget.setSize(underwaterSize.width, underwaterSize.height);
    this.#oceanMaterial.uniforms.uResolution.value.copy(
      this.#drawingBufferSize,
    );
    this.#skyMaterial.uniforms.uResolution.value.copy(this.#drawingBufferSize);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#renderer.setAnimationLoop(null);
    this.#disposeScene(this.#scene);
    this.#disposeScene(this.#underwaterScene);
    this.#underwaterTarget.dispose();
    this.#waterHeightTexture.dispose();
    this.#seabedCausticTexture.dispose();
    this.#cloudBankTexture.dispose();
    this.#smallCloudTexture.dispose();
    this.#skySunlightTexture.dispose();
    this.#ktx2Loader.dispose();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  readonly #renderFrame = (timeMilliseconds: number): void => {
    if (this.#destroyed) return;
    if (this.#textureLoadError) throw this.#textureLoadError;
    const time = timeMilliseconds / 1000;
    this.#skyMaterial.uniforms.uTime.value = time;
    this.#oceanMaterial.uniforms.uTime.value = time;
    this.#seabedMaterial.uniforms.uTime.value = time;
    this.#oceanMaterial.uniforms.uWaterHeightMix.value = this.#waterHeightReady
      ? 1
      : 0;
    this.#seabedMaterial.uniforms.uCausticTextureMix.value = this
      .#seabedCausticReady
      ? 1
      : 0;
    this.#skyMaterial.uniforms.uCloudTextureMix.value = this.#cloudBankReady
      ? 1
      : 0;
    this.#skyMaterial.uniforms.uSmallCloudTextureMix.value = this
      .#smallCloudReady
      ? 1
      : 0;
    this.#skyMaterial.uniforms.uSkySunlightMix.value = this.#skySunlightReady
      ? 1
      : 0;
    this.#sky.position.copy(this.#camera.position);

    this.#renderer.setRenderTarget(this.#underwaterTarget);
    this.#renderer.render(this.#underwaterScene, this.#camera);
    this.#renderer.setRenderTarget(null);
    this.#renderer.render(this.#scene, this.#camera);
  };

  #loadWaterHeightTexture(): void {
    this.#ktx2Loader.load(
      waterHeightTextureUrl,
      (texture) => {
        if (this.#destroyed) {
          texture.dispose();
          return;
        }
        const placeholder = this.#waterHeightTexture;
        this.#configureDataTexture(texture, "ocean-water-height-v2-data");
        this.#waterHeightTexture = texture;
        this.#oceanMaterial.uniforms.uWaterHeight.value = texture;
        placeholder.dispose();
        this.#waterHeightReady = true;
      },
      undefined,
      (cause) => {
        this.#textureLoadError = new Error(
          `Failed to load ocean height texture: ${waterHeightTextureUrl}`,
          { cause },
        );
      },
    );
  }

  #loadSeabedCausticTexture(): void {
    this.#ktx2Loader.load(
      seabedCausticTextureUrl,
      (texture) => {
        if (this.#destroyed) {
          texture.dispose();
          return;
        }
        const placeholder = this.#seabedCausticTexture;
        this.#configureDataTexture(texture, "ocean-seabed-caustics-v2-data");
        this.#seabedCausticTexture = texture;
        this.#seabedMaterial.uniforms.uCausticTexture.value = texture;
        placeholder.dispose();
        this.#seabedCausticReady = true;
      },
      undefined,
      (cause) => {
        this.#textureLoadError = new Error(
          `Failed to load ocean seabed caustic texture: ${seabedCausticTextureUrl}`,
          { cause },
        );
      },
    );
  }

  #loadCloudBankTexture(): void {
    this.#ktx2Loader.load(
      cloudBankTextureUrl,
      (texture) => {
        if (this.#destroyed) {
          texture.dispose();
          return;
        }
        const placeholder = this.#cloudBankTexture;
        this.#configureCloudTexture(texture, "ocean-cloud-bank-v3-color");
        this.#cloudBankTexture = texture;
        this.#skyMaterial.uniforms.uCloudTexture.value = texture;
        placeholder.dispose();
        this.#cloudBankReady = true;
      },
      undefined,
      (cause) => {
        this.#textureLoadError = new Error(
          `Failed to load ocean cloud-bank texture: ${cloudBankTextureUrl}`,
          { cause },
        );
      },
    );
  }

  #loadSmallCloudTexture(): void {
    this.#ktx2Loader.load(
      smallCloudTextureUrl,
      (texture) => {
        if (this.#destroyed) {
          texture.dispose();
          return;
        }
        const placeholder = this.#smallCloudTexture;
        this.#configureCloudTexture(texture, "ocean-small-clouds-v2-color");
        this.#smallCloudTexture = texture;
        this.#skyMaterial.uniforms.uSmallCloudTexture.value = texture;
        placeholder.dispose();
        this.#smallCloudReady = true;
      },
      undefined,
      (cause) => {
        this.#textureLoadError = new Error(
          `Failed to load ocean small-cloud texture: ${smallCloudTextureUrl}`,
          { cause },
        );
      },
    );
  }

  #loadSkySunlightTexture(): void {
    this.#ktx2Loader.load(
      skySunlightTextureUrl,
      (texture) => {
        if (this.#destroyed) {
          texture.dispose();
          return;
        }
        const placeholder = this.#skySunlightTexture;
        this.#configureLightmapTexture(texture, "ocean-sky-sunlight-v3-data");
        this.#skySunlightTexture = texture;
        this.#skyMaterial.uniforms.uSkySunlight.value = texture;
        placeholder.dispose();
        this.#skySunlightReady = true;
      },
      undefined,
      (cause) => {
        this.#textureLoadError = new Error(
          `Failed to load sky sunlight texture: ${skySunlightTextureUrl}`,
          { cause },
        );
      },
    );
  }

  #configureDataTexture(texture: Texture, name: string): void {
    texture.name = name;
    texture.wrapS = MirroredRepeatWrapping;
    texture.wrapT = MirroredRepeatWrapping;
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

  #configureCloudTexture(texture: Texture, name: string): void {
    texture.name = name;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.anisotropy = Math.min(
      4,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    texture.needsUpdate = true;
  }

  #configureLightmapTexture(texture: Texture, name: string): void {
    texture.name = name;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = NoColorSpace;
    texture.generateMipmaps = false;
    texture.anisotropy = Math.min(
      4,
      this.#renderer.capabilities.getMaxAnisotropy(),
    );
    texture.needsUpdate = true;
  }

  #disposeScene(scene: Scene): void {
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
  }
}
