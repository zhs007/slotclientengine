import { stat, readFile } from "node:fs/promises";
import { LogicParseError } from "./errors";
import { createGameConfig } from "./game-config";
import { LogicGameConfig } from "./types";

export async function loadGameConfigFromJsonFile(
  filePath: string,
): Promise<LogicGameConfig> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new LogicParseError(`Game config path is not a file: ${filePath}.`);
    }
  } catch (error) {
    if (error instanceof LogicParseError) {
      throw error;
    }

    throw new LogicParseError(
      `Failed to stat game config JSON file "${filePath}": ${formatError(error)}.`,
    );
  }

  let rawJson: string;
  try {
    rawJson = await readFile(filePath, "utf8");
  } catch (error) {
    throw new LogicParseError(
      `Failed to read game config JSON file "${filePath}": ${formatError(error)}.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch (error) {
    throw new LogicParseError(
      `Failed to parse game config JSON file "${filePath}": ${formatError(error)}.`,
    );
  }

  try {
    return createGameConfig(parsed);
  } catch (error) {
    if (error instanceof LogicParseError) {
      throw new LogicParseError(
        `Invalid game config JSON file "${filePath}": ${error.message}`,
      );
    }

    throw error;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
