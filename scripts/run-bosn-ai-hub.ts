import crypto from "node:crypto";
import {
  runBosnGeminiHub,
  type GeminiHubMode,
  type TargetAiPartner,
} from "../edge/aiRouterHandler.js";

interface CliOptions {
  mode: GeminiHubMode;
  targetAi?: TargetAiPartner;
  moduleId?: string;
  prompt: string;
  summary?: string;
  actorId?: string;
  correlationId?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const getArg = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
  };

  const modeRaw = getArg("--mode") ?? "mobile-brief";
  const allowedModes: GeminiHubMode[] = [
    "dispatch-context",
    "ingest-and-merge",
    "mobile-brief",
  ];
  if (!allowedModes.includes(modeRaw as GeminiHubMode)) {
    throw new Error(
      `Invalid --mode "${modeRaw}". Allowed: ${allowedModes.join(", ")}`
    );
  }

  const prompt =
    getArg("--prompt") ??
    "สรุปสถานะโมดูลและรายการที่ต้องให้มนุษย์ตรวจสอบ/อนุมัติถัดไปแบบสั้นกระชับ";

  return {
    mode: modeRaw as GeminiHubMode,
    targetAi: getArg("--target") as TargetAiPartner | undefined,
    moduleId: getArg("--module"),
    prompt,
    summary: getArg("--summary"),
    actorId: getArg("--actor") ?? "cli-operator",
    correlationId: getArg("--correlation-id") ?? crypto.randomUUID(),
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error(
      "Error: GEMINI_API_KEY is not set in environment variables."
    );
    process.exit(1);
  }

  const opts = parseArgs(process.argv.slice(2));

  console.log("=== BOSN AI HUB RUN START ===");
  console.log(
    JSON.stringify(
      {
        correlationId: opts.correlationId,
        mode: opts.mode,
        targetAi: opts.targetAi ?? "N/A",
        focusModuleId: opts.moduleId ?? "ALL_MODULES",
        actorId: opts.actorId,
      },
      null,
      2
    )
  );

  const result = await runBosnGeminiHub({
    mode: opts.mode,
    targetAi: opts.targetAi,
    focusModuleId: opts.moduleId,
    taskPrompt: opts.prompt,
    externalAiSummary: opts.summary,
    actorId: opts.actorId,
    correlationId: opts.correlationId,
  });

  console.log("\n=== RESULT METADATA ===");
  console.log(
    JSON.stringify(
      {
        correlationId: result.correlationId,
        mode: result.mode,
        repoUrl: result.repoUrl,
        serverRouterPath: result.serverRouterPath,
        baselineVersion: result.baselineVersion,
        requiresHumanApproval: result.requiresHumanApproval,
        advisoryOnly: result.advisoryOnly,
        timestamp: result.timestamp,
      },
      null,
      2
    )
  );

  console.log("\n=== OUTPUT ===");
  console.log(result.outputText);
}

main().catch((err) => {
  console.error("BOSN AI Hub execution failed:", err);
  process.exit(1);
});
