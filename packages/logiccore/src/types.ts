export type SceneMatrix = readonly (readonly number[])[];

export interface GameLogicMeta {
  readonly msgid?: string;
  readonly gamemodulename?: string;
  readonly gameid?: number;
  readonly playIndex?: number;
  readonly playwin?: number;
  readonly maxWinLimit?: number;
  readonly bet: number;
  readonly lines: number;
  readonly totalwin: number;
}

export interface ParsedGameLogicMeta {
  readonly msgid: 'gamemoduleinfo';
  readonly gamemodulename?: string;
  readonly gameid?: number;
  readonly playIndex?: number;
  readonly playwin?: number;
  readonly maxWinLimit?: number;
  readonly bet: number;
  readonly lines: number;
  readonly totalwin: number;
}

export interface WinResult extends Readonly<Record<string, unknown>> {
  readonly pos: readonly number[];
  readonly coinWin?: number;
  readonly cashWin?: number;
}

export interface BasicComponentData extends Readonly<Record<string, unknown>> {
  readonly usedScenes: readonly number[];
  readonly usedResults: readonly number[];
}

export interface LogicComponent {
  readonly name: string;
  readonly raw: unknown;
  readonly hasBasicComponentData: boolean;
  readonly basicComponentData?: BasicComponentData;
  readonly usedSceneIndexes: readonly number[];
  readonly usedResultIndexes: readonly number[];
}

export interface GameLogic {
  getGameModuleName(): string | undefined;
  getGameId(): number | undefined;
  getBet(): number;
  getLines(): number;
  getTotalWin(): number;
  getPlayWin(): number | undefined;
  getRawMessage(): unknown;
  getRawGmi(): unknown;
  getDefaultScene(): SceneMatrix;
  getRandomNumbers(): readonly number[];
  getStepCount(): number;
  getStep(index: number): GameLogicStep;
  getSteps(): readonly GameLogicStep[];
  getScene(stepIndex: number, sceneIndex: number): SceneMatrix;
  getResult(stepIndex: number, resultIndex: number): WinResult;
  hasComponent(stepIndex: number, name: string): boolean;
  getComponent(stepIndex: number, name: string): LogicComponent | undefined;
  getComponentScenes(stepIndex: number, name: string): readonly SceneMatrix[];
  getComponentResults(stepIndex: number, name: string): readonly WinResult[];
}

export interface GameLogicStep {
  getIndex(): number;
  getCoinWin(): number;
  getCashWin(): number;
  getRawStep(): unknown;
  getRawClientData(): unknown;
  getCurGameMod(): string | undefined;
  getCurGameModParam(): unknown;
  getSceneCount(): number;
  getScene(index: number): SceneMatrix;
  getScenes(): readonly SceneMatrix[];
  getResultCount(): number;
  getResult(index: number): WinResult;
  getResults(): readonly WinResult[];
  hasComponent(name: string): boolean;
  getComponent(name: string): LogicComponent | undefined;
  getComponentScenes(name: string): readonly SceneMatrix[];
  getComponentResults(name: string): readonly WinResult[];
}

export interface ParsedGameLogicData {
  readonly meta: ParsedGameLogicMeta;
  readonly rawMessage: unknown;
  readonly rawGmi: unknown;
  readonly defaultScene: SceneMatrix;
  readonly randomNumbers: readonly number[];
  readonly steps: readonly ParsedGameLogicStepData[];
}

export interface ParsedGameLogicStepData {
  readonly index: number;
  readonly coinWin: number;
  readonly cashWin: number;
  readonly rawStep: unknown;
  readonly rawClientData: unknown;
  readonly curGameMod?: string;
  readonly curGameModParam: unknown;
  readonly scenes: readonly SceneMatrix[];
  readonly results: readonly WinResult[];
  readonly historyComponents: readonly string[];
  readonly mapComponents: Readonly<Record<string, unknown>>;
}
