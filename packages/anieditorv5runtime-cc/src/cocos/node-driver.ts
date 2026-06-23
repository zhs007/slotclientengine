import type { CocosBlendModeConfig } from "./blend-mode.js";

export interface V5GSize {
  width: number;
  height: number;
}

export interface V5GCocosNodeDriver<TNode, TSpriteFrame> {
  createNode(name: string): TNode;
  appendChild(parent: TNode, child: TNode): void;
  destroyNode(node: TNode): void;
  setContentSize(node: TNode, width: number, height: number): void;
  setAnchorPoint(node: TNode, x: number, y: number): void;
  setPosition(node: TNode, x: number, y: number): void;
  setScale(node: TNode, x: number, y: number): void;
  setRotationDegrees(node: TNode, degrees: number): void;
  setOpacity(node: TNode, opacity: number): void;
  setActive(node: TNode, active: boolean): void;
  createImageNode(name: string, spriteFrame: TSpriteFrame): TNode;
  getSpriteFrameSize(spriteFrame: TSpriteFrame): V5GSize | null;
  applyBlendMode(node: TNode, config: CocosBlendModeConfig): void;
}
