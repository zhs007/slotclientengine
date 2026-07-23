import "./styles.css";

export {
  compileSlotRoundExecutionPlan,
  createGameConfig,
} from "@slotclientengine/logiccore";
export type {
  SlotRoundCapability,
  SlotRoundCompileContext,
  SlotRoundDropdownStepPlan,
  SlotRoundExecutionPlan,
  SlotRoundExecutionStep,
  SlotRoundMovementPlan,
  SlotRoundOccurrence,
  SlotRoundOccurrenceSnapshot,
  SlotRoundPosition,
  SlotRoundPresentationValue,
  SlotRoundRefillStepPlan,
  SlotRoundValueMatrix,
  SlotRoundWinGroupPlan,
  SlotRoundWinStepPlan,
} from "@slotclientengine/logiccore";
export { createSlotGameFramework, buildSpinParams } from "./framework.js";
export {
  SlotGameConfigError,
  SlotGameRuntimeError,
  toSlotGameError,
} from "./errors.js";
export { SlotGameStateStore } from "./state.js";
export {
  SlotGameLiveSession,
  createSlotcraftClientOptions,
  prepareSlotGameLiveSession,
  requireFiniteBalance,
  validateLiveServerUrl,
} from "./session.js";
export {
  createSlotGameLogicResult,
  type SlotGameLogicResult,
} from "./logic-result.js";
export {
  createSlotGameRoundContext,
  type SlotGameRoundContext,
} from "./round-context.js";
export { shouldCollectFinalResult } from "./collect.js";
export {
  findComponentSteps,
  getComponentOtherScenesByName,
  getComponentResultsByName,
  getComponentScenesByName,
  getComponentWinResultGroupsByName,
} from "./component-helpers.js";
export type {
  ComponentWinResultGroup,
  ComponentWinResultPositionValidationContext,
  ComponentWinResultPositionValidator,
  GameConfigPaytableEntry,
  GameLogic,
  GameLogicMeta,
  GameLogicStep,
  LogicGameConfig,
  LogicComponent,
  LogicReels,
  OtherSceneMatrix,
  ReelStopYOptions,
  SceneMatrix,
  SlotGameAdapter,
  SlotGameBetOption,
  SlotGameClientFactory,
  SlotGameClientLike,
  SlotGameFocusFramePolicy,
  SlotGameFramePolicy,
  SlotGameFramework,
  SlotGameFrameworkOptions,
  SlotGameInitialState,
  SlotGameLiveConfig,
  SlotGameLiveSessionLike,
  SlotGameLogicFactory,
  SlotGameMaximizedFocusFramePolicy,
  SlotGameMountContext,
  SlotGameSpinRequest,
  SlotGameSpinState,
  SlotGameStateSnapshot,
  SlotGameUi,
  SlotGameUiCommands,
  SlotGameUiCreateContext,
  SlotGameUiElements,
  SlotGameUiFactory,
  SlotGameViewportListener,
  SlotGameViewportSnapshot,
  WinResult,
  WinResultPosition,
} from "./types.js";
export {
  createSceneLayoutSlotGameTemplate,
  getServerBetMethodComponentCatalog,
  inspectSceneLayoutPackageInput,
  inspectSceneLayoutTemplateInputs,
  parseSceneLayoutSlotTemplateConfig,
  parseServerGameAuthoringSummary,
  suggestSlotRoundFlow,
  validateSlotRoundFlowCatalogCompatibility,
} from "./scene-layout-template/index.js";
export type {
  SceneLayoutSlotTemplateConfigV1,
  SceneLayoutTemplateCredential,
  SceneLayoutTemplateReadinessSnapshot,
  ServerGameAuthoringSummary,
  SlotRoundFlowProfileV1,
  SlotRoundFlowSuggestions,
  SlotTemplatePresentationProfileV1,
} from "./scene-layout-template/index.js";
