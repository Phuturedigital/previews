// daily-pipeline (v5) — orchestrator
//
// Triggered by cron once per day at 08:00 SAST (06:00 UTC).
// Runs the full chain: discover → enrich → audit → pitch → mockup → draft → report.
//
// AUTH NOTE — DO NOT "FIX" THIS BACK TO Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
// for the Bearer token used in callFn(). On this project the platform-injected
// SUPABASE_SERVICE_ROLE_KEY env var is not a valid JWT (project is mid-migration
// to JWT signing keys), so calls to child functions with verify_jwt: true 401 with
// UNAUTHORIZED_INVALID_JWT_FORMAT. The canonical legacy service_role JWT lives in
// the Supabase vault and is read at startup via the public.get_internal_service_key()
// RPC. The env var is still used as a *bootstrap* credential to open the initial
// PostgREST connection — that path is more permissive about token format than the
// Edge Function gateway is.
//
// PROGRESS NOTE — each step flushes its result to pipeline_runs immediately, so a
// run that hits the 150s wall-clock limit still leaves a useful audit trail.
//
// POST body shape:
//   {
//     "category_override": "dentists",
//     "max_drafts": 5,
//     "skip_discovery": false,
//     "skip_report": false,
//     "batch_overrides": { "discover": 3, "enrich": 3, "audit": 3, "pitch": 3, "mockup": 3 }
//   }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ENV_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const MAX_DRAFTS_PER_DAY = 5;
const DEFAULTS = {
  discover: 10,
  enrich: 10,
  audit: 10,
  pitch: 5,
  mockup: 5,
};

type BatchOverrides = Partial<typeof DEFAULTS>;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: {
    category_override?: string;
    max_drafts?: number;
    skip_discovery?: boolean;
    skip_report?: boolean;
    batch_overrides?: BatchOverrides;
  };
  try { body = await req.json(); } catch { body = {}; }

  const batch = { ...DEFAULTS, ...(body.batch_overrides ?? {}) };

  // Bootstrap with whatever Deno.env gives us (PostgREST is more permissive than
  // the Edge Function gateway). Use this client to read the canonical key from
  // the vault, then use that canonical key for child function calls.
  const bootstrap = createClient(SUPABASE_URL, ENV_SERVICE_ROLE_KEY);

  let SERVICE_ROLE_JWT: string;
  try {
    const { data, error } = await bootstrap.rpc("get_internal_service_key");
    if (error || !data) {
      return json({
        error: "Failed to read service role key from vault via RPC",
        details: error?.message ?? "empty result",
      }, 500);
    }
    SERVICE_ROLE_JWT = String(data);
  } catch (e) {
    return json({ error: "Bootstrap RPC threw", details: String(e) }, 500);
  }

  const dotCount = (SERVICE_ROLE_JWT.match(/\./g) ?? []).length;
  if (dotCount !== 2 || !SERVICE_ROLE_JWT.startsWith("eyJ")) {
    return json({
      error: "Vault returned a non-JWT value for SUPABASE_SERVICE_ROLE_KEY",
      length: SERVICE_ROLE_JWT.length,
      starts_with: SERVICE_ROLE_JWT.slice(0, 6),
      dot_count: dotCount,
    }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_JWT);
  const maxDrafts = Math.min(Math.max(body.max_drafts ?? MAX_DRAFTS_PER_DAY, 0), 20);

  const { data: runRow } = await supabase.from("pipeline_runs")
    .insert({ triggered_by: req.headers.get("x-cron-trigger") ? "cron" : "manual" })
    .select().single();
  const runId = runRow?.id;

  const stepsAttempted: string[] = [];
  const stepsSucceeded: Array<{ step: string; result: any }> = [];
  const stepsFailed: Array<{ step: string; error: string }> = [];
  let category: string | undefined;

  // Flush current state to pipeline_runs so partial progress is visible if the
  // function gets killed mid-run by the wall-clock limit.
  async function flush() {
    if (!runId) return;
    await supabase.from("pipeline_runs")
      .update({
        category_used: category,
        steps_attempted: stepsAttempted,
        steps_succeeded: stepsSucceeded,
        steps_failed: stepsFailed,
        errors_count: stepsFailed.length,
      })
      .eq("id", runId);
  }

  async function callFn(fnName: string, fnBody: any, stepLabel: string) {
    stepsAttempted.push(stepLabel);
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/${fnName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE_JWT}`,
        },
        body: JSON.stringify(fnBody),
      });
      const text = await res.text();
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      if (!res.ok) {
        stepsFailed.push({ step: stepLabel, error: `${res.status} — ${text.slice(0, 200)}` });
        await flush();
        return null;
      }
      stepsSucceeded.push({ step: stepLabel, result: parsed });
      await flush();
      return parsed;
    } catch (e) {
      stepsFailed.push({ step: stepLabel, error: String(e) });
      await flush();
      return null;
    }
  }

  // ==================== STEP 1: DISCOVERY ====================
  if (!body.skip_discovery) {
    let chosenQuery: string | undefined;
    if (body.category_override) {
      const { data: cat } = await supabase
        .from("discovery_categories")
        .select("category, search_query")
        .eq("category", body.category_override)
        .single();
      if (cat) { category = cat.category; chosenQuery = cat.search_query; }
    } else {
      const { data: cat } = await supabase
        .from("discovery_categories")
        .select("category, search_query")
        .eq("enabled", true)
        .order("last_run_at", { ascending: true, nullsFirst: true })
        .order("priority", { ascending: true })
        .limit(1)
        .single();
      if (cat) { category = cat.category; chosenQuery = cat.search_query; }
    }

    if (chosenQuery && category) {
      await callFn("discover-leads", { query: chosenQuery, max_results: batch.discover }, `discover:${category}`);
      await supabase.from("discovery_categories")
        .update({ last_run_at: new Date().toISOString() })
        .eq("category", category);
    } else {
      stepsFailed.push({ step: "discover", error: "no enabled category found" });
      await flush();
    }
  }

  // ==================== STEP 2: ENRICH EMAILS ====================
  await callFn("enrich-emails", { limit: batch.enrich }, "enrich-emails");

  // ==================== STEP 3: AUDIT WEBSITES ====================
  await callFn("audit-website", { limit: batch.audit }, "audit-website");

  // ==================== STEP 4: GENERATE PITCHES ====================
  const { count: draftedTodayCount } = await supabase
    .from("email_log")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "draft_created")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const remainingToday = Math.max(maxDrafts - (draftedTodayCount ?? 0), 0);

  if (remainingToday > 0) {
    await callFn("generate-pitch", { limit: Math.min(batch.pitch, remainingToday) }, "generate-pitch");
  } else {
    stepsAttempted.push("generate-pitch");
    stepsSucceeded.push({ step: "generate-pitch", result: { skipped: "daily draft cap already reached" } });
    await flush();
  }

  // ==================== STEP 5: GENERATE MOCKUPS ====================
  await callFn("generate-mockup", { limit: batch.mockup }, "generate-mockup");

  // ==================== STEP 6: CREATE GMAIL DRAFTS ====================
  if (remainingToday > 0) {
    await callFn("create-gmail-draft", { limit: remainingToday }, "create-gmail-draft");
  } else {
    stepsAttempted.push("create-gmail-draft");
    stepsSucceeded.push({ step: "create-gmail-draft", result: { skipped: "daily draft cap already reached" } });
    await flush();
  }

  // ==================== STEP 7: DAILY REPORT ====================
  if (!body.skip_report) {
    await callFn("daily-report", {}, "daily-report");
  }

  const draftsCreatedThisRun = stepsSucceeded
    .filter((s) => s.step === "create-gmail-draft")
    .reduce((sum, s) => {
      const results = (s.result?.results as any[]) ?? [];
      return sum + results.filter((r) => r.outcome === "draft_in_gmail").length;
    }, 0);

  if (runId) {
    await supabase.from("pipeline_runs")
      .update({
        completed_at: new Date().toISOString(),
        category_used: category,
        steps_attempted: stepsAttempted,
        steps_succeeded: stepsSucceeded,
        steps_failed: stepsFailed,
        drafts_created: draftsCreatedThisRun,
        errors_count: stepsFailed.length,
      })
      .eq("id", runId);
  }

  return json({
    pipeline_run_id: runId,
    category_used: category,
    steps_attempted: stepsAttempted.length,
    steps_succeeded: stepsSucceeded.length,
    steps_failed: stepsFailed.length,
    drafts_created_this_run: draftsCreatedThisRun,
    daily_cap: maxDrafts,
    remaining_after_run: Math.max(maxDrafts - (draftedTodayCount ?? 0) - draftsCreatedThisRun, 0),
    failed_steps: stepsFailed,
  });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}
