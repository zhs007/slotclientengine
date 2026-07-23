import type {
  VNICyclicSelectionItem,
  VNIPlayer,
} from "@slotclientengine/vnicore/pixi";

export async function playCyclicSelectionRound(options: {
  player: VNIPlayer;
  animation: { layerId: string; animationId: string };
  initialItems: readonly VNICyclicSelectionItem[];
  requestResult: () => Promise<{
    selectedItem: { readonly key: string } | VNICyclicSelectionItem;
  }>;
}): Promise<void> {
  const session = options.player.createManualPlaybackSession();
  try {
    const cyclic = session
      .getAnimation(options.animation)
      .requireCyclicSelection();
    const preview = cyclic.getAuthoredPreviewDescriptor();
    cyclic.setInitialItems(options.initialItems);

    await session.playRange({ range: preview.introRange }).completed;
    const hold = session.holdTimeline({
      at: preview.continuousHoldPoint,
    });
    cyclic.startContinuousPhase({
      phaseId: preview.continuousPhaseId,
    });

    const result = await options.requestResult();
    await cyclic.prepareSelection(result).committed;

    hold.release();
    cyclic.startResolvePhase();
    await session.playRange({
      range: preview.endingRange,
      preserveRuntimeAnimationState: true,
    }).completed;
  } finally {
    session.destroy();
  }
}
