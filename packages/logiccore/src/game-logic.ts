import {
  buildLogicComponent,
  getComponentResultsForStep,
  getComponentScenesForStep,
  hasTriggeredComponent,
} from "./component";
import { parseGameModuleInfoMessage, parseGmiWithMeta } from "./parser";
import {
  GameLogic,
  GameLogicMeta,
  GameLogicStep,
  LogicComponent,
  ParsedGameLogicData,
  ParsedGameLogicStepData,
  SceneMatrix,
  WinResult,
} from "./types";

export function createGameLogic(message: unknown): GameLogic {
  return new GameLogicModel(parseGameModuleInfoMessage(message));
}

export function createGameLogicFromGmi(
  gmi: unknown,
  meta: GameLogicMeta,
): GameLogic {
  return new GameLogicModel(parseGmiWithMeta(gmi, meta));
}

export class GameLogicModel implements GameLogic {
  readonly #data: ParsedGameLogicData;
  readonly #steps: readonly GameLogicStepModel[];

  constructor(data: ParsedGameLogicData) {
    this.#data = data;
    this.#steps = Object.freeze(
      data.steps.map((step) => new GameLogicStepModel(step)),
    );
    Object.freeze(this);
  }

  getGameModuleName(): string | undefined {
    return this.#data.meta.gamemodulename;
  }

  getGameId(): number | undefined {
    return this.#data.meta.gameid;
  }

  getBet(): number {
    return this.#data.meta.bet;
  }

  getLines(): number {
    return this.#data.meta.lines;
  }

  getTotalWin(): number {
    return this.#data.meta.totalwin;
  }

  getPlayWin(): number | undefined {
    return this.#data.meta.playwin;
  }

  getRawMessage(): unknown {
    return this.#data.rawMessage;
  }

  getRawGmi(): unknown {
    return this.#data.rawGmi;
  }

  getDefaultScene(): SceneMatrix {
    return this.#data.defaultScene;
  }

  getRandomNumbers(): readonly number[] {
    return this.#data.randomNumbers;
  }

  getStepCount(): number {
    return this.#steps.length;
  }

  getStep(index: number): GameLogicStep {
    assertIndex(index, this.#steps.length, "step");

    return this.#steps[index];
  }

  getSteps(): readonly GameLogicStep[] {
    return this.#steps;
  }

  getScene(stepIndex: number, sceneIndex: number): SceneMatrix {
    return this.getStep(stepIndex).getScene(sceneIndex);
  }

  getResult(stepIndex: number, resultIndex: number): WinResult {
    return this.getStep(stepIndex).getResult(resultIndex);
  }

  hasComponent(stepIndex: number, name: string): boolean {
    return this.getStep(stepIndex).hasComponent(name);
  }

  getComponent(stepIndex: number, name: string): LogicComponent | undefined {
    return this.getStep(stepIndex).getComponent(name);
  }

  getComponentScenes(stepIndex: number, name: string): readonly SceneMatrix[] {
    return this.getStep(stepIndex).getComponentScenes(name);
  }

  getComponentResults(stepIndex: number, name: string): readonly WinResult[] {
    return this.getStep(stepIndex).getComponentResults(name);
  }
}

export class GameLogicStepModel implements GameLogicStep {
  readonly #data: ParsedGameLogicStepData;

  constructor(data: ParsedGameLogicStepData) {
    this.#data = data;
    Object.freeze(this);
  }

  getIndex(): number {
    return this.#data.index;
  }

  getCoinWin(): number {
    return this.#data.coinWin;
  }

  getCashWin(): number {
    return this.#data.cashWin;
  }

  getRawStep(): unknown {
    return this.#data.rawStep;
  }

  getRawClientData(): unknown {
    return this.#data.rawClientData;
  }

  getCurGameMod(): string | undefined {
    return this.#data.curGameMod;
  }

  getCurGameModParam(): unknown {
    return this.#data.curGameModParam;
  }

  getSceneCount(): number {
    return this.#data.scenes.length;
  }

  getScene(index: number): SceneMatrix {
    assertIndex(index, this.#data.scenes.length, "scene");

    return this.#data.scenes[index];
  }

  getScenes(): readonly SceneMatrix[] {
    return this.#data.scenes;
  }

  getResultCount(): number {
    return this.#data.results.length;
  }

  getResult(index: number): WinResult {
    assertIndex(index, this.#data.results.length, "result");

    return this.#data.results[index];
  }

  getResults(): readonly WinResult[] {
    return this.#data.results;
  }

  hasComponent(name: string): boolean {
    return hasTriggeredComponent(this.#data, name);
  }

  getComponent(name: string): LogicComponent | undefined {
    return buildLogicComponent(this.#data, name);
  }

  getComponentScenes(name: string): readonly SceneMatrix[] {
    return getComponentScenesForStep(this.#data, name);
  }

  getComponentResults(name: string): readonly WinResult[] {
    return getComponentResultsForStep(this.#data, name);
  }
}

function assertIndex(index: number, length: number, label: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new RangeError(`${label} index ${index} is out of range.`);
  }
}
