import { describe, expect, it } from "vitest";
import { createSlotGameRngConsoleController } from "../src/rng-console.js";

type RngCommand = (...values: unknown[]) => void;

describe("slot game RNG console controller", () => {
  it("validates, replaces, consumes, and logs canonical RNG sequences", () => {
    const target: Record<string, unknown> = {};
    const messages: string[] = [];
    const controller = createSlotGameRngConsoleController({
      target,
      log: (message) => messages.push(message),
    });
    const command = requireRngCommand(target);

    command(1, 2, 3);
    command(8, 61, 41, 33, 13, 729);
    expect(controller.takeNext()).toEqual([8, 61, 41, 33, 13, 729]);
    expect(controller.takeNext()).toBeUndefined();

    command(0, Number.MAX_SAFE_INTEGER);
    for (const invalid of [
      [],
      [-1],
      [1.5],
      [Number.NaN],
      [Number.POSITIVE_INFINITY],
      ["1"],
      [[1, 2, 3]],
    ]) {
      expect(() => command(...invalid)).toThrow(
        /non-negative safe integer|at least one/,
      );
    }
    expect(controller.takeNext()).toEqual([0, Number.MAX_SAFE_INTEGER]);

    controller.logRandomNumbers([11, 22, 33]);
    expect(messages).toEqual(["rng(11,22,33)"]);
  });

  it("does not let logger failures change controller state", () => {
    const target: Record<string, unknown> = {};
    const controller = createSlotGameRngConsoleController({
      target,
      log: () => {
        throw new Error("observer failed");
      },
    });
    const command = requireRngCommand(target);
    command(7);

    expect(() => controller.logRandomNumbers([1, 2])).not.toThrow();
    expect(controller.takeNext()).toEqual([7]);
    controller.destroy();
  });

  it("rejects command collisions and targets that cannot install the command", () => {
    expect(() =>
      createSlotGameRngConsoleController({
        target: { rng: () => undefined },
      }),
    ).toThrow(/already defines "rng"/);
    expect(() =>
      createSlotGameRngConsoleController({
        target: Object.create({ rng: () => undefined }) as object,
      }),
    ).toThrow(/already defines "rng"/);
    expect(() =>
      createSlotGameRngConsoleController({
        target: Object.preventExtensions({}),
      }),
    ).toThrow(/cannot define "rng"/);
    expect(() =>
      createSlotGameRngConsoleController({
        target: {},
        log: "invalid" as never,
      }),
    ).toThrow(/rngConsole.log/);
  });

  it("removes only its own command and makes retained commands inert", () => {
    const target: Record<string, unknown> = {};
    const controller = createSlotGameRngConsoleController({ target });
    const retainedCommand = requireRngCommand(target);
    retainedCommand(1, 2);

    controller.destroy();
    controller.destroy();
    expect(target).not.toHaveProperty("rng");
    expect(controller.takeNext()).toBeUndefined();
    expect(() => retainedCommand(3)).toThrow(/destroyed/);

    const replacementTarget: Record<string, unknown> = {};
    const replacementController = createSlotGameRngConsoleController({
      target: replacementTarget,
    });
    const externalCommand = () => undefined;
    replacementTarget.rng = externalCommand;
    replacementController.destroy();
    expect(replacementTarget.rng).toBe(externalCommand);
  });
});

function requireRngCommand(target: Record<string, unknown>): RngCommand {
  const command = target.rng;
  if (typeof command !== "function") {
    throw new Error("rng console command was not installed.");
  }
  return command as RngCommand;
}
