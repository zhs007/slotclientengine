import {
  Assets,
  Container,
  Graphics,
  Matrix,
  Mesh,
  MeshGeometry,
  Rectangle,
  Sprite,
  Texture,
} from "pixi.js";
import { SymbolAnimationError } from "./errors.js";
import type { SymbolSpineAnimationResource } from "./manifest.js";

type SpineCurve =
  | "linear"
  | "stepped"
  | readonly [number, number, number, number];

interface RawSpineBone {
  readonly name: string;
  readonly parent?: string;
  readonly x?: number;
  readonly y?: number;
  readonly rotation?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly shearX?: number;
  readonly shearY?: number;
}

interface RawSpineSlot {
  readonly name: string;
  readonly bone: string;
  readonly attachment?: string;
  readonly color?: string;
  readonly blend?: string;
}

interface RawSpineAttachment {
  readonly type?: string;
  readonly name?: string;
  readonly path?: string;
  readonly x?: number;
  readonly y?: number;
  readonly rotation?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly width?: number;
  readonly height?: number;
  readonly uvs?: readonly number[];
  readonly triangles?: readonly number[];
  readonly vertices?: readonly number[];
  readonly end?: string;
  readonly vertexCount?: number;
}

interface RawNumericFrame {
  readonly time?: number;
  readonly curve?:
    | "stepped"
    | readonly [number, number, number, number]
    | number;
  readonly c2?: number;
  readonly c3?: number;
  readonly c4?: number;
  readonly angle?: number;
  readonly x?: number;
  readonly y?: number;
}

interface RawAttachmentFrame {
  readonly time?: number;
  readonly name?: string | null;
}

interface RawColorFrame {
  readonly time?: number;
  readonly color?: string;
  readonly curve?:
    | "stepped"
    | readonly [number, number, number, number]
    | number;
  readonly c2?: number;
  readonly c3?: number;
  readonly c4?: number;
}

interface RawBoneTimeline {
  readonly rotate?: readonly RawNumericFrame[];
  readonly translate?: readonly RawNumericFrame[];
  readonly scale?: readonly RawNumericFrame[];
  readonly shear?: readonly RawNumericFrame[];
}

interface RawSlotTimeline {
  readonly attachment?: readonly RawAttachmentFrame[];
  readonly color?: readonly RawColorFrame[];
}

interface RawDrawOrderOffset {
  readonly slot: string;
  readonly offset: number;
}

interface RawDrawOrderFrame {
  readonly time?: number;
  readonly offsets?: readonly RawDrawOrderOffset[];
}

interface RawSpineAnimation {
  readonly slots?: Readonly<Record<string, RawSlotTimeline>>;
  readonly bones?: Readonly<Record<string, RawBoneTimeline>>;
  readonly drawOrder?: readonly RawDrawOrderFrame[];
  readonly draworder?: readonly RawDrawOrderFrame[];
}

interface RawSpineSkeleton {
  readonly skeleton?: {
    readonly spine?: string;
    readonly width?: number;
    readonly height?: number;
    readonly fps?: number;
  };
  readonly bones?: readonly RawSpineBone[];
  readonly slots?: readonly RawSpineSlot[];
  readonly skins?:
    | Readonly<
        Record<
          string,
          Readonly<Record<string, Readonly<Record<string, RawSpineAttachment>>>>
        >
      >
    | readonly {
        readonly name?: string;
        readonly attachments?: Readonly<
          Record<string, Readonly<Record<string, RawSpineAttachment>>>
        >;
      }[];
  readonly animations?: Readonly<Record<string, RawSpineAnimation>>;
}

interface BoneSetup {
  readonly name: string;
  readonly parentName: string | null;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly shearX: number;
  readonly shearY: number;
}

interface SlotSetup {
  readonly name: string;
  readonly boneName: string;
  readonly attachmentName: string | null;
  readonly color: string;
  readonly blendMode: "normal" | "additive";
}

interface RegionAttachmentPose {
  readonly kind: "region";
  readonly name: string;
  readonly textureName: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly width: number;
  readonly height: number;
}

interface MeshVertexWeight {
  readonly boneIndex: number | null;
  readonly x: number;
  readonly y: number;
  readonly weight: number;
}

interface MeshAttachmentPose {
  readonly kind: "mesh";
  readonly name: string;
  readonly textureName: string;
  readonly uvs: readonly number[];
  readonly triangles: readonly number[];
  readonly vertices: readonly (readonly MeshVertexWeight[])[];
}

interface ClippingAttachmentPose {
  readonly kind: "clipping";
  readonly name: string;
  readonly endSlotName: string;
  readonly vertices: readonly (readonly MeshVertexWeight[])[];
}

type RenderableAttachmentPose = RegionAttachmentPose | MeshAttachmentPose;
type AttachmentPose = RenderableAttachmentPose | ClippingAttachmentPose;

interface NumericKeyframe {
  readonly time: number;
  readonly value: number;
  readonly curve: SpineCurve;
}

interface VectorKeyframe {
  readonly time: number;
  readonly x: number;
  readonly y: number;
  readonly curve: SpineCurve;
}

interface ColorKeyframe {
  readonly time: number;
  readonly color: string;
  readonly curve: SpineCurve;
}

interface AttachmentKeyframe {
  readonly time: number;
  readonly name: string | null;
}

interface BoneAnimation {
  readonly rotate: readonly NumericKeyframe[];
  readonly translate: readonly VectorKeyframe[];
  readonly scale: readonly VectorKeyframe[];
  readonly shear: readonly VectorKeyframe[];
}

interface SlotAnimation {
  readonly attachment: readonly AttachmentKeyframe[];
  readonly color: readonly ColorKeyframe[];
}

interface DrawOrderKeyframe {
  readonly time: number;
  readonly slotOrder: readonly string[];
}

interface SpineAnimation {
  readonly name: string;
  readonly duration: number;
  readonly bones: Readonly<Record<string, BoneAnimation>>;
  readonly slots: Readonly<Record<string, SlotAnimation>>;
  readonly drawOrder: readonly DrawOrderKeyframe[];
}

interface SpineModel {
  readonly skeleton: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
  };
  readonly bones: readonly BoneSetup[];
  readonly slots: readonly SlotSetup[];
  readonly slotOrder: readonly string[];
  readonly attachments: Readonly<
    Record<string, Readonly<Record<string, AttachmentPose>>>
  >;
  readonly attachmentNames: readonly string[];
  readonly animations: Readonly<Record<string, SpineAnimation>>;
}

interface BonePose {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly shearX: number;
  readonly shearY: number;
}

interface AffineMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

interface WorldTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly matrix: AffineMatrix;
}

interface SlotPose {
  readonly slotName: string;
  readonly boneName: string;
  readonly attachmentName: string | null;
  readonly attachment: AttachmentPose | null;
  readonly color: string;
  readonly blendMode: "normal" | "additive";
}

interface SampledAnimationPose {
  readonly time: number;
  readonly duration: number;
  readonly bones: Readonly<Record<string, BonePose>>;
  readonly slots: Readonly<Record<string, SlotPose>>;
  readonly drawOrder: readonly string[];
}

interface SpineAtlasRegion {
  readonly name: string;
  readonly rotate: boolean;
  readonly xy: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly orig: { readonly width: number; readonly height: number };
  readonly offset: { readonly x: number; readonly y: number };
}

type SlotDisplayNode =
  | {
      readonly kind: "region";
      readonly attachmentName: string;
      readonly display: Sprite;
    }
  | {
      readonly kind: "mesh";
      readonly attachmentName: string;
      readonly display: Mesh;
      readonly geometry: MeshGeometry;
    };

export interface SpineAtlasData {
  readonly pageName: string;
  readonly regions: Readonly<Record<string, SpineAtlasRegion>>;
}

const RADIAN_FACTOR = Math.PI / 180;
const tempMatrix = new Matrix();

export function isSpine38Skeleton(skeleton: unknown): boolean {
  const raw = assertRawSpineSkeleton(skeleton);
  return String(raw.skeleton?.spine ?? "").startsWith("3.");
}

export function parseSpineAtlasText(atlasText: string): SpineAtlasData {
  const lines = atlasText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length < 5) {
    throw new Error("Invalid Spine atlas: missing page header.");
  }
  const pageName = lines[0].trim();
  if (!pageName) {
    throw new Error("Invalid Spine atlas: missing page name.");
  }

  const regions: Record<string, SpineAtlasRegion> = {};
  let index = 5;
  while (index < lines.length) {
    const name = lines[index]?.trim();
    if (!name) {
      throw new Error("Invalid Spine atlas: missing region name.");
    }
    const fields = new Map<string, string>();
    index += 1;
    while (index < lines.length && lines[index]?.startsWith("  ")) {
      const [rawKey, ...rawValueParts] = lines[index].split(":");
      const key = rawKey?.trim();
      const value = rawValueParts.join(":").trim();
      if (key) {
        fields.set(key, value);
      }
      index += 1;
    }
    regions[name] = Object.freeze({
      name,
      rotate: fields.get("rotate") === "true",
      xy: parseAtlasPair(fields.get("xy"), `${name}.xy`),
      size: parseAtlasSize(fields.get("size"), `${name}.size`),
      orig: parseAtlasSize(fields.get("orig"), `${name}.orig`),
      offset: parseAtlasPair(fields.get("offset"), `${name}.offset`),
    });
  }

  return Object.freeze({
    pageName,
    regions: Object.freeze(regions),
  });
}

export function validateSpine38SkeletonContract(options: {
  readonly skeleton: unknown;
  readonly animationName: string;
  readonly atlas: SpineAtlasData;
}): void {
  const model = createSpine38Model(options.skeleton);
  if (!model.animations[options.animationName]) {
    throw new Error(`missing animation "${options.animationName}"`);
  }
  for (const attachmentName of model.attachmentNames) {
    if (!options.atlas.regions[attachmentName]) {
      throw new Error(`missing atlas region "${attachmentName}"`);
    }
  }
}

export class Spine38SymbolPlayer {
  readonly view = new Container();
  readonly #resource: SymbolSpineAnimationResource;
  #model: SpineModel | null = null;
  #textures: Readonly<Record<string, Texture>> = Object.freeze({});
  #slotLayer: Container | null = null;
  #slotNodes = new Map<string, SlotDisplayNode>();
  #slotMasks = new Map<string, Graphics>();
  #elapsedSeconds = 0;
  #animationName = "";
  #loop = false;
  #completed = false;
  #destroyed = false;

  constructor(options: { readonly resource: SymbolSpineAnimationResource }) {
    this.#resource = options.resource;
  }

  async init(): Promise<void> {
    this.assertNotDestroyed();
    const model = createSpine38Model(this.#resource.skeleton);
    const animationName = this.#resource.spec.playback.animationName;
    if (!model.animations[animationName]) {
      throw new SymbolAnimationError(
        `Spine animation "${animationName}" was not found.`,
      );
    }
    const atlas = parseSpineAtlasText(this.#resource.atlasText);
    if (atlas.pageName !== this.#resource.atlasPage) {
      throw new SymbolAnimationError(
        `Spine atlas page contract changed for "${this.#resource.symbol}" state "${this.#resource.state}".`,
      );
    }
    for (const attachmentName of model.attachmentNames) {
      if (!atlas.regions[attachmentName]) {
        throw new SymbolAnimationError(
          `Spine atlas is missing region "${attachmentName}".`,
        );
      }
    }

    const baseTexture = await Assets.load<Texture>(this.#resource.textureUrl);
    this.assertNotDestroyed();
    const textures = createAtlasTextures(atlas, baseTexture);
    const slotLayer = new Container();
    slotLayer.sortableChildren = true;
    this.view.addChild(slotLayer);
    this.#model = model;
    this.#textures = textures;
    this.#slotLayer = slotLayer;
    this.#slotNodes.clear();
    this.#slotMasks.clear();
    this.play({
      animationName,
      loop: this.#resource.spec.playback.loop,
    });
  }

  play(options: {
    readonly animationName: string;
    readonly loop: boolean;
  }): void {
    this.assertNotDestroyed();
    const model = this.getModel();
    if (!model.animations[options.animationName]) {
      throw new SymbolAnimationError(
        `Spine animation "${options.animationName}" was not found.`,
      );
    }
    this.#animationName = options.animationName;
    this.#loop = options.loop;
    this.#elapsedSeconds = 0;
    this.#completed = false;
    this.applyPose(0);
  }

  update(deltaSeconds: number): { readonly completed: boolean } {
    this.assertNotDestroyed();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new SymbolAnimationError(
        "Spine player deltaSeconds must be a finite non-negative number.",
      );
    }
    if (!this.#model) {
      return Object.freeze({ completed: false });
    }
    this.#elapsedSeconds += deltaSeconds;
    const animation = this.#model.animations[this.#animationName];
    this.applyPose(this.#elapsedSeconds);
    if (
      !this.#loop &&
      animation &&
      this.#elapsedSeconds >= animation.duration
    ) {
      this.#completed = true;
    }
    return Object.freeze({ completed: this.#completed });
  }

  reset(): void {
    this.assertNotDestroyed();
    this.#elapsedSeconds = 0;
    this.#completed = false;
    if (this.#model && this.#animationName) {
      this.applyPose(0);
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#slotNodes.clear();
    this.#slotMasks.clear();
    this.#slotLayer?.removeChildren();
    this.#slotLayer = null;
    this.view.removeChildren();
    this.view.parent?.removeChild(this.view);
  }

  private applyPose(elapsedSeconds: number): void {
    const model = this.getModel();
    const pose = sampleAnimationPose(
      model,
      this.#animationName,
      elapsedSeconds,
      this.#loop,
    );
    const worldBones = computeWorldBoneTransforms(model, pose.bones);
    const drawOrderIndex = new Map(
      pose.drawOrder.map((slotName, index) => [slotName, index]),
    );
    const setupOrderIndex = new Map(
      model.slotOrder.map((slotName, index) => [slotName, index]),
    );
    const activeMaskSlotNames = new Set<string>();
    let activeClip: {
      readonly endSlotName: string;
      readonly mask: Graphics;
    } | null = null;

    for (const node of this.#slotNodes.values()) {
      node.display.mask = null;
    }

    for (const slotName of pose.drawOrder) {
      const slotPose = pose.slots[slotName];
      if (!slotPose) {
        continue;
      }
      if (slotPose.attachment?.kind === "clipping") {
        this.hideSlotNode(slotName);
        const mask = this.createOrUpdateClippingMask({
          slotName,
          attachment: slotPose.attachment,
          slotBoneName: slotPose.boneName,
          model,
          worldBones,
        });
        if (mask) {
          mask.zIndex =
            drawOrderIndex.get(slotName) ?? setupOrderIndex.get(slotName) ?? 0;
          activeMaskSlotNames.add(slotName);
          activeClip = {
            endSlotName: slotPose.attachment.endSlotName,
            mask,
          };
        } else {
          activeClip = null;
        }
        if (activeClip?.endSlotName === slotName) {
          activeClip = null;
        }
        continue;
      }
      const node = this.ensureSlotNode(slotName, slotPose.attachment);
      if (!node) {
        if (activeClip?.endSlotName === slotName) {
          activeClip = null;
        }
        continue;
      }
      applySlotVisual(node, slotPose, this.#textures);
      node.display.mask = activeClip?.mask ?? null;
      node.display.zIndex =
        drawOrderIndex.get(slotName) ?? setupOrderIndex.get(slotName) ?? 0;
      if (!slotPose.attachment) {
        continue;
      }
      if (node.kind === "region" && slotPose.attachment.kind === "region") {
        const worldBone = worldBones[slotPose.boneName];
        if (!worldBone) {
          continue;
        }
        const world = composeAttachmentTransform(
          worldBone,
          slotPose.attachment,
        );
        const sceneMatrix = createSceneMatrix(world.matrix);
        tempMatrix.set(
          sceneMatrix.a,
          sceneMatrix.b,
          sceneMatrix.c,
          sceneMatrix.d,
          sceneMatrix.tx,
          sceneMatrix.ty,
        );
        node.display.setFromMatrix(tempMatrix);
      }
      if (node.kind === "mesh" && slotPose.attachment.kind === "mesh") {
        node.geometry.positions = computeMeshScenePositions({
          attachment: slotPose.attachment,
          model,
          slotBoneName: slotPose.boneName,
          worldBones,
        });
      }
      if (activeClip?.endSlotName === slotName) {
        activeClip = null;
      }
    }

    for (const [slotName, mask] of this.#slotMasks) {
      if (!activeMaskSlotNames.has(slotName)) {
        mask.clear();
        mask.visible = false;
        mask.renderable = false;
        mask.includeInBuild = false;
        mask.measurable = false;
      }
    }
  }

  private ensureSlotNode(
    slotName: string,
    attachment: AttachmentPose | null,
  ): SlotDisplayNode | null {
    const existing = this.#slotNodes.get(slotName);
    if (!attachment || attachment.kind === "clipping") {
      this.hideSlotNode(slotName);
      return null;
    }
    if (
      existing &&
      existing.kind === attachment.kind &&
      existing.attachmentName === attachment.name
    ) {
      return existing;
    }
    if (existing) {
      existing.display.parent?.removeChild(existing.display);
      this.#slotNodes.delete(slotName);
    }
    const slotLayer = this.#slotLayer;
    if (!slotLayer) {
      throw new SymbolAnimationError("Spine slot layer has not initialized.");
    }
    const node = createSlotNode(attachment);
    slotLayer.addChild(node.display);
    this.#slotNodes.set(slotName, node);
    return node;
  }

  private hideSlotNode(slotName: string): void {
    const existing = this.#slotNodes.get(slotName);
    if (!existing) {
      return;
    }
    existing.display.visible = false;
    existing.display.mask = null;
    existing.display.texture = Texture.EMPTY;
  }

  private createOrUpdateClippingMask(options: {
    readonly slotName: string;
    readonly attachment: ClippingAttachmentPose;
    readonly slotBoneName: string;
    readonly model: SpineModel;
    readonly worldBones: Readonly<Record<string, WorldTransform>>;
  }): Graphics | null {
    const slotLayer = this.#slotLayer;
    if (!slotLayer) {
      throw new SymbolAnimationError("Spine slot layer has not initialized.");
    }
    let mask = this.#slotMasks.get(options.slotName);
    if (!mask) {
      mask = new Graphics();
      mask.visible = false;
      mask.renderable = false;
      mask.includeInBuild = false;
      mask.measurable = false;
      slotLayer.addChild(mask);
      this.#slotMasks.set(options.slotName, mask);
    }
    const positions = computeWeightedScenePositions({
      vertices: options.attachment.vertices,
      model: options.model,
      slotBoneName: options.slotBoneName,
      worldBones: options.worldBones,
    });
    if (positions.length < 6) {
      mask.clear();
      mask.visible = false;
      mask.renderable = false;
      mask.includeInBuild = false;
      mask.measurable = false;
      return null;
    }
    mask
      .clear()
      .poly(Array.from(positions))
      .fill({ color: 0xffffff, alpha: 1 });
    mask.visible = true;
    mask.renderable = true;
    mask.includeInBuild = false;
    mask.measurable = false;
    return mask;
  }

  private getModel(): SpineModel {
    if (!this.#model) {
      throw new SymbolAnimationError("Spine player has not initialized.");
    }
    return this.#model;
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new SymbolAnimationError("Spine player was destroyed.");
    }
  }
}

function createSpine38Model(skeleton: unknown): SpineModel {
  const raw = assertRawSpineSkeleton(skeleton);
  const bones = (raw.bones ?? []).map((bone) =>
    Object.freeze({
      name: bone.name,
      parentName: bone.parent ?? null,
      x: bone.x ?? 0,
      y: bone.y ?? 0,
      rotation: bone.rotation ?? 0,
      scaleX: bone.scaleX ?? 1,
      scaleY: bone.scaleY ?? 1,
      shearX: bone.shearX ?? 0,
      shearY: bone.shearY ?? 0,
    }),
  );
  const boneNames = new Set(bones.map((bone) => bone.name));
  for (const bone of bones) {
    if (bone.parentName && !boneNames.has(bone.parentName)) {
      throw new Error(`missing parent bone "${bone.parentName}"`);
    }
  }

  const slots = (raw.slots ?? []).map((slot) => {
    if (!boneNames.has(slot.bone)) {
      throw new Error(
        `slot "${slot.name}" references missing bone "${slot.bone}"`,
      );
    }
    return Object.freeze({
      name: slot.name,
      boneName: slot.bone,
      attachmentName: slot.attachment ?? null,
      color: slot.color ?? "ffffffff",
      blendMode: slot.blend === "additive" ? "additive" : "normal",
    });
  });

  const attachments = adaptSkinAttachments(raw);
  const attachmentNames = new Set<string>();
  for (const slotAttachments of Object.values(attachments)) {
    for (const attachment of Object.values(slotAttachments)) {
      if (attachment.kind !== "clipping") {
        attachmentNames.add(attachment.textureName);
      }
    }
  }
  const slotNames = new Set(slots.map((slot) => slot.name));
  for (const slotAttachments of Object.values(attachments)) {
    for (const attachment of Object.values(slotAttachments)) {
      if (
        attachment.kind === "clipping" &&
        !slotNames.has(attachment.endSlotName)
      ) {
        throw new Error(
          `clipping attachment "${attachment.name}" references missing end slot "${attachment.endSlotName}"`,
        );
      }
    }
  }

  const animations = Object.fromEntries(
    Object.entries(raw.animations ?? {}).map(([animationName, animation]) => {
      const bonesAnimation: Record<string, BoneAnimation> = {};
      for (const [boneName, bone] of Object.entries(animation.bones ?? {})) {
        bonesAnimation[boneName] = Object.freeze({
          rotate: adaptAngleFrames(bone.rotate),
          translate: adaptVectorFrames(bone.translate, 0),
          scale: adaptVectorFrames(bone.scale, 1),
          shear: adaptVectorFrames(bone.shear, 0),
        });
      }

      const slotsAnimation: Record<string, SlotAnimation> = {};
      for (const [slotName, slot] of Object.entries(animation.slots ?? {})) {
        slotsAnimation[slotName] = Object.freeze({
          attachment: adaptAttachmentFrames(slot.attachment),
          color: adaptColorFrames(slot.color),
        });
      }

      const drawOrderFrames = animation.drawOrder ?? animation.draworder;
      return [
        animationName,
        Object.freeze({
          name: animationName,
          duration: computeAnimationDuration(animation),
          bones: Object.freeze(bonesAnimation),
          slots: Object.freeze(slotsAnimation),
          drawOrder: adaptDrawOrderFrames(
            slots.map((slot) => slot.name),
            drawOrderFrames,
          ),
        }),
      ];
    }),
  );

  if (Object.keys(animations).length === 0) {
    throw new Error("missing animations");
  }

  return Object.freeze({
    skeleton: Object.freeze({
      width: raw.skeleton?.width ?? 0,
      height: raw.skeleton?.height ?? 0,
      fps: raw.skeleton?.fps ?? 24,
    }),
    bones: Object.freeze(bones),
    slots: Object.freeze(slots),
    slotOrder: Object.freeze(slots.map((slot) => slot.name)),
    attachments: Object.freeze(attachments),
    attachmentNames: Object.freeze([...attachmentNames].sort()),
    animations: Object.freeze(animations),
  });
}

function adaptSkinAttachments(
  raw: RawSpineSkeleton,
): Readonly<Record<string, Readonly<Record<string, AttachmentPose>>>> {
  const rawAttachments = getDefaultSkinAttachments(raw);
  const attachments: Record<string, Record<string, AttachmentPose>> = {};
  for (const [slotName, slotAttachments] of Object.entries(rawAttachments)) {
    const parsedSlotAttachments: Record<string, AttachmentPose> = {};
    for (const [attachmentName, attachment] of Object.entries(
      slotAttachments,
    )) {
      if (attachment.type === "boundingbox") {
        continue;
      }
      parsedSlotAttachments[attachmentName] =
        attachment.type === "clipping"
          ? adaptClippingAttachment(attachmentName, attachment)
          : attachment.type === "mesh"
            ? adaptMeshAttachment(attachmentName, attachment)
            : adaptRegionAttachment(attachmentName, attachment);
    }
    attachments[slotName] = Object.freeze(parsedSlotAttachments);
  }
  return Object.freeze(attachments);
}

function adaptRegionAttachment(
  attachmentName: string,
  attachment: RawSpineAttachment,
): RegionAttachmentPose {
  return Object.freeze({
    kind: "region",
    name: attachmentName,
    textureName: String(attachment.path ?? attachment.name ?? attachmentName),
    x: attachment.x ?? 0,
    y: attachment.y ?? 0,
    rotation: attachment.rotation ?? 0,
    scaleX: attachment.scaleX ?? 1,
    scaleY: attachment.scaleY ?? 1,
    width: attachment.width ?? 0,
    height: attachment.height ?? 0,
  });
}

function adaptMeshAttachment(
  attachmentName: string,
  attachment: RawSpineAttachment,
): MeshAttachmentPose {
  const uvs = assertNumberArray(attachment.uvs, `${attachmentName}.uvs`);
  const triangles = assertNumberArray(
    attachment.triangles,
    `${attachmentName}.triangles`,
  );
  const vertices = assertNumberArray(
    attachment.vertices,
    `${attachmentName}.vertices`,
  );
  const vertexCount = uvs.length / 2;
  if (!Number.isInteger(vertexCount) || vertexCount <= 0) {
    throw new Error(`mesh attachment "${attachmentName}" has invalid uvs`);
  }
  return Object.freeze({
    kind: "mesh",
    name: attachmentName,
    textureName: String(attachment.path ?? attachment.name ?? attachmentName),
    uvs: Object.freeze([...uvs]),
    triangles: Object.freeze([...triangles]),
    vertices: Object.freeze(
      parseMeshVertices(attachmentName, vertices, vertexCount),
    ),
  });
}

function adaptClippingAttachment(
  attachmentName: string,
  attachment: RawSpineAttachment,
): ClippingAttachmentPose {
  const endSlotName = String(attachment.end ?? "");
  if (!endSlotName) {
    throw new Error(
      `clipping attachment "${attachmentName}" is missing end slot`,
    );
  }
  const vertexCount = attachment.vertexCount;
  if (
    typeof vertexCount !== "number" ||
    !Number.isInteger(vertexCount) ||
    vertexCount <= 0
  ) {
    throw new Error(
      `clipping attachment "${attachmentName}" has invalid vertexCount`,
    );
  }
  const vertices = assertNumberArray(
    attachment.vertices,
    `${attachmentName}.vertices`,
  );
  return Object.freeze({
    kind: "clipping",
    name: attachmentName,
    endSlotName,
    vertices: Object.freeze(
      parseMeshVertices(attachmentName, vertices, vertexCount),
    ),
  });
}

function parseMeshVertices(
  attachmentName: string,
  vertices: readonly number[],
  vertexCount: number,
): readonly (readonly MeshVertexWeight[])[] {
  if (vertices.length === vertexCount * 2) {
    return Object.freeze(
      Array.from({ length: vertexCount }, (_unused, index) =>
        Object.freeze([
          Object.freeze({
            boneIndex: null,
            x: vertices[index * 2] ?? 0,
            y: vertices[index * 2 + 1] ?? 0,
            weight: 1,
          }),
        ]),
      ),
    );
  }

  const parsed: (readonly MeshVertexWeight[])[] = [];
  let cursor = 0;
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const boneCount = vertices[cursor];
    cursor += 1;
    if (!Number.isInteger(boneCount) || boneCount <= 0) {
      throw new Error(
        `mesh attachment "${attachmentName}" has invalid bone count`,
      );
    }
    const weights: MeshVertexWeight[] = [];
    for (let weightIndex = 0; weightIndex < boneCount; weightIndex += 1) {
      const boneIndex = vertices[cursor];
      const x = vertices[cursor + 1];
      const y = vertices[cursor + 2];
      const weight = vertices[cursor + 3];
      cursor += 4;
      if (
        !Number.isInteger(boneIndex) ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(weight)
      ) {
        throw new Error(
          `mesh attachment "${attachmentName}" has invalid weighted vertex`,
        );
      }
      weights.push(
        Object.freeze({
          boneIndex,
          x,
          y,
          weight,
        }),
      );
    }
    parsed.push(Object.freeze(weights));
  }
  if (cursor !== vertices.length) {
    throw new Error(
      `mesh attachment "${attachmentName}" has trailing vertices`,
    );
  }
  return Object.freeze(parsed);
}

function getDefaultSkinAttachments(
  raw: RawSpineSkeleton,
): Readonly<Record<string, Readonly<Record<string, RawSpineAttachment>>>> {
  if (Array.isArray(raw.skins)) {
    const defaultSkin =
      raw.skins.find((skin) => skin.name === "default") ?? raw.skins[0];
    return defaultSkin?.attachments ?? {};
  }
  return (
    (
      raw.skins as
        | Readonly<
            Record<
              string,
              Readonly<
                Record<string, Readonly<Record<string, RawSpineAttachment>>>
              >
            >
          >
        | undefined
    )?.default ?? {}
  );
}

function adaptAngleFrames(
  frames: readonly RawNumericFrame[] | undefined,
): readonly NumericKeyframe[] {
  return Object.freeze(
    (frames ?? []).map((frame) =>
      Object.freeze({
        time: frame.time ?? 0,
        value: frame.angle ?? 0,
        curve: normalizeCurve(frame),
      }),
    ),
  );
}

function adaptVectorFrames(
  frames: readonly RawNumericFrame[] | undefined,
  fallback: number,
): readonly VectorKeyframe[] {
  return Object.freeze(
    (frames ?? []).map((frame) =>
      Object.freeze({
        time: frame.time ?? 0,
        x: frame.x ?? fallback,
        y: frame.y ?? fallback,
        curve: normalizeCurve(frame),
      }),
    ),
  );
}

function adaptAttachmentFrames(
  frames: readonly RawAttachmentFrame[] | undefined,
): readonly AttachmentKeyframe[] {
  return Object.freeze(
    (frames ?? []).map((frame) =>
      Object.freeze({
        time: frame.time ?? 0,
        name: frame.name ?? null,
      }),
    ),
  );
}

function adaptColorFrames(
  frames: readonly RawColorFrame[] | undefined,
): readonly ColorKeyframe[] {
  return Object.freeze(
    (frames ?? []).map((frame) =>
      Object.freeze({
        time: frame.time ?? 0,
        color: frame.color ?? "ffffffff",
        curve: normalizeCurve(frame),
      }),
    ),
  );
}

function adaptDrawOrderFrames(
  slotOrder: readonly string[],
  frames: readonly RawDrawOrderFrame[] | undefined,
): readonly DrawOrderKeyframe[] {
  return Object.freeze(
    (frames ?? []).map((frame) =>
      Object.freeze({
        time: frame.time ?? 0,
        slotOrder: Object.freeze(expandDrawOrderFrame(slotOrder, frame)),
      }),
    ),
  );
}

function normalizeCurve(frame: {
  readonly curve?:
    | "stepped"
    | readonly [number, number, number, number]
    | number;
  readonly c2?: number;
  readonly c3?: number;
  readonly c4?: number;
}): SpineCurve {
  if (frame.curve === "stepped") {
    return "stepped";
  }
  if (Array.isArray(frame.curve) && frame.curve.length === 4) {
    return frame.curve as readonly [number, number, number, number];
  }
  if (typeof frame.curve === "number") {
    return [frame.curve, frame.c2 ?? 0, frame.c3 ?? 1, frame.c4 ?? 1] as const;
  }
  return "linear";
}

function expandDrawOrderFrame(
  slotOrder: readonly string[],
  frame: RawDrawOrderFrame,
): readonly string[] {
  const offsets = frame.offsets ?? [];
  if (offsets.length === 0) {
    return [...slotOrder];
  }

  const slotIndices = new Map(
    slotOrder.map((slotName, index) => [slotName, index]),
  );
  const expandedOrder = new Array<string>(slotOrder.length);
  const unchangedSlots: string[] = [];
  let originalIndex = 0;

  for (const offset of offsets) {
    const slotIndex = slotIndices.get(offset.slot);
    if (slotIndex === undefined) {
      continue;
    }
    while (originalIndex < slotIndex) {
      unchangedSlots.push(slotOrder[originalIndex]);
      originalIndex += 1;
    }
    expandedOrder[slotIndex + offset.offset] = slotOrder[slotIndex];
    originalIndex += 1;
  }

  while (originalIndex < slotOrder.length) {
    unchangedSlots.push(slotOrder[originalIndex]);
    originalIndex += 1;
  }

  for (let index = expandedOrder.length - 1; index >= 0; index -= 1) {
    if (!expandedOrder[index]) {
      expandedOrder[index] = unchangedSlots.pop() ?? slotOrder[index];
    }
  }
  return expandedOrder;
}

function computeAnimationDuration(animation: RawSpineAnimation): number {
  let duration = 0;
  for (const slot of Object.values(animation.slots ?? {})) {
    for (const frame of slot.attachment ?? []) {
      duration = Math.max(duration, frame.time ?? 0);
    }
    for (const frame of slot.color ?? []) {
      duration = Math.max(duration, frame.time ?? 0);
    }
  }
  for (const bone of Object.values(animation.bones ?? {})) {
    for (const frame of bone.rotate ?? []) {
      duration = Math.max(duration, frame.time ?? 0);
    }
    for (const frame of bone.translate ?? []) {
      duration = Math.max(duration, frame.time ?? 0);
    }
    for (const frame of bone.scale ?? []) {
      duration = Math.max(duration, frame.time ?? 0);
    }
    for (const frame of bone.shear ?? []) {
      duration = Math.max(duration, frame.time ?? 0);
    }
  }
  for (const frame of animation.drawOrder ?? animation.draworder ?? []) {
    duration = Math.max(duration, frame.time ?? 0);
  }
  return duration;
}

function sampleAnimationPose(
  model: SpineModel,
  animationName: string,
  elapsedSeconds: number,
  loop: boolean,
): SampledAnimationPose {
  const animation = model.animations[animationName];
  if (!animation) {
    throw new SymbolAnimationError(`Unknown Spine animation: ${animationName}`);
  }
  const time = normalizeLoopTime(animation.duration, elapsedSeconds, loop);
  const bones: Record<string, BonePose> = {};
  for (const bone of model.bones) {
    const timelines = animation.bones[bone.name];
    const translate = sampleVector(timelines?.translate ?? [], time, {
      x: 0,
      y: 0,
    });
    const scale = sampleVector(timelines?.scale ?? [], time, {
      x: 1,
      y: 1,
    });
    const shear = sampleVector(timelines?.shear ?? [], time, {
      x: 0,
      y: 0,
    });
    const rotation = sampleNumeric(timelines?.rotate ?? [], time, 0, true);

    bones[bone.name] = Object.freeze({
      x: bone.x + translate.x,
      y: bone.y + translate.y,
      rotation: bone.rotation + rotation,
      scaleX: bone.scaleX * scale.x,
      scaleY: bone.scaleY * scale.y,
      shearX: bone.shearX + shear.x,
      shearY: bone.shearY + shear.y,
    });
  }

  const slots: Record<string, SlotPose> = {};
  for (const slot of model.slots) {
    const timelines = animation.slots[slot.name];
    const attachmentName = sampleAttachment(
      timelines?.attachment ?? [],
      time,
      slot.attachmentName,
    );
    const color = sampleColor(timelines?.color ?? [], time, slot.color);
    const attachment = attachmentName
      ? (model.attachments[slot.name]?.[attachmentName] ?? null)
      : null;
    slots[slot.name] = Object.freeze({
      slotName: slot.name,
      boneName: slot.boneName,
      attachmentName,
      attachment,
      color,
      blendMode: slot.blendMode,
    });
  }

  return Object.freeze({
    time,
    duration: animation.duration,
    bones: Object.freeze(bones),
    slots: Object.freeze(slots),
    drawOrder: Object.freeze(
      sampleDrawOrder(animation.drawOrder, time, model.slotOrder),
    ),
  });
}

function sampleNumeric(
  frames: readonly NumericKeyframe[],
  time: number,
  fallback: number,
  angle = false,
): number {
  if (frames.length === 0) {
    return fallback;
  }
  const first = frames[0];
  if (time < first.time) {
    return fallback;
  }
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (time >= frame.time) {
      const next = frames[index + 1];
      if (!next || next.time === frame.time || frame.curve === "stepped") {
        return frame.value;
      }
      const progress = easeProgress(
        (time - frame.time) / (next.time - frame.time),
        frame.curve,
      );
      if (angle) {
        return (
          frame.value + normalizeAngle(next.value - frame.value) * progress
        );
      }
      return frame.value + (next.value - frame.value) * progress;
    }
  }
  return fallback;
}

function sampleVector(
  frames: readonly VectorKeyframe[],
  time: number,
  fallback: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  if (frames.length === 0) {
    return fallback;
  }
  const first = frames[0];
  if (time < first.time) {
    return fallback;
  }
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (time >= frame.time) {
      const next = frames[index + 1];
      if (!next || next.time === frame.time || frame.curve === "stepped") {
        return { x: frame.x, y: frame.y };
      }
      const progress = easeProgress(
        (time - frame.time) / (next.time - frame.time),
        frame.curve,
      );
      return {
        x: frame.x + (next.x - frame.x) * progress,
        y: frame.y + (next.y - frame.y) * progress,
      };
    }
  }
  return fallback;
}

function sampleColor(
  frames: readonly ColorKeyframe[],
  time: number,
  fallback: string,
): string {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (time >= frames[index].time) {
      return frames[index].color;
    }
  }
  return fallback;
}

function sampleAttachment(
  frames: readonly AttachmentKeyframe[],
  time: number,
  fallback: string | null,
): string | null {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (time >= frames[index].time) {
      return frames[index].name;
    }
  }
  return fallback;
}

function sampleDrawOrder(
  frames: readonly DrawOrderKeyframe[],
  time: number,
  fallback: readonly string[],
): readonly string[] {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (time >= frames[index].time) {
      return frames[index].slotOrder;
    }
  }
  return [...fallback];
}

function normalizeLoopTime(
  duration: number,
  elapsedSeconds: number,
  loop: boolean,
): number {
  if (duration <= 0) {
    return 0;
  }
  if (!loop) {
    return clamp(elapsedSeconds, 0, duration);
  }
  const wrapped = elapsedSeconds % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}

function easeProgress(progress: number, curve: SpineCurve): number {
  if (curve === "stepped") {
    return 0;
  }
  if (curve === "linear") {
    return progress;
  }
  return evaluateCubicBezier(progress, curve);
}

function evaluateCubicBezier(
  t: number,
  [x1, y1, x2, y2]: readonly [number, number, number, number],
): number {
  const sampleCurveX = (time: number) => {
    const inverse = 1 - time;
    return (
      3 * inverse * inverse * time * x1 +
      3 * inverse * time * time * x2 +
      time * time * time
    );
  };
  const sampleCurveY = (time: number) => {
    const inverse = 1 - time;
    return (
      3 * inverse * inverse * time * y1 +
      3 * inverse * time * time * y2 +
      time * time * time
    );
  };
  const sampleCurveDerivativeX = (time: number) => {
    const inverse = 1 - time;
    return (
      3 * inverse * inverse * x1 +
      6 * inverse * time * (x2 - x1) +
      3 * time * time * (1 - x2)
    );
  };

  let estimate = t;
  for (let index = 0; index < 6; index += 1) {
    const error = sampleCurveX(estimate) - t;
    const derivative = sampleCurveDerivativeX(estimate);
    if (Math.abs(error) < 1e-6 || Math.abs(derivative) < 1e-6) {
      break;
    }
    estimate -= error / derivative;
  }

  return sampleCurveY(clamp(estimate, 0, 1));
}

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > 180) {
    normalized -= 360;
  }
  while (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}

function computeWorldBoneTransforms(
  model: SpineModel,
  localBones: Readonly<Record<string, BonePose>>,
): Readonly<Record<string, WorldTransform>> {
  const worldBones: Record<string, WorldTransform> = {};
  for (const bone of model.bones) {
    const local = localBones[bone.name];
    if (!local) {
      continue;
    }
    const parent = bone.parentName ? worldBones[bone.parentName] : undefined;
    worldBones[bone.name] = composeWorldTransform(local, parent);
  }
  return Object.freeze(worldBones);
}

function composeAttachmentTransform(
  bone: WorldTransform,
  attachment: RegionAttachmentPose,
): WorldTransform {
  return composeWorldTransform(attachment, bone);
}

function composeWorldTransform(
  transform: {
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
    readonly scaleX: number;
    readonly scaleY: number;
    readonly shearX?: number;
    readonly shearY?: number;
  },
  parent?: WorldTransform,
): WorldTransform {
  const localMatrix = createMatrixFromTransform(transform);
  const matrix = parent
    ? multiplyAffineMatrices(parent.matrix, localMatrix)
    : localMatrix;
  return deriveWorldTransform(matrix);
}

function createMatrixFromTransform(transform: {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly shearX?: number;
  readonly shearY?: number;
}): AffineMatrix {
  const shearXRadians =
    (transform.rotation + (transform.shearX ?? 0)) * RADIAN_FACTOR;
  const shearYRadians =
    (transform.rotation + 90 + (transform.shearY ?? 0)) * RADIAN_FACTOR;
  return Object.freeze({
    a: Math.cos(shearXRadians) * transform.scaleX,
    b: Math.sin(shearXRadians) * transform.scaleX,
    c: Math.cos(shearYRadians) * transform.scaleY,
    d: Math.sin(shearYRadians) * transform.scaleY,
    tx: transform.x,
    ty: transform.y,
  });
}

function multiplyAffineMatrices(
  parent: AffineMatrix,
  child: AffineMatrix,
): AffineMatrix {
  return Object.freeze({
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty,
  });
}

function deriveWorldTransform(matrix: AffineMatrix): WorldTransform {
  return Object.freeze({
    x: matrix.tx,
    y: matrix.ty,
    rotation: Math.atan2(matrix.b, matrix.a) / RADIAN_FACTOR,
    scaleX: Math.hypot(matrix.a, matrix.b),
    scaleY:
      Math.sign(matrix.a * matrix.d - matrix.b * matrix.c || 1) *
      Math.hypot(matrix.c, matrix.d),
    matrix,
  });
}

function createSceneMatrix(matrix: AffineMatrix): AffineMatrix {
  return Object.freeze({
    a: matrix.a,
    b: -matrix.b,
    c: -matrix.c,
    d: matrix.d,
    tx: matrix.tx,
    ty: -matrix.ty,
  });
}

function createSlotNode(attachment: RenderableAttachmentPose): SlotDisplayNode {
  if (attachment.kind === "mesh") {
    const geometry = new MeshGeometry({
      positions: new Float32Array(attachment.uvs.length),
      uvs: new Float32Array(attachment.uvs),
      indices: new Uint32Array(attachment.triangles),
    });
    const display = new Mesh({
      geometry,
      texture: Texture.EMPTY,
    });
    display.visible = false;
    return Object.freeze({
      kind: "mesh",
      attachmentName: attachment.name,
      display,
      geometry,
    });
  }

  const display = new Sprite(Texture.EMPTY);
  display.anchor.set(0.5);
  display.visible = false;
  return Object.freeze({
    kind: "region",
    attachmentName: attachment.name,
    display,
  });
}

function applySlotVisual(
  node: SlotDisplayNode,
  slotPose: SlotPose,
  textures: Readonly<Record<string, Texture>>,
): void {
  if (!slotPose.attachmentName || !slotPose.attachment) {
    node.display.visible = false;
    node.display.texture = Texture.EMPTY;
    return;
  }
  if (slotPose.attachment.kind === "clipping") {
    node.display.visible = false;
    node.display.texture = Texture.EMPTY;
    return;
  }
  const texture = textures[slotPose.attachment.textureName];
  if (!texture) {
    node.display.visible = false;
    node.display.texture = Texture.EMPTY;
    return;
  }
  node.display.visible = true;
  node.display.texture = texture;
  const color = parseSpineColor(slotPose.color);
  node.display.tint = color.tint;
  node.display.alpha = color.alpha;
  node.display.blendMode = slotPose.blendMode === "additive" ? "add" : "normal";
}

function computeMeshScenePositions(options: {
  readonly attachment: MeshAttachmentPose;
  readonly model: SpineModel;
  readonly slotBoneName: string;
  readonly worldBones: Readonly<Record<string, WorldTransform>>;
}): Float32Array {
  return computeWeightedScenePositions({
    vertices: options.attachment.vertices,
    model: options.model,
    slotBoneName: options.slotBoneName,
    worldBones: options.worldBones,
  });
}

function computeWeightedScenePositions(options: {
  readonly vertices: readonly (readonly MeshVertexWeight[])[];
  readonly model: SpineModel;
  readonly slotBoneName: string;
  readonly worldBones: Readonly<Record<string, WorldTransform>>;
}): Float32Array {
  const positions = new Float32Array(options.vertices.length * 2);
  const slotBone = options.worldBones[options.slotBoneName];
  if (!slotBone) {
    return positions;
  }
  options.vertices.forEach((weights, index) => {
    let worldX = 0;
    let worldY = 0;
    for (const weight of weights) {
      const bone =
        weight.boneIndex === null
          ? slotBone
          : options.worldBones[
              options.model.bones[weight.boneIndex]?.name ?? ""
            ];
      if (!bone) {
        continue;
      }
      const transformed = transformPoint(bone.matrix, weight.x, weight.y);
      worldX += transformed.x * weight.weight;
      worldY += transformed.y * weight.weight;
    }
    positions[index * 2] = worldX;
    positions[index * 2 + 1] = -worldY;
  });
  return positions;
}

function transformPoint(
  matrix: AffineMatrix,
  x: number,
  y: number,
): { readonly x: number; readonly y: number } {
  return Object.freeze({
    x: matrix.a * x + matrix.c * y + matrix.tx,
    y: matrix.b * x + matrix.d * y + matrix.ty,
  });
}

function createAtlasTextures(
  atlas: SpineAtlasData,
  baseTexture: Texture,
): Readonly<Record<string, Texture>> {
  const textures: Record<string, Texture> = {};
  for (const region of Object.values(atlas.regions)) {
    const packedWidth = region.rotate ? region.size.height : region.size.width;
    const packedHeight = region.rotate ? region.size.width : region.size.height;
    textures[region.name] = new Texture({
      source: baseTexture.source,
      frame: new Rectangle(region.xy.x, region.xy.y, packedWidth, packedHeight),
      orig: new Rectangle(0, 0, region.orig.width, region.orig.height),
      trim: new Rectangle(
        region.offset.x,
        region.orig.height - region.size.height - region.offset.y,
        region.size.width,
        region.size.height,
      ),
      rotate: region.rotate ? 6 : 0,
      label: region.name,
    });
  }
  return Object.freeze(textures);
}

function parseSpineColor(color: string): {
  readonly tint: number;
  readonly alpha: number;
} {
  const normalized = color.trim().toLowerCase();
  const safe = normalized.length === 8 ? normalized : "ffffffff";
  const rgb = Number.parseInt(safe.slice(0, 6), 16);
  const alpha = Number.parseInt(safe.slice(6, 8), 16) / 255;
  return Object.freeze({
    tint: Number.isNaN(rgb) ? 0xffffff : rgb,
    alpha: Number.isNaN(alpha) ? 1 : alpha,
  });
}

function parseAtlasPair(
  value: string | undefined,
  label: string,
): { readonly x: number; readonly y: number } {
  if (!value) {
    throw new Error(`Invalid Spine atlas: missing ${label}.`);
  }
  const [left, right] = value
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10));
  if (!Number.isInteger(left) || !Number.isInteger(right)) {
    throw new Error(`Invalid Spine atlas pair for ${label}.`);
  }
  return Object.freeze({ x: left, y: right });
}

function parseAtlasSize(
  value: string | undefined,
  label: string,
): { readonly width: number; readonly height: number } {
  const pair = parseAtlasPair(value, label);
  return Object.freeze({
    width: pair.x,
    height: pair.y,
  });
}

function assertNumberArray(
  value: readonly number[] | undefined,
  label: string,
): readonly number[] {
  if (!Array.isArray(value) || !value.every((item) => Number.isFinite(item))) {
    throw new Error(`${label} must be a finite number array`);
  }
  return value;
}

function assertRawSpineSkeleton(value: unknown): RawSpineSkeleton {
  if (!value || typeof value !== "object") {
    throw new Error("Spine skeleton must be an object.");
  }
  const raw = value as RawSpineSkeleton;
  if (!Array.isArray(raw.bones) || !Array.isArray(raw.slots)) {
    throw new Error("Spine skeleton is missing bones or slots.");
  }
  if (!raw.animations || typeof raw.animations !== "object") {
    throw new Error("Spine skeleton is missing animations.");
  }
  return raw;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
