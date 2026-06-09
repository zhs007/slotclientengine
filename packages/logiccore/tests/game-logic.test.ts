import { describe, expect, it } from 'vitest';
import basicMessage from './fixtures/gamemoduleinfo-basic.json';
import multiStepMessage from './fixtures/gamemoduleinfo-multistep.json';
import {
  createGameLogic,
  createGameLogicFromGmi,
  GameLogic,
  LogicParseError,
  SceneMatrix,
} from '../src';

const cloneFixture = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('GameLogicModel', () => {
  it('creates queryable logic from a gamemoduleinfo message', () => {
    const logic = createGameLogic(basicMessage);
    const step = logic.getStep(0);

    expect(logic.getGameModuleName()).toBe('CqbQ0Y7gtBpO5419j8h02');
    expect(logic.getGameId()).toBe(69002);
    expect(logic.getBet()).toBe(5);
    expect(logic.getLines()).toBe(10);
    expect(logic.getTotalWin()).toBe(275);
    expect(logic.getPlayWin()).toBe(0);
    expect(logic.getDefaultScene()[0]).toEqual([0, 4, 0, 4, 0]);
    expect(logic.getDefaultScene()[4]).toEqual([0, 8, 0, 6, 0]);
    expect(logic.getRandomNumbers()).toEqual([1, 1, 34, 0, 27]);
    expect(logic.getStepCount()).toBe(1);
    expect(logic.getSteps()).toHaveLength(1);

    expect(step.getIndex()).toBe(0);
    expect(step.getCoinWin()).toBe(55);
    expect(step.getCashWin()).toBe(275);
    expect(step.getSceneCount()).toBe(1);
    expect(step.getResultCount()).toBe(2);
    expect(step.getScene(0)).toEqual([
      [2, 0, 3, 0, 4],
      [2, 0, 3, 0, 4],
      [0, 4, 0, 5, 0],
      [1, 1, 1, 1, 1],
      [9, 0, 6, 0, 6],
    ]);
    expect(step.getScenes()[0]).toEqual(step.getScene(0));
    expect(logic.getScene(0, 0)).toEqual(step.getScene(0));
    expect(step.getResult(0).pos).toEqual([4, 0]);
    expect(step.getResult(1).cashWin).toBe(275);
    expect(step.getResults()[1].symbol).toBe(-1);
    expect(logic.getResult(0, 1).cashWin).toBe(275);
    expect(step.getCurGameMod()).toBe('basic');
    expect(step.getCurGameModParam()).toMatchObject({
      firstComponent: '',
      nextStepFirstComponent: '',
    });
  });

  it('creates equivalent logic from gmi + meta input', () => {
    const fromMessage = createGameLogic(basicMessage);
    const fromGmi = createGameLogicFromGmi(basicMessage.gmi, {
      bet: basicMessage.bet,
      lines: basicMessage.lines,
      totalwin: basicMessage.totalwin,
      gamemodulename: basicMessage.gamemodulename,
      gameid: basicMessage.gameid,
      playIndex: basicMessage.playIndex,
      playwin: basicMessage.playwin,
      maxWinLimit: basicMessage.maxWinLimit,
    });

    expect(fromGmi.getDefaultScene()).toEqual(fromMessage.getDefaultScene());
    expect(fromGmi.getRandomNumbers()).toEqual(fromMessage.getRandomNumbers());
    expect(fromGmi.getStep(0).getResult(1)).toEqual(fromMessage.getStep(0).getResult(1));
    expect(fromGmi.getRawMessage()).toMatchObject({
      msgid: 'gamemoduleinfo',
      bet: 5,
      lines: 10,
      totalwin: 275,
      gameid: 69002,
    });
  });

  it('throws RangeError for invalid step, scene, and result indexes', () => {
    const logic = createGameLogic(basicMessage);
    const step = logic.getStep(0);

    expect(() => logic.getStep(-1)).toThrow(RangeError);
    expect(() => logic.getStep(999)).toThrow(RangeError);
    expect(() => step.getScene(999)).toThrow(RangeError);
    expect(() => step.getResult(999)).toThrow(RangeError);
    expect(() => logic.getScene(999, 0)).toThrow(RangeError);
    expect(() => logic.getResult(0, 999)).toThrow(RangeError);
  });

  it('does not let returned scenes, arrays, raw data, or component raw mutate internal state', () => {
    const logic = createGameLogic(basicMessage);
    tryMutate(() => ((logic.getDefaultScene() as number[][])[0][0] = 999));
    tryMutate(() => ((logic.getRandomNumbers() as number[])[0] = 999));
    tryMutate(() => ((logic.getStep(0).getResults() as any[])[0] = { pos: [] }));

    const rawMessage = logic.getRawMessage() as any;
    const rawGmi = logic.getRawGmi() as any;
    const rawStep = logic.getStep(0).getRawStep() as any;
    const rawClientData = logic.getStep(0).getRawClientData() as any;
    const payRaw = logic.getStep(0).getComponent('bg-pay')?.raw as any;
    tryMutate(() => (rawMessage.bet = 999));
    tryMutate(() => (rawGmi.defaultScene.values[0].values[0] = 999));
    tryMutate(() => (rawStep.coinWin = 999));
    tryMutate(() => (rawClientData.nextGameMod = 'changed'));
    tryMutate(() => (payRaw.type_url = 'changed'));

    expect(logic.getDefaultScene()[0][0]).toBe(0);
    expect(logic.getRandomNumbers()[0]).toBe(1);
    expect(logic.getStep(0).getResult(0).pos).toEqual([4, 0]);
    expect((logic.getRawMessage() as any).bet).toBe(5);
    expect(((logic.getRawGmi() as any).defaultScene.values[0].values as number[])[0]).toBe(0);
    expect((logic.getStep(0).getRawStep() as any).coinWin).toBe(55);
    expect((logic.getStep(0).getRawClientData() as any).nextGameMod).toBe('basic');
    expect((logic.getStep(0).getComponent('bg-pay')?.raw as any).type_url).toBe(
      'type.googleapis.com/sgc7pb.MoneyTriggerData'
    );
  });

  it('keeps constructor input mutation from polluting parsed logic', () => {
    const message = cloneFixture(basicMessage);
    const logic = createGameLogic(message);

    message.bet = 999;
    message.gmi.defaultScene.values[0].values[0] = 999;
    message.gmi.replyPlay.results[0].clientData.results[1].cashWin = 999;

    expect(logic.getBet()).toBe(5);
    expect(logic.getDefaultScene()[0][0]).toBe(0);
    expect(logic.getResult(0, 1).cashWin).toBe(275);
  });

  it('keeps multi-step component scene and result indexes scoped to the current step', () => {
    const logic = createGameLogic(multiStepMessage);

    expect(logic.getStepCount()).toBe(2);
    expect(logic.getStep(1).getCoinWin()).toBe(33);
    expect(logic.getStep(0).getComponentScenes('shared')[0][0][0]).toBe(10);
    expect(logic.getStep(0).getComponentResults('shared')[0].extraStep).toBe('first');
    expect(logic.getStep(1).getComponentScenes('shared')[0][0][0]).toBe(30);
    expect(logic.getStep(1).getComponentResults('shared')[0].extraStep).toBe('second');
  });

  it('throws public LogicParseError for invalid public inputs', () => {
    expect(() => createGameLogic({ ...basicMessage, msgid: 'wrong' })).toThrow(LogicParseError);
    expect(() =>
      createGameLogicFromGmi(basicMessage.gmi, {
        bet: basicMessage.bet,
        lines: basicMessage.lines,
        totalwin: basicMessage.totalwin,
        maxWinLimit: Number.NaN,
      })
    ).toThrow(LogicParseError);
  });
});

function tryMutate(mutator: () => void): void {
  try {
    mutator();
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError);
  }
}

expectTypeOnly<GameLogic>();
expectTypeOnly<SceneMatrix>();

function expectTypeOnly<T>(): void {
  return undefined as T extends unknown ? void : never;
}
