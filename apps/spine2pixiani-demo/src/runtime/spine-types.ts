export type SpineCurve = "linear" | "stepped" | [number, number, number, number];

export type RawSpineBone = {
  name: string;
  parent?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
};

export type RawSpineSlot = {
  name: string;
  bone: string;
  attachment?: string;
  color?: string;
  blend?: string;
};

export type RawSpineAttachment = {
  name?: string;
  path?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
};

export type RawNumericFrame = {
  time: number;
  curve?: "stepped" | [number, number, number, number];
  angle?: number;
  x?: number;
  y?: number;
};

export type RawAttachmentFrame = {
  time: number;
  name: string | null;
};

export type RawColorFrame = {
  time: number;
  color: string;
  curve?: "stepped" | [number, number, number, number];
};

export type RawBoneTimeline = {
  rotate?: RawNumericFrame[];
  translate?: RawNumericFrame[];
  scale?: RawNumericFrame[];
};

export type RawSlotTimeline = {
  attachment?: RawAttachmentFrame[];
  color?: RawColorFrame[];
};

export type RawSpineAnimation = {
  slots?: Record<string, RawSlotTimeline>;
  bones?: Record<string, RawBoneTimeline>;
};

export type RawSpineSkeleton = {
  skeleton: {
    width?: number;
    height?: number;
    fps?: number;
  };
  bones: RawSpineBone[];
  slots: RawSpineSlot[];
  skins: {
    default: Record<string, Record<string, RawSpineAttachment>>;
  };
  animations: Record<string, RawSpineAnimation>;
};

export type BoneSetup = {
  name: string;
  parentName: string | null;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

export type SlotSetup = {
  name: string;
  boneName: string;
  attachmentName: string | null;
  color: string;
  blendMode: "normal" | "additive";
};

export type AttachmentPose = {
  name: string;
  textureName: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
};

export type NumericKeyframe = {
  time: number;
  value: number;
  curve: SpineCurve;
};

export type VectorKeyframe = {
  time: number;
  x: number;
  y: number;
  curve: SpineCurve;
};

export type ColorKeyframe = {
  time: number;
  color: string;
  curve: SpineCurve;
};

export type AttachmentKeyframe = {
  time: number;
  name: string | null;
};

export type BoneAnimation = {
  rotate: NumericKeyframe[];
  translate: VectorKeyframe[];
  scale: VectorKeyframe[];
};

export type SlotAnimation = {
  attachment: AttachmentKeyframe[];
  color: ColorKeyframe[];
};

export type SpineAnimation = {
  name: string;
  duration: number;
  bones: Record<string, BoneAnimation>;
  slots: Record<string, SlotAnimation>;
};

export type SpineModel = {
  skeleton: {
    width: number;
    height: number;
    fps: number;
  };
  bones: BoneSetup[];
  boneOrder: string[];
  slots: SlotSetup[];
  slotOrder: string[];
  attachments: Record<string, Record<string, AttachmentPose>>;
  attachmentNames: string[];
  animations: Record<string, SpineAnimation>;
};

export type BonePose = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

export type AffineMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
};

export type WorldTransform = BonePose & {
  matrix: AffineMatrix;
};

export type SlotPose = {
  slotName: string;
  boneName: string;
  attachmentName: string | null;
  attachment: AttachmentPose | null;
  color: string;
  blendMode: "normal" | "additive";
};

export type SampledAnimationPose = {
  animationName: string;
  time: number;
  duration: number;
  bones: Record<string, BonePose>;
  slots: Record<string, SlotPose>;
  drawOrder: string[];
};