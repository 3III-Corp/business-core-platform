import crypto from "node:crypto";

export type TargetAiPartner =
  | "gemini"
  | "openai-gpt"
  | "anthropic-claude"
  | "codex"
  | "base44-builder";

export type GeminiHubMode =
  | "dispatch-context"
  | "ingest-and-merge"
  | "mobile-brief";

export interface ModuleContextNode {
  moduleId: string;
  name: string;
  repoPath: string;
  gateStatus: string;
  summary: string;
  dependencies: string[];
}

export interface ProjectBaselineRegistry {
  repoUrl: string;
  baselineVersion: string;
  serverRouterPath: string;
  schemas: string[];
  providersAndBanks: {
    baseline: string[];
    cambodiaBanks: string[];
    isolationPolicy: string;
  };
  governanceRules: string[];
  reservedMatters: string[];
  modules: ModuleContextNode[];
}

export interface GeminiHubRequest {
  mode: GeminiHubMode;
  targetAi?: TargetAiPartner;
  focusModuleId?: string;
  taskPrompt: string;
  externalAiSummary?: string;
  actorId?: string;
  correlationId?: string;
}

export interface GeminiHubResponse {
  correlationId: string;
  mode: GeminiHubMode;
  repoUrl: string;
  serverRouterPath: string;
  baselineVersion: string;
  outputText: string;
  requiresHumanApproval: true;
  advisoryOnly: true;
  timestamp: string;
}

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

// ตำแหน่งมาตรฐานของไฟล์ Router ฝั่ง Server / Edge
export const SERVER_AI_ROUTER_PATH = "edge/aiRouterHandler.ts";

export const BOSN_PROJECT_REGISTRY: ProjectBaselineRegistry = {
  repoUrl: "https://github.com/3III-Corp/business-core-platform/tree/main",
  baselineVersion: "BOSN-BASELINE-2026-11-23",
  serverRouterPath: SERVER_AI_ROUTER_PATH,
  schemas: [
    "core",
    "iam",
    "audit",
    "wallet",
    "payments",
    "kyc",
    "partners",
    "notification",
    "private",
  ],
  providersAndBanks: {
    baseline: [
      "Omise",
      "2C2P",
      "Xendit",
      "Nium",
      "PromptPay Rail",
      "KYC Provider",
      "Card Issuer",
    ],
    cambodiaBanks: ["PPCBank", "Wing Bank", "ABA Bank"],
    isolationPolicy:
      "Server-side Provider Adapter behind API Boundary. Any single provider/bank can be disconnected or offboarded independently without full-app downtime. Full downtime applies strictly to major version upgrades or security patches.",
  },
  governanceRules: [
    "Human-in-the-Loop: AI prepares, distributes context, and drafts updates; only authorized humans approve or merge.",
    "Separation of Duties & Least Privilege: Read-only default; no automatic permissions from HR job titles.",
    "Secrets & Privacy: Never expose API keys, service-role keys, or raw KYC documents in prompts, client code, or git commits.",
    "Evidence First: Distinguish verified live facts from planned/draft specs.",
  ],
  reservedMatters: [
    "Production/Staging deployment, rollback, domain, or environment variable changes",
    "Merges to main/protected branches or ruleset bypasses on 3III-Corp/business-core-platform",
    "Supabase schema, migration, RLS policy, or live customer/KYC data modifications",
    "Partner workspace provisioning, live financial transactions/settlements, or III Coin issuance",
  ],
  modules: [
    {
      moduleId: "MOD-CORE-IAM",
      name: "Core Platform, IAM & Multi-Tenant Isolation",
      repoPath: "supabase/ & packages/",
      gateStatus: "G0/G1 Baseline Approved — Implementation Pending Gate Sign-off",
      summary:
        "9 logical schemas with RLS isolation, human-to-account binding, and scoped permissions.",
      dependencies: ["MOD-AUDIT"],
    },
    {
      moduleId: "MOD-PROVIDER-GW",
      name: "Payment Gateway & Banking Adapters (TH + Cambodia)",
      repoPath: "edge/ & packages/",
      gateStatus:
        "G1/G2 — PPCBank, Wing Bank, ABA Bank added to baseline; sandbox/contract pending",
      summary:
        "Normalized server-side adapters, signature-checked deduplicated webhooks, and zero-downtime provider disconnect.",
      dependencies: ["MOD-WALLET-LEDGER", "MOD-CORE-IAM"],
    },
    {
      moduleId: "MOD-WALLET-LEDGER",
      name: "3III Wallet, Double-Entry Ledger & Fund Settlement",
      repoPath: "packages/ & supabase/",
      gateStatus: "G1/G2 — Scope & Tier Limits Defined",
      summary:
        "Append-only double-entry ledger, idempotency, bound-bank payout refund or governed waiver/suspense on termination.",
      dependencies: ["MOD-KYC-PDPA", "MOD-PROVIDER-GW"],
    },
    {
      moduleId: "MOD-KYC-PDPA",
      name: "KYC Orchestration, PDPA Retention & Account Lifecycle",
      repoPath: "edge/ & supabase/",
      gateStatus:
        "G1/G2 — Policy Defined; Legal Retention Schedule Confirmation Pending",
      summary:
        "Segregated encrypted raw KYC storage, minimal provider_refs in core DB, and returning-user Reactivation/Re-KYC within retention window.",
      dependencies: ["MOD-CORE-IAM"],
    },
    {
      moduleId: "MOD-APP-FACTORY",
      name: "App Factory, BOEM & Partner Workspaces",
      repoPath: "packages/ & .ai/",
      gateStatus: "G2 — Spec Aligned with BOSN Core IP & Multi-Tenant Rules",
      summary:
        "Scoped downstream apps and partner workspaces with contract expiry, IP separation (III owns BOSN Core), and pre-approval controls.",
      dependencies: ["MOD-CORE-IAM", "MOD-PROVIDER-GW"],
    },
    {
      moduleId: "MOD-AI-HUB",
      name: "Multi-AI Context & Handoff Orchestrator",
      repoPath: `${SERVER_AI_ROUTER_PATH} & GEMINI.md`,
      gateStatus: "Active Orchestration Layer (Advisory Only)",
      summary:
        "Dispatches unified BOSN context to external AIs (GPT/Claude/Codex/Base44) and merges approved summaries back into baseline records.",
      dependencies: ["MOD-CORE-IAM"],
    },
  ],
};

function buildGeminiSystemPrompt(mode: GeminiHubMode): string {
  const base = [
    `You are the Central Context Dispatcher & State Synchronizer for 3III Business OS Nexus (BOSN).`,
    `Authoritative Repository: ${BOSN_PROJECT_REGISTRY.repoUrl}`,
    `Server Router Location: ${BOSN_PROJECT_REGISTRY.serverRouterPath}`,
    `Baseline Version: ${BOSN_PROJECT_REGISTRY.baselineVersion}`,
    `Hard Rules: Never authorize production writes, schema/RLS changes, secret exposure, or human approvals. Always separate verified state from draft proposals.`,
  ];

  if (mode === "dispatch-context") {
    return [
      ...base,
      `Task Mode: DISPATCH CONTEXT PACKET.`,
      `Generate a complete, self-contained handoff brief for the target AI so it understands the entire BOSN ecosystem, all 9 schemas, Cambodia/TH banking adapters, zero-downtime provider detachment, user fund/PDPA/reactivation rules, and the exact scope boundaries of the requested module.`,
      `Require the target AI to return structured findings (Summary, Deliverable, Risks/Gaps, Human Approval Items) that can later be merged back into BOSN.`,
    ].join("\n");
  }

  if (mode === "ingest-and-merge") {
    return [
      ...base,
      `Task Mode: INGEST & SYNCHRONIZE EXTERNAL AI CONCLUSION.`,
      `Compare the incoming conclusion from the external AI against the current BOSN_PROJECT_REGISTRY.`,
      `Produce: (1) Conflict & Governance Check (flag any violation of Reserved Matters, RLS, Secrets, or Provider Isolation), (2) Proposed Registry/Document Patch (exact updates to module status, specs, or Action Plan), and (3) Human Sign-off Checklist before committing to GitHub or updating project records.`,
    ].join("\n");
  }

  return [
    ...base,
    `Task Mode: MOBILE EXECUTIVE BRIEF.`,
    `Provide a concise, mobile-friendly Thai status update showing current module state, dependencies, and next human-approved step.`,
  ].join("\n");
}

export async function runBosnGeminiHub(
  req: GeminiHubRequest
): Promise<GeminiHubResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in server environment");
  }

  const correlationId = req.correlationId ?? crypto.randomUUID();
  const focusModule = req.focusModuleId
    ? BOSN_PROJECT_REGISTRY.modules.find((m) => m.moduleId === req.focusModuleId)
    : undefined;

  const payloadContext = {
    registry: BOSN_PROJECT_REGISTRY,
    targetAi: req.targetAi ?? "external-ai",
    focusModule: focusModule ?? "ALL_MODULES",
    actorId: req.actorId ?? "unassigned-operator",
  };

  const userContent = [
    `=== BOSN AUTHORITATIVE CONTEXT ===`,
    JSON.stringify(payloadContext, null, 2),
    ``,
    `=== REQUEST (${req.mode}) ===`,
    req.taskPrompt.trim(),
    req.externalAiSummary
      ? `\n=== EXTERNAL AI CONCLUSION TO MERGE ===\n${req.externalAiSummary.trim()}`
      : "",
  ].join("\n");

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildGeminiSystemPrompt(req.mode) }],
      },
      contents: [{ parts: [{ text: userContent }] }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Gemini Hub API error [${correlationId}]: ${response.status} ${errText.slice(0, 200)}`
    );
  }

  const data = await response.json();
  const outputText: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text ?? "")
      .join("")
      .trim() || "";

  return {
    correlationId,
    mode: req.mode,
    repoUrl: BOSN_PROJECT_REGISTRY.repoUrl,
    serverRouterPath: SERVER_AI_ROUTER_PATH,
    baselineVersion: BOSN_PROJECT_REGISTRY.baselineVersion,
    outputText,
    requiresHumanApproval: true,
    advisoryOnly: true,
    timestamp: new Date().toISOString(),
  };
}
