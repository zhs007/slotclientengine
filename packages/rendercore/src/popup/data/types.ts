export type PopupSegment = "start" | "loop" | "end";
export type AwardTierId =
  | "base"
  | "standard"
  | "bigwin"
  | "superwin"
  | "megawin";
export type PopupVisibilityState = AwardTierId | PopupSegment | "active";

export interface PopupAudioCueV1 {
  readonly effect: string;
  readonly target:
    | { readonly kind: "segment"; readonly segment: PopupSegment }
    | { readonly kind: "award-tier"; readonly tier: AwardTierId };
}

export interface PopupAudioV1 {
  readonly version: 1;
  readonly effects: readonly import("@slotclientengine/audiocore/data").AudioEffectBindingV1[];
  readonly cues: readonly PopupAudioCueV1[];
}

export interface PopupAmountFormat {
  readonly rawScale: number;
  readonly fractionDigits: number;
  readonly useGrouping: boolean;
  readonly groupSeparator: string;
  readonly decimalSeparator: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly rounding: "floor";
}

export type PopupAmountFormatter = (amountRaw: number) => string;

export type PopupResourceSpec =
  | { readonly kind: "image"; readonly path: string; readonly size: PopupSize }
  | { readonly kind: "font"; readonly path: string }
  | { readonly kind: "image-string"; readonly manifest: string }
  | { readonly kind: "vni"; readonly project: string }
  | { readonly kind: "popup-object"; readonly manifest: string }
  | {
      readonly kind: "spine";
      readonly skeleton: string;
      readonly atlas: string;
      readonly textures: Readonly<Record<string, string>>;
    };

export interface PopupSize {
  readonly width: number;
  readonly height: number;
}
export interface PopupTransform {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation?: number;
}
export interface PopupOverlayTransform extends PopupTransform {
  readonly rotation: number;
}
export interface PopupAnchor {
  readonly x: number;
  readonly y: number;
}
export interface PopupLayerBase {
  readonly id: string;
  readonly order: number;
  readonly transform: PopupTransform;
  readonly alpha?: number;
  readonly attachment?: PopupLayerAttachment;
  readonly visibleStates?: readonly PopupVisibilityState[];
}
export interface PopupGradientStop {
  readonly offset: number;
  readonly color: string;
}
export type PopupTextFill =
  | { readonly kind: "solid"; readonly color: string }
  | {
      readonly kind: "linear-gradient";
      readonly angleDegrees: number;
      readonly stops: readonly PopupGradientStop[];
    };
export interface PopupTextWidthRange {
  readonly minWidth: number;
  readonly maxWidth: number;
}
export interface PopupTextStyle {
  readonly fontSize: number;
  readonly letterSpacing: number;
  readonly fill: PopupTextFill;
  readonly stroke?: { readonly color: string; readonly width: number };
  readonly shadow?: {
    readonly color: string;
    readonly alpha: number;
    readonly blur: number;
    readonly distance: number;
    readonly angleDegrees: number;
  };
  readonly arcDegrees: number;
  /** Popup v9 only. Legacy source versions omit this field. */
  readonly widthRange?: PopupTextWidthRange;
}
export type PopupTextStyleV9 = Omit<PopupTextStyle, "widthRange"> & {
  readonly widthRange: PopupTextWidthRange;
};
export type PopupImageStringParent =
  | { readonly kind: "popup-root" }
  | {
      readonly kind: "vni-text-layer";
      readonly vniLayerId: string;
      readonly textLayerId: string;
    };
export type PopupSpineSlotTarget =
  | { readonly kind: "layer"; readonly layerId: string }
  | { readonly kind: "main-spine" };
export type PopupLayerAttachment =
  | { readonly kind: "popup-root" }
  | {
      readonly kind: "vni-text-layer";
      readonly vniLayerId: string;
      readonly textLayerId: string;
    }
  | {
      readonly kind: "spine-slot";
      readonly target: PopupSpineSlotTarget;
      readonly slot: string;
    };
export type PopupVniPlayback =
  | {
      readonly mode: "segmented";
      readonly loopStartTime: number;
      readonly loopEndTime: number;
      readonly keepParticlesAlive: boolean;
    }
  | {
      readonly mode: "once";
    };

export interface PopupSingleStateSpineAutoplay {
  readonly animation: string;
  readonly loop: boolean;
}

export interface PopupObjectInstanceLayerBase {
  readonly id: string;
  readonly kind: "popup-object";
  readonly order: number;
  readonly resource: string;
  readonly transform: PopupTransform;
  readonly alpha: number;
  readonly attachment: PopupLayerAttachment;
}

export type AwardPopupObjectLayerV9 = PopupObjectInstanceLayerBase;
export type SpinePopupObjectLayerV9 = Omit<
  PopupObjectInstanceLayerBase,
  "transform"
> & {
  readonly transform: PopupOverlayTransform;
  readonly visibleStates: readonly PopupSegment[];
};
export type SingleStatePopupObjectLayerV9 = Omit<
  PopupObjectInstanceLayerBase,
  "transform"
> & {
  readonly transform: PopupOverlayTransform;
};

export type SingleStatePopupLayerV8 =
  | {
      readonly id: string;
      readonly kind: "image";
      readonly order: number;
      readonly resource: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha: number;
      readonly attachment: PopupLayerAttachment;
      readonly anchor: PopupAnchor;
    }
  | {
      readonly id: string;
      readonly kind: "image-string";
      readonly order: number;
      readonly resource: string;
      readonly defaultText: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha: number;
      readonly attachment: PopupLayerAttachment;
      readonly anchor: PopupAnchor;
    }
  | {
      readonly id: string;
      readonly kind: "text";
      readonly order: number;
      readonly resource?: string;
      readonly defaultText: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha: number;
      readonly attachment: PopupLayerAttachment;
      readonly anchor: PopupAnchor;
      readonly style: PopupTextStyle;
    }
  | {
      readonly id: string;
      readonly kind: "vni";
      readonly order: number;
      readonly resource: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha: number;
      readonly attachment: PopupLayerAttachment;
      readonly autoplay?: PopupVniPlayback;
    }
  | {
      readonly id: string;
      readonly kind: "spine";
      readonly order: number;
      readonly resource: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha: number;
      readonly attachment: PopupLayerAttachment;
      readonly autoplay?: PopupSingleStateSpineAutoplay;
    }
  | {
      readonly id: string;
      readonly kind: "popup-object";
      readonly order: number;
      readonly resource: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha: number;
      readonly attachment: PopupLayerAttachment;
    };
export type PopupLayer =
  | (PopupLayerBase & {
      readonly kind: "image";
      readonly resource: string;
      readonly anchor: PopupAnchor;
      readonly visibleSegments?: readonly PopupSegment[];
    })
  | (PopupLayerBase & {
      readonly kind: "image-string";
      readonly resource: string;
      readonly name?: string;
      readonly binding: "win-amount" | "manual";
      readonly defaultText?: string;
      readonly anchor: PopupAnchor;
      readonly parent?: PopupImageStringParent;
      readonly visibleSegments?: readonly PopupSegment[];
    })
  | (PopupLayerBase & {
      readonly kind: "text";
      readonly resource?: string;
      readonly name: string;
      readonly defaultText: string;
      readonly anchor: PopupAnchor;
      readonly style: PopupTextStyle;
      readonly visibleSegments?: readonly PopupSegment[];
    })
  | (PopupLayerBase & {
      readonly kind: "vni";
      readonly resource: string;
      readonly playback: PopupVniPlayback;
    })
  | (PopupLayerBase & {
      readonly kind: "spine";
      readonly resource: string;
      readonly playback: {
        readonly mode: "segmented-animations";
        readonly startAnimation: string;
        readonly loopAnimation: string;
        readonly endAnimation: string;
      };
    })
  | (PopupLayerBase & {
      readonly kind: "popup-object";
      readonly resource: string;
    });

export type PopupOverlayLayer =
  | {
      readonly id: string;
      readonly kind: "image";
      readonly order: number;
      readonly resource: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha?: number;
      readonly attachment?: PopupLayerAttachment;
      readonly visibleStates?: readonly PopupVisibilityState[];
      readonly anchor: PopupAnchor;
      readonly visibleSegments?: readonly PopupSegment[];
    }
  | {
      readonly id: string;
      readonly kind: "image-string";
      readonly name: string;
      readonly binding: "manual";
      readonly defaultText: string;
      readonly order: number;
      readonly resource: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha?: number;
      readonly attachment?: PopupLayerAttachment;
      readonly visibleStates?: readonly PopupVisibilityState[];
      readonly anchor: PopupAnchor;
      readonly visibleSegments?: readonly PopupSegment[];
    }
  | {
      readonly id: string;
      readonly kind: "text";
      readonly name: string;
      readonly defaultText: string;
      readonly order: number;
      readonly resource?: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha?: number;
      readonly attachment?: PopupLayerAttachment;
      readonly visibleStates?: readonly PopupVisibilityState[];
      readonly anchor: PopupAnchor;
      readonly style: PopupTextStyle;
      readonly visibleSegments?: readonly PopupSegment[];
    }
  | {
      readonly id: string;
      readonly kind: "vni";
      readonly order: number;
      readonly resource: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha?: number;
      readonly attachment?: PopupLayerAttachment;
      readonly visibleStates?: readonly PopupVisibilityState[];
      readonly playback: PopupVniPlayback;
    }
  | {
      readonly id: string;
      readonly kind: "spine";
      readonly order: number;
      readonly resource: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha?: number;
      readonly attachment?: PopupLayerAttachment;
      readonly visibleStates?: readonly PopupVisibilityState[];
      readonly playback: {
        readonly mode: "segmented-animations";
        readonly startAnimation: string;
        readonly loopAnimation: string;
        readonly endAnimation: string;
      };
    }
  | {
      readonly id: string;
      readonly kind: "popup-object";
      readonly order: number;
      readonly resource: string;
      readonly transform: PopupOverlayTransform;
      readonly alpha?: number;
      readonly attachment?: PopupLayerAttachment;
      readonly visibleStates?: readonly PopupVisibilityState[];
      readonly visibleSegments?: readonly PopupSegment[];
    };

export interface PopupPromptSpec {
  readonly font?: string;
  readonly defaultText: string;
  readonly fill: string;
  readonly order: number;
  readonly area: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface AwardTierPresentation {
  readonly countDurationSeconds: number;
  readonly layers: readonly PopupLayer[];
}
export interface AwardCelebrationTier extends AwardTierPresentation {
  readonly id: "bigwin" | "superwin" | "megawin";
  readonly thresholdMultiplier: number;
}
export interface AwardCelebrationSpec {
  readonly base: AwardTierPresentation;
  readonly standard: AwardTierPresentation;
  readonly celebrationTiers: readonly AwardCelebrationTier[];
}

export interface PopupManifestBaseV1 {
  readonly version: 1;
  readonly kind: "popup";
  readonly id: string;
  readonly designViewport: PopupSize;
  readonly resources: Readonly<Record<string, PopupResourceSpec>>;
}

export interface AwardCelebrationPopupManifestV1 extends PopupManifestBaseV1 {
  readonly type: "award-celebration";
  readonly amountFormat: PopupAmountFormat;
  readonly awardCelebration: AwardCelebrationSpec;
}

export interface SpinePopupManifestV1 extends PopupManifestBaseV1 {
  readonly type: "spine";
  readonly spine: {
    readonly resource: string;
    readonly transform: PopupTransform;
    readonly playback: {
      readonly mode: "segmented-animations";
      readonly startAnimation: string;
      readonly loopAnimation: string;
      readonly endAnimation: string;
    };
    readonly prompt?: PopupPromptSpec;
    readonly overlays?: readonly PopupOverlayLayer[];
  };
}

export type PopupManifestV1 =
  | AwardCelebrationPopupManifestV1
  | SpinePopupManifestV1;

export interface PopupFocusExtent {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface PopupAdaptationV2 {
  readonly mode: "maximized-focus";
  readonly focus: PopupFocusExtent;
}

export interface PopupBackdropV2 {
  readonly enabled: boolean;
  readonly color: string;
  readonly alpha: number;
}

export interface PopupManifestBaseV2 {
  readonly version: 2;
  readonly kind: "popup";
  readonly id: string;
  readonly name: string;
  readonly designViewport: PopupSize;
  readonly adaptation: PopupAdaptationV2;
  readonly backdrop: PopupBackdropV2;
  readonly resources: Readonly<Record<string, PopupResourceSpec>>;
}

export interface AwardCelebrationPopupManifestV2 extends PopupManifestBaseV2 {
  readonly type: "award-celebration";
  readonly amountFormat: PopupAmountFormat;
  readonly awardCelebration: AwardCelebrationSpec;
}

export interface SpinePopupManifestV2 extends PopupManifestBaseV2 {
  readonly type: "spine";
  readonly spine: SpinePopupManifestV1["spine"];
}

export type PopupManifestV2 =
  | AwardCelebrationPopupManifestV2
  | SpinePopupManifestV2;

export interface PopupAdaptationV3 {
  readonly mode: "maximized-focus";
  readonly focus: PopupFocusExtent;
}

export interface PopupBackdropV3 {
  readonly enabled: boolean;
  readonly color: string;
  readonly alpha: number;
}

export interface PopupBackdropV5<State extends PopupVisibilityState> {
  readonly enabled: boolean;
  readonly color: string;
  readonly alpha: number;
  readonly visibleStates: readonly State[];
}

export interface PopupManifestBaseV3 {
  readonly version: 3;
  readonly kind: "popup";
  readonly id: string;
  readonly name: string;
  readonly adaptation: PopupAdaptationV3;
  readonly backdrop: PopupBackdropV3;
  readonly resources: Readonly<Record<string, PopupResourceSpec>>;
}

export interface AwardCelebrationPopupManifestV3 extends PopupManifestBaseV3 {
  readonly type: "award-celebration";
  readonly amountFormat: PopupAmountFormat;
  readonly awardCelebration: AwardCelebrationSpec;
}

export interface SpinePopupManifestV3 extends PopupManifestBaseV3 {
  readonly type: "spine";
  readonly spine: Omit<SpinePopupManifestV1["spine"], "prompt"> & {
    readonly prompt?: never;
  };
}

export type PopupManifestV3 =
  | AwardCelebrationPopupManifestV3
  | SpinePopupManifestV3;

export type PopupLayerV4 = PopupLayer & {
  readonly attachment: PopupLayerAttachment;
};
export type PopupOverlayLayerV4 = PopupOverlayLayer & {
  readonly attachment: PopupLayerAttachment;
};
export interface AwardTierPresentationV4 {
  readonly countDurationSeconds: number;
  readonly layers: readonly PopupLayerV4[];
}
export interface AwardCelebrationTierV4 extends AwardTierPresentationV4 {
  readonly id: "bigwin" | "superwin" | "megawin";
  readonly thresholdMultiplier: number;
}
export interface AwardCelebrationSpecV4 {
  readonly base: AwardTierPresentationV4;
  readonly standard: AwardTierPresentationV4;
  readonly celebrationTiers: readonly AwardCelebrationTierV4[];
}
export interface PopupManifestBaseV4 {
  readonly version: 4;
  readonly kind: "popup";
  readonly id: string;
  readonly name: string;
  readonly adaptation: PopupAdaptationV3;
  readonly backdrop: PopupBackdropV3;
  readonly resources: Readonly<Record<string, PopupResourceSpec>>;
}
export interface AwardCelebrationPopupManifestV4 extends PopupManifestBaseV4 {
  readonly type: "award-celebration";
  readonly amountFormat: PopupAmountFormat;
  readonly awardCelebration: AwardCelebrationSpecV4;
}
export interface SpinePopupManifestV4 extends PopupManifestBaseV4 {
  readonly type: "spine";
  readonly spine: Omit<SpinePopupManifestV1["spine"], "prompt" | "overlays"> & {
    readonly prompt?: never;
    readonly overlays?: readonly PopupOverlayLayerV4[];
  };
}
export type PopupManifestV4 =
  | AwardCelebrationPopupManifestV4
  | SpinePopupManifestV4;

type WithVisibleStates<
  Layer,
  State extends PopupVisibilityState,
> = Layer extends unknown
  ? Omit<Layer, "visibleSegments"> & {
      readonly visibleStates: readonly State[];
    }
  : never;

export type AwardPopupLayerV5 = WithVisibleStates<PopupLayerV4, AwardTierId>;
export type SpinePopupOverlayLayerV5 = WithVisibleStates<
  PopupOverlayLayerV4,
  PopupSegment
>;
export interface AwardTierPresentationV5 {
  readonly countDurationSeconds: number;
  readonly layers: readonly AwardPopupLayerV5[];
}
export interface AwardCelebrationTierV5 extends AwardTierPresentationV5 {
  readonly id: "bigwin" | "superwin" | "megawin";
  readonly thresholdMultiplier: number;
}
export interface AwardCelebrationSpecV5 {
  readonly base: AwardTierPresentationV5;
  readonly standard: AwardTierPresentationV5;
  readonly celebrationTiers: readonly AwardCelebrationTierV5[];
}
interface PopupManifestBaseV5<State extends PopupVisibilityState> {
  readonly version: 5;
  readonly kind: "popup";
  readonly id: string;
  readonly name: string;
  readonly adaptation: PopupAdaptationV3;
  readonly backdrop: PopupBackdropV5<State>;
  readonly resources: Readonly<Record<string, PopupResourceSpec>>;
}
export interface AwardCelebrationPopupManifestV5 extends PopupManifestBaseV5<AwardTierId> {
  readonly type: "award-celebration";
  readonly amountFormat: PopupAmountFormat;
  readonly awardCelebration: AwardCelebrationSpecV5;
}
export interface SpinePopupManifestV5 extends PopupManifestBaseV5<PopupSegment> {
  readonly type: "spine";
  readonly spine: Omit<SpinePopupManifestV4["spine"], "overlays"> & {
    readonly overlays?: readonly SpinePopupOverlayLayerV5[];
  };
}
export type PopupManifestV5 =
  | AwardCelebrationPopupManifestV5
  | SpinePopupManifestV5;

type WithoutLayerVisibility<Layer> = Layer extends unknown
  ? Omit<Layer, "visibleSegments" | "visibleStates">
  : never;

export type AwardPopupLayerV6 = WithoutLayerVisibility<PopupLayerV4>;
export type SpinePopupOverlayLayerV6 = WithVisibleStates<
  PopupOverlayLayerV4,
  PopupSegment
>;
export interface AwardTierPresentationV6 {
  readonly countDurationSeconds: number;
  readonly layers: readonly AwardPopupLayerV6[];
}
export interface AwardCelebrationTierV6 extends AwardTierPresentationV6 {
  readonly id: "bigwin" | "superwin" | "megawin";
  readonly thresholdMultiplier: number;
}
export interface AwardCelebrationSpecV6 {
  readonly base: AwardTierPresentationV6;
  readonly standard: AwardTierPresentationV6;
  readonly celebrationTiers: readonly AwardCelebrationTierV6[];
}
interface PopupManifestBaseV6<State extends PopupVisibilityState> {
  readonly version: 6;
  readonly kind: "popup";
  readonly id: string;
  readonly name: string;
  readonly adaptation: PopupAdaptationV3;
  readonly backdrop: PopupBackdropV5<State>;
  readonly resources: Readonly<Record<string, PopupResourceSpec>>;
}
export interface AwardCelebrationPopupManifestV6 extends PopupManifestBaseV6<AwardTierId> {
  readonly type: "award-celebration";
  readonly amountFormat: PopupAmountFormat;
  readonly awardCelebration: AwardCelebrationSpecV6;
}
export interface SpinePopupManifestV6 extends PopupManifestBaseV6<PopupSegment> {
  readonly type: "spine";
  readonly spine: Omit<SpinePopupManifestV5["spine"], "overlays"> & {
    readonly overlays?: readonly SpinePopupOverlayLayerV6[];
  };
}
export type PopupManifestV6 =
  | AwardCelebrationPopupManifestV6
  | SpinePopupManifestV6;

interface PopupManifestBaseV7<State extends PopupVisibilityState> extends Omit<
  PopupManifestBaseV6<State>,
  "version"
> {
  readonly version: 7;
  readonly audio: PopupAudioV1;
}
export interface AwardCelebrationPopupManifestV7 extends PopupManifestBaseV7<AwardTierId> {
  readonly type: "award-celebration";
  readonly amountFormat: PopupAmountFormat;
  readonly awardCelebration: AwardCelebrationSpecV6;
}
export interface SpinePopupManifestV7 extends PopupManifestBaseV7<PopupSegment> {
  readonly type: "spine";
  readonly spine: SpinePopupManifestV6["spine"];
}
export type PopupManifestV7 =
  | AwardCelebrationPopupManifestV7
  | SpinePopupManifestV7;

interface PopupManifestBaseV8<State extends PopupVisibilityState> extends Omit<
  PopupManifestBaseV7<State>,
  "version"
> {
  readonly version: 8;
}
export interface AwardCelebrationPopupManifestV8 extends PopupManifestBaseV8<AwardTierId> {
  readonly type: "award-celebration";
  readonly amountFormat: PopupAmountFormat;
  readonly awardCelebration: AwardCelebrationSpecV6;
}
export interface SpinePopupManifestV8 extends PopupManifestBaseV8<PopupSegment> {
  readonly type: "spine";
  readonly spine: SpinePopupManifestV6["spine"];
}
export interface SingleStatePopupManifestV8 extends PopupManifestBaseV8<"active"> {
  readonly type: "single-state";
  readonly singleState: {
    readonly layers: readonly SingleStatePopupLayerV8[];
  };
}
export type PopupManifestV8 =
  | AwardCelebrationPopupManifestV8
  | SpinePopupManifestV8
  | SingleStatePopupManifestV8;

type WithPopupTextStyleV9<Layer> = Layer extends {
  readonly kind: "text";
  readonly style: PopupTextStyle;
}
  ? Omit<Layer, "style"> & { readonly style: PopupTextStyleV9 }
  : Layer;

export type AwardPopupLayerV9 =
  | WithPopupTextStyleV9<AwardPopupLayerV6>
  | AwardPopupObjectLayerV9;
export type SpinePopupOverlayLayerV9 =
  | WithPopupTextStyleV9<SpinePopupOverlayLayerV6>
  | SpinePopupObjectLayerV9;
export type SingleStatePopupLayerV9 =
  | WithPopupTextStyleV9<SingleStatePopupLayerV8>
  | SingleStatePopupObjectLayerV9;

export type PopupObjectLayerV1 = Exclude<
  SingleStatePopupLayerV9,
  { readonly kind: "popup-object" }
>;
export type PopupObjectResourceSpecV1 = Exclude<
  PopupResourceSpec,
  { readonly kind: "popup-object" }
>;
export interface PopupObjectManifestV1 {
  readonly version: 1;
  readonly kind: "popup-object";
  readonly name: string;
  readonly resources: Readonly<Record<string, PopupObjectResourceSpecV1>>;
  readonly layers: readonly PopupObjectLayerV1[];
}
export interface AwardTierPresentationV9 {
  readonly countDurationSeconds: number;
  readonly layers: readonly AwardPopupLayerV9[];
}
export interface AwardCelebrationTierV9 extends AwardTierPresentationV9 {
  readonly id: "bigwin" | "superwin" | "megawin";
  readonly thresholdMultiplier: number;
}
export interface AwardCelebrationSpecV9 {
  readonly base: AwardTierPresentationV9;
  readonly standard: AwardTierPresentationV9;
  readonly celebrationTiers: readonly AwardCelebrationTierV9[];
}
interface PopupManifestBaseV9<State extends PopupVisibilityState> extends Omit<
  PopupManifestBaseV8<State>,
  "version"
> {
  readonly version: 9;
}
export interface AwardCelebrationPopupManifestV9 extends PopupManifestBaseV9<AwardTierId> {
  readonly type: "award-celebration";
  readonly amountFormat: PopupAmountFormat;
  readonly awardCelebration: AwardCelebrationSpecV9;
}
export interface SpinePopupManifestV9 extends PopupManifestBaseV9<PopupSegment> {
  readonly type: "spine";
  readonly spine: Omit<SpinePopupManifestV8["spine"], "overlays"> & {
    readonly overlays?: readonly SpinePopupOverlayLayerV9[];
  };
}
export interface SingleStatePopupManifestV9 extends PopupManifestBaseV9<"active"> {
  readonly type: "single-state";
  readonly singleState: {
    readonly layers: readonly SingleStatePopupLayerV9[];
  };
}
export type PopupManifestV9 =
  | AwardCelebrationPopupManifestV9
  | SpinePopupManifestV9
  | SingleStatePopupManifestV9;

export type PopupManifest =
  | PopupManifestV1
  | PopupManifestV2
  | PopupManifestV3
  | PopupManifestV4
  | PopupManifestV5
  | PopupManifestV6
  | PopupManifestV7
  | PopupManifestV8
  | PopupManifestV9;
