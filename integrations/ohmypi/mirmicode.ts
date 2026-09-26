// Mirmicode metadata reporter. Raw prompts stay in this process; the Python
// reporter reduces them to bounded keywords before persistence or transport.
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";

const reporter = join(homedir(), ".local/share/mirmicode/report_harness.py");
const ephemeralSessionId = `ephemeral-${process.pid}-${Date.now()}`;

function emit(event: string, ctx: ExtensionContext, prompt?: string): Promise<void> {
  const model = ctx.models.current();
  const payload = {
    session_id: ctx.sessionManager.getSessionFile() || ephemeralSessionId,
    cwd: ctx.cwd,
    model: model?.id || null,
    prompt: prompt || null,
  };
  return new Promise((resolve) => {
    const child = spawn("python3", [reporter, "--harness", "ohmypi", "--event", event], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish();
    }, 8000);
    child.on("error", finish); // Observation must never interrupt OhMyPi.
    child.on("close", finish);
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}

export default function mirmicodeOhMyPi(api: ExtensionAPI): void {
  let pendingPrompt: string | undefined;
  let active = false;
  async function finish(ctx: ExtensionContext): Promise<void> {
    if (!active) return;
    active = false;
    await emit("agent_end", ctx);
  }
  api.on("before_agent_start", (event) => {
    pendingPrompt = event.prompt;
  });
  api.on("agent_start", async (_event, ctx) => {
    active = true;
    const report = emit("agent_start", ctx, pendingPrompt);
    pendingPrompt = undefined;
    await report;
  });
  api.on("agent_end", async (_event, ctx) => {
    await finish(ctx);
  });
  // Print mode in OMP 18.2.11 emits session_stop but omits agent_end.
  api.on("session_stop", async (_event, ctx) => {
    await finish(ctx);
  });
}
