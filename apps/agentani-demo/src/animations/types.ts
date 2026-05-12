export type CodeAnimationEffectType =
  | "fadeIn"
  | "fadeOut"
  | "pulse"
  | "starlight"
  | "sweepLight"
  | "swing";

export type CodeBlendMode = "normal" | "add" | "multiply" | "screen";

export interface CodeAnimationStep {
  type: CodeAnimationEffectType;
  startTime: number;
  duration: number;
  params?: Record<string, number | string | boolean>;
}

export interface CodeAnimationLayer {
  id: string;
  type: "pic";
  texture: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  blendMode: CodeBlendMode;
  visible: boolean;
  maskId?: string;
  animations: CodeAnimationStep[];
}

export interface CodeAnimationProject {
  id: string;
  label: string;
  duration: number;
  size: {
    width: number;
    height: number;
  };
  layers: CodeAnimationLayer[];
}

export type AnimationRegistryEntry =
  | {
      id: string;
      label: string;
      status: "ready";
      project: CodeAnimationProject;
    }
  | {
      id: string;
      label: string;
      status: "todo";
    };
