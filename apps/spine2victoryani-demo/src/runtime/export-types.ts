export type EncodedTimelineFrame = [number, number, number, number, number, number, 0 | 1, number];

export interface EncodedTimelineAnimation {
  kind: "timeline";
  fps: number;
  frames: EncodedTimelineFrame[];
}

export interface ExportedAnimationSummary {
  name: string;
  duration: number;
  fps: number;
  projectPath: string;
  layerCount: number;
}

export interface ExportManifest {
  version: string;
  generatedAt: string;
  defaultAnimation: string;
  stage: {
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
    scale: number;
  };
  source: {
    skeletonWidth: number;
    skeletonHeight: number;
    bones: number;
    slots: number;
    attachments: number;
  };
  assetCount: number;
  animations: ExportedAnimationSummary[];
  mirrorChecks: Array<{
    leftLayerId: string;
    rightLayerId: string;
  }>;
}
