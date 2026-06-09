import { parseCliArgs } from "./cli";
import { installNodeWebSocket } from "./netcore-node";
import { runRtp } from "./rtp-runner";

async function main(): Promise<void> {
  const config = parseCliArgs(process.argv.slice(2));
  installNodeWebSocket();
  await runRtp(config);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`gameclientcli 执行失败：${message}`);
  process.exitCode = 1;
});
