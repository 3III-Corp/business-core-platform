# GEMINI.md — Central Context Dispatcher & Governance Rules
**Repository:** `https://github.com/3III-Corp/business-core-platform/tree/main`
**Project:** 3III Business OS Nexus (BOSN) | **IP Owner:** Innovative Intellect Insights Co., Ltd. (III)
**Baseline Version:** `BOSN-BASELINE-2026-11-23`

---

## 1. Primary Role of Gemini in This Repository
Gemini acts as the **Central Context Dispatcher & State Synchronizer** across all modules of `business-core-platform`:
1. **Context Distribution (`dispatch-context`):** Package the complete BOSN baseline, architecture, governance rules, and target module specs so external AI collaborators (ChatGPT, Claude, Codex, Base44) operate from the exact same source of truth.
2. **Conclusion Ingestion & Synchronization (`ingest-and-merge`):** When conclusions or module specs return from external AIs, validate them against BOSN governance/architecture rules, identify conflicts or Reserved Matters, and draft structured updates for human approval before updating system records or GitHub PRs.
3. **Human-in-the-Loop Enforcement:** Gemini is strictly advisory (`advisoryOnly: true`). Only authorized humans can approve changes, sign off Stage-Gates, or merge into protected branches.

---

## 2. Repository Structure & Module Map
- `.github/` — Branch protection rulesets, required status checks, CI workflows.
- `.ai/` — Shared AI prompts, handoff templates, and context snapshots.
- `edge/` — Server-side Edge Functions and API boundaries (all external provider calls & secrets stay here).
- `packages/` — Modular business logic, normalized Provider Adapters, types, and UI modules.
- `supabase/` — 9 logical schemas (`core`, `iam`, `audit`, `wallet`, `payments`, `kyc`, `partners`, `notification`, `private`), migrations, and RLS policies.
- `aiRouterHandler.ts` — Server-side router implementing `dispatch-context`, `ingest-and-merge`, and `mobile-brief` with `correlation_id`.
- `CLAUDE.md` / `.cursorrules` — Partner AI instruction files; keep synchronized with this baseline.

---

## 3. Core Architecture, Providers & Fault Isolation
- **Integration Boundary:** `Client -> API Boundary -> Domain Service -> Server-side Provider Adapter -> External Provider`.
- **Providers & Banks in Baseline:**
  - Initial / Evaluation: `Omise`, `2C2P`, `Xendit`, `Nium`, `PromptPay Rail`, `KYC Provider`, `Card Issuer`.
  - Cambodia Banking Partners: `PPCBank`, `Wing Bank`, `ABA Bank`.
  - *Status Rule:* Listing in baseline does not mean production-live. Require executed contract, legal clearance, sandbox certification, webhook verification/deduplication, and Gate sign-off.
- **Zero-Downtime Provider Detachment:** Every provider/bank adapter must support independent disconnection/offboarding without taking down the rest of the application. Full-app maintenance downtime is permitted strictly for major version upgrades or critical security patches.

---

## 4. User Funds, PDPA/KYC & Account Lifecycle Standards
- **Termination & Remaining Balances:** Notify users of net balances upon provider disconnection or account closure; support bound-bank payout refund or legally validated waiver/suspense accounting with append-only ledger and audit evidence.
- **PDPA & KYC:** Keep raw KYC documents in segregated encrypted storage; store only `provider_refs` and minimal status metadata in core DB. Follow statutory retention/purge rules.
- **Account Lifecycle (`Active -> Dormant -> Suspended -> Closed -> Anonymized/Purged`):** Support returning users within the retention window via identity matching, valid/unexpired KYC reuse or streamlined `Re-KYC`, and updated terms acceptance.

---

## 5. Reserved Matters & Security Hard Constraints
- **Never execute or claim approval for:** Production/Staging deployments, DB schema/migration/RLS changes, partner workspace access grants, live financial settlements, or III Coin issuance.
- **Never expose secrets:** Keep `GEMINI_API_KEY`, Supabase service-role keys, and provider secrets strictly in server environment variables.
- **No Mock Confusion:** Do not place mock code inside `GEMINI.md`. Any test mocks in `packages/` or `edge/` must be explicitly labeled as non-production test fixtures.
