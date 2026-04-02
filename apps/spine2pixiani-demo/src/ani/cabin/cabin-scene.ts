import { Container, Texture } from "pixi.js";
import { applySlotVisual, createSlotSprite } from "../../runtime/display-factory.js";
import {
  composeAttachmentTransform,
  computeWorldBoneTransforms,
  sampleAnimationPose
} from "../../runtime/timeline-sampler.js";
import type { SampledAnimationPose, SpineModel } from "../../runtime/spine-types.js";

export class CabinScene {
  readonly view = new Container();
  private boneLayer = new Container();
  private slotLayer = new Container();
  private boneNodes = new Map<string, Container>();
  private slotNodes = new Map<string, ReturnType<typeof createSlotSprite>>();

  constructor(
    private readonly model: SpineModel,
    private readonly textures: Record<string, Texture>
  ) {
    this.view.addChild(this.boneLayer);
    this.view.addChild(this.slotLayer);
    this.createBones();
    this.createSlots();
  }

  private createBones() {
    for (const bone of this.model.bones) {
      const node = new Container();
      node.name = bone.name;
      this.boneNodes.set(bone.name, node);
    }

    for (const bone of this.model.bones) {
      const node = this.boneNodes.get(bone.name);
      if (!node) {
        continue;
      }
      if (!bone.parentName) {
        this.boneLayer.addChild(node);
        continue;
      }

      const parent = this.boneNodes.get(bone.parentName);
      parent?.addChild(node);
    }
  }

  private createSlots() {
    for (const slotName of this.model.slotOrder) {
      const sprite = createSlotSprite(Texture.EMPTY);
      this.slotNodes.set(slotName, sprite);
      this.slotLayer.addChild(sprite);
    }
  }

  applyPose(pose: SampledAnimationPose) {
    for (const bone of this.model.bones) {
      const node = this.boneNodes.get(bone.name);
      const local = pose.bones[bone.name];
      if (!node || !local) {
        continue;
      }
      node.position.set(local.x, -local.y);
      node.rotation = (-local.rotation * Math.PI) / 180;
      node.scale.set(local.scaleX, local.scaleY);
    }

    const worldBones = computeWorldBoneTransforms(this.model, pose.bones);
    for (const slotName of pose.drawOrder) {
      const slotPose = pose.slots[slotName];
      const sprite = this.slotNodes.get(slotName);
      if (!slotPose || !sprite) {
        continue;
      }

      applySlotVisual(sprite, slotPose, this.textures);
      if (!slotPose.attachment) {
        continue;
      }

      const world = composeAttachmentTransform(worldBones[slotPose.boneName], slotPose.attachment);
      sprite.position.set(world.x, -world.y);
      sprite.rotation = (-world.rotation * Math.PI) / 180;
      sprite.scale.set(world.scaleX, world.scaleY);
    }
  }

  reset(animationName = "cabin") {
    this.applyPose(sampleAnimationPose(this.model, animationName, 0, true));
  }
}