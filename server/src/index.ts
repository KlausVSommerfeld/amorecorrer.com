import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import express, { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const dotenvCandidates = [process.env.DOTENV_CONFIG_PATH, ".env.local", ".env"].filter(
  (value): value is string => Boolean(value),
);
for (const candidate of dotenvCandidates) {
  const resolved = path.resolve(process.cwd(), candidate);
  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved });
    break;
  }
}

const PIPELINE_HMAC_SECRET = process.env.PIPELINE_HMAC_SECRET ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PORT = parseInt(process.env.PORT ?? "3001", 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("WARN: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.");
}

function hmacSha256Hex(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

function verifyHmac(secret: string, message: string, signatureHex: string | undefined): boolean {
  if (!secret || !signatureHex) return false;
  try {
    const expected = hmacSha256Hex(secret, message);
    const e = Buffer.from(expected, "hex");
    const r = Buffer.from(signatureHex.trim(), "hex");
    if (e.length !== r.length) return false;
    return crypto.timingSafeEqual(e, r);
  } catch {
    return false;
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function verifyGetCaseSignature(req: Request, res: Response, next: NextFunction): void {
  const caseId = req.params.caseId;
  if (!caseId) {
    res.status(400).json({ error: "Missing case id" });
    return;
  }
  const sig = req.headers["x-signature"];
  const sigStr = Array.isArray(sig) ? sig[0] : sig;
  const msg = `GET:${caseId}`;
  if (!verifyHmac(PIPELINE_HMAC_SECRET, msg, sigStr)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  next();
}

interface DispatchFinish {
  dispatch_key: string;
  success: boolean;
  error_detail?: string;
}

type GeneratedDocAction = "register_pdf" | "email_result";

interface GeneratedDocRegisterPdf {
  action: "register_pdf";
  dispatch_key: string;
  case_id: string;
  email_to: string;
  stripe_session_id?: string | null;
  storage_bucket: string;
  storage_path: string;
  sha256?: string | null;
}

interface GeneratedDocEmailResult {
  action: "email_result";
  dispatch_key: string;
  status: "emailed" | "email_failed" | "email_skipped";
  provider?: string | null;
  provider_message_id?: string | null;
  sent_at?: string | null;
  error_detail?: string | null;
}

type GeneratedDocBody = GeneratedDocRegisterPdf | GeneratedDocEmailResult;

interface RequestWithRaw extends Request {
  rawBody?: string;
  parsedFinishBody?: DispatchFinish;
  parsedGeneratedDocBody?: GeneratedDocBody;
}

/** Verify HMAC of raw POST body before parsing JSON. */
function verifyFinishBodyAndParse(req: RequestWithRaw, res: Response, next: NextFunction): void {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
  req.rawBody = raw;
  const sig = req.headers["x-signature"];
  const sigStr = Array.isArray(sig) ? sig[0] : sig;
  if (!verifyHmac(PIPELINE_HMAC_SECRET, raw, sigStr)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  try {
    req.parsedFinishBody = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  next();
}

/** HMAC verify raw JSON then parse into parsedGeneratedDocBody */
function verifyGeneratedDocBodyAndParse(req: RequestWithRaw, res: Response, next: NextFunction): void {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
  req.rawBody = raw;
  const sig = req.headers["x-signature"];
  const sigStr = Array.isArray(sig) ? sig[0] : sig;
  if (!verifyHmac(PIPELINE_HMAC_SECRET, raw, sigStr)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  try {
    const parsed = JSON.parse(raw) as GeneratedDocBody;
    req.parsedGeneratedDocBody = parsed;
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  next();
}

const app = express();

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/** Aggregated read model for pipeline workers (requires HMAC of `GET:${caseId}`). */
app.get("/internal/cases/:caseId", verifyGetCaseSignature, async (req: Request, res: Response) => {
  try {
    const caseId = req.params.caseId;
    const { data: form, error: formErr } = await supabase
      .from("form_submissions")
      .select("*")
      .eq("case_id", caseId)
      .maybeSingle();

    if (formErr) {
      console.error("form lookup", formErr);
      return res.status(500).json({ error: "DB error (form)" });
    }
    if (!form) {
      return res.status(404).json({ error: "Case not found" });
    }

    let stripe_session: Record<string, unknown> | null = null;
    if (form.stripe_session_id) {
      const { data: ss, error: ssErr } = await supabase
        .from("stripe_sessions")
        .select("id, case_id, payment_status, status")
        .eq("id", form.stripe_session_id)
        .maybeSingle();
      if (!ssErr) stripe_session = ss as Record<string, unknown>;
    }

    const { data: dispatchRow, error: dispErr } = await supabase
      .from("dispatches")
      .select("dispatch_key, status, stripe_session_id, case_id")
      .eq("case_id", caseId)
      .maybeSingle();

    if (dispErr) {
      console.error("dispatches lookup", dispErr);
    }

    return res.json({
      case: form,
      stripe_session,
      dispatch: dispatchRow ?? null,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal error" });
  }
});

/**
 * Pipeline: register PDF metadata after Storage upload, or update email delivery status.
 * POST body signed with same HMAC as /internal/dispatch/finish.
 */
app.post(
  "/internal/generated-documents",
  express.raw({ type: "application/json", limit: "65536" }),
  verifyGeneratedDocBodyAndParse,
  async (req: RequestWithRaw, res: Response) => {
    const body = req.parsedGeneratedDocBody;
    if (!body || typeof body !== "object" || !("action" in body)) {
      return res.status(400).json({ error: "Missing action" });
    }

    try {
      if (body.action === "register_pdf") {
        const b = body as GeneratedDocRegisterPdf;
        if (
          !b.dispatch_key ||
          !b.case_id ||
          !b.email_to ||
          !b.storage_bucket ||
          !b.storage_path
        ) {
          return res.status(400).json({
            error: "register_pdf requires dispatch_key, case_id, email_to, storage_bucket, storage_path",
          });
        }

        const { data: disp, error: dErr } = await supabase
          .from("dispatches")
          .select("case_id")
          .eq("dispatch_key", b.dispatch_key)
          .maybeSingle();

        if (dErr || !disp || disp.case_id !== b.case_id) {
          return res.status(400).json({ error: "dispatch_key does not match case_id" });
        }

        const row = {
          dispatch_key: b.dispatch_key,
          case_id: b.case_id,
          email_to: b.email_to.trim().toLowerCase(),
          stripe_session_id: b.stripe_session_id ?? null,
          storage_bucket: b.storage_bucket,
          storage_path: b.storage_path,
          sha256: b.sha256 ?? null,
          status: "generated" as const,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from("generated_documents")
          .upsert(row, { onConflict: "dispatch_key" })
          .select("id, dispatch_key, status")
          .single();

        if (error) {
          console.error("generated_documents upsert", error);
          return res.status(500).json({ error: error.message });
        }
        return res.json({ ok: true, row: data });
      }

      if (body.action === "email_result") {
        const b = body as GeneratedDocEmailResult;
        if (!b.dispatch_key || !b.status) {
          return res.status(400).json({ error: "email_result requires dispatch_key and status" });
        }
        if (!["emailed", "email_failed", "email_skipped"].includes(b.status)) {
          return res.status(400).json({ error: "invalid status" });
        }

        const patch: Record<string, unknown> = {
          status: b.status,
          provider: b.provider ?? null,
          provider_message_id: b.provider_message_id ?? null,
          sent_at: b.sent_at ?? (b.status === "emailed" ? new Date().toISOString() : null),
          error_detail: b.error_detail ?? null,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from("generated_documents")
          .update(patch)
          .eq("dispatch_key", b.dispatch_key)
          .select("id, dispatch_key, status")
          .maybeSingle();

        if (error) {
          console.error("generated_documents email_result", error);
          return res.status(500).json({ error: error.message });
        }
        if (!data) {
          return res.status(404).json({ error: "generated_documents row not found for dispatch_key" });
        }
        return res.json({ ok: true, row: data });
      }

      return res.status(400).json({ error: "Unknown action" });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Internal error" });
    }
  },
);

/** Called by Python pipeline when work completes — runs confirm_dispatch + form status update. */
app.post(
  "/internal/dispatch/finish",
  express.raw({ type: "application/json", limit: "65536" }),
  verifyFinishBodyAndParse,
  async (req: RequestWithRaw, res: Response) => {
    const body = req.parsedFinishBody;
    if (!body?.dispatch_key || typeof body.success !== "boolean") {
      return res.status(400).json({ error: "dispatch_key and success required" });
    }

    try {
      const { data: disp, error: dErr } = await supabase
        .from("dispatches")
        .select("case_id")
        .eq("dispatch_key", body.dispatch_key)
        .maybeSingle();

      if (dErr || !disp?.case_id) {
        console.error("dispatches lookup for finish", dErr);
        return res.status(404).json({ error: "Dispatch record not found" });
      }

      const case_id = disp.case_id as string;

      const rpcRes = await supabase.rpc("confirm_dispatch", {
        dispatch_key: body.dispatch_key,
        success: body.success,
      });

      if (rpcRes.error) {
        console.error("confirm_dispatch RPC", rpcRes.error);
        return res.status(500).json({ error: rpcRes.error.message });
      }

      const document_status = body.success ? "completed" : "failed";
      const patch: Record<string, string> = {
        document_status,
        updated_at: new Date().toISOString(),
      };
      if (body.success === false && body.error_detail) {
        // Optional: persist last error somewhere; keep patch minimal unless you add columns
      }

      const { error: uErr } = await supabase
        .from("form_submissions")
        .update(patch)
        .eq("case_id", case_id);

      if (uErr) {
        console.error("form_submissions status update after finish", uErr);
        return res.status(500).json({ error: uErr.message });
      }

      return res.json({
        ok: true,
        case_id,
        document_status,
        confirm_dispatch_ok: !!rpcRes.data,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Internal error" });
    }
  },
);

/** Sign helper response for troubleshooting (omit in production ingress or protect). Dev only. */
if (process.env.NODE_ENV !== "production") {
  app.get("/internal/dev/sign-message", (req: Request, res: Response) => {
    const q = (req.query.m as string) ?? "";
    if (!PIPELINE_HMAC_SECRET) return res.status(400).send("PIPELINE_HMAC_SECRET not set");
    res.send(hmacSha256Hex(PIPELINE_HMAC_SECRET, q));
  });
}

app.listen(PORT, () => {
  console.log(`amorecorrer-api listening on :${PORT}`);
});
