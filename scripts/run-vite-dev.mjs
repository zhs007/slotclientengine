import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function normalizeViteArgs(args) {
  const normalized = [...args];
  if (normalized[0] === "--") normalized.shift();
  return normalized;
}

export function resolveViteCliPath() {
  const packageJsonPath = fileURLToPath(
    import.meta.resolve("vite/package.json"),
  );
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const relativeBin =
    typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin?.vite;
  if (typeof relativeBin !== "string" || relativeBin.length === 0) {
    throw new Error("The installed vite package does not expose a CLI binary.");
  }
  return resolve(dirname(packageJsonPath), relativeBin);
}

export function runViteDev(args = process.argv.slice(2)) {
  const child = spawn(
    process.execPath,
    [resolveViteCliPath(), ...normalizeViteArgs(args)],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    },
  );
  child.once("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
  return child;
}

const entryPath = process.argv[1] ? realpathSync(process.argv[1]) : null;
const modulePath = realpathSync(fileURLToPath(import.meta.url));
if (entryPath === modulePath) runViteDev();
