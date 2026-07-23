import type { CocosBlendModeConfig } from "./blend-mode.js";

export interface V5GSize {
  width: number;
  height: number;
}

export interface V5GSpriteFrameRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface V5GCocosLineSample {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  opacity: number;
}

export type V5GCocosNodeTransformSnapshot = unknown;

export interface V5GCocosNodeCaptureOptions<TNode> {
  readonly node: TNode;
  readonly width: number;
  readonly height: number;
  readonly revision?: string | number;
}

export interface V5GCocosCapturedNodeVisual<TSpriteFrame> {
  readonly spriteFrame: TSpriteFrame;
  readonly width: number;
  readonly height: number;
  release(): void;
}

export interface V5GCocosNodeDriver<TNode, TSpriteFrame> {
  createNode(name: string): TNode;
  appendChild(parent: TNode, child: TNode): void;
  removeChild(parent: TNode, child: TNode): void;
  isValidNode?(node: TNode): boolean;
  getParent(node: TNode): TNode | null;
  captureLocalTransform(node: TNode): V5GCocosNodeTransformSnapshot;
  restoreLocalTransform(
    node: TNode,
    snapshot: V5GCocosNodeTransformSnapshot,
  ): void;
  captureWorldTransform(node: TNode): V5GCocosNodeTransformSnapshot;
  restoreWorldTransform(
    node: TNode,
    snapshot: V5GCocosNodeTransformSnapshot,
  ): void;
  destroyNode(node: TNode): void;
  setContentSize(node: TNode, width: number, height: number): void;
  setAnchorPoint(node: TNode, x: number, y: number): void;
  setPosition(node: TNode, x: number, y: number): void;
  setScale(node: TNode, x: number, y: number): void;
  setRotationDegrees(node: TNode, degrees: number): void;
  setOpacity(node: TNode, opacity: number): void;
  setActive(node: TNode, active: boolean): void;
  createImageNode(name: string, spriteFrame: TSpriteFrame): TNode;
  setImageSpriteFrame?(node: TNode, spriteFrame: TSpriteFrame): void;
  setImageColor?(node: TNode, red: number, green: number, blue: number): void;
  createSpriteFrameRegion?(
    spriteFrame: TSpriteFrame,
    region: V5GSpriteFrameRegion,
  ): TSpriteFrame;
  destroySpriteFrameRegion?(spriteFrame: TSpriteFrame): void;
  captureNodeVisual?(
    options: V5GCocosNodeCaptureOptions<TNode>,
  ):
    | V5GCocosCapturedNodeVisual<TSpriteFrame>
    | Promise<V5GCocosCapturedNodeVisual<TSpriteFrame>>;
  setSiblingIndex?(node: TNode, index: number): void;
  createLineNode?(name: string): TNode;
  updateLines?(node: TNode, lines: readonly V5GCocosLineSample[]): void;
  applyLineBlendMode?(node: TNode, config: CocosBlendModeConfig): void;
  createTextNode(name: string, text: string): TNode;
  setText(node: TNode, text: string): void;
  getSpriteFrameSize(spriteFrame: TSpriteFrame): V5GSize | null;
  applyBlendMode(node: TNode, config: CocosBlendModeConfig): void;
  createAlphaMaskNode?(
    name: string,
    sourceNode: TNode,
    targetNode: TNode,
  ): TNode;
  updateAlphaMaskNode?(
    maskNode: TNode,
    sourceNode: TNode,
    targetNode: TNode,
  ): void;
  clearAlphaMask?(targetNode: TNode, maskNode: TNode): void;
}
