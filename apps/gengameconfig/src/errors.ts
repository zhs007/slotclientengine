export class ConfigParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigParseError";
  }
}

export interface CellLocation {
  filePath: string;
  sheetName: string;
  address: string;
}

export function formatCellLocation(location: CellLocation): string {
  return `${location.filePath} / ${location.sheetName}!${location.address}`;
}

export function fail(message: string): never {
  throw new ConfigParseError(message);
}

export function failAtCell(location: CellLocation, message: string): never {
  throw new ConfigParseError(`${formatCellLocation(location)}: ${message}`);
}
