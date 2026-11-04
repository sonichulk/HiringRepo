import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, verifyAdminRequest } from "@/lib/adminAuth";
import { getChatSettings, saveChatSettings } from "@/lib/chatStore";
import { DEFAULT_FOLLOWUP_QUESTIONS, DEFAULT_HOURS, DEFAULT_ONBOARDING, DEFAULT_QUESTIONS, cleanSettings } from "@/lib/chat";
import { readJsonBody, badBodyResponse } from "@/lib/http";

/**
 * Saved questions, the onboarding portal messages and the hours line for the
 * live chat. Reset is per list — restoring the questions keeps your portal
 * messages, and the other way round.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, settings: await getChatSettings() });
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdminRequest(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const parsed = await readJsonBody<{ questions?: unknown; onboarding?: unknown; followupQuestions?: unknown; hours?: unknown; reset?: unknown }>(req, 128 * 1024);
  if (!parsed.ok) return badBodyResponse(parsed.reason);

  const current = await getChatSettings();
  const reset = parsed.data.reset;
  const keep = { questions: current.questions, hours: current.hours, onboarding: current.onboarding, followupQuestions: current.followupQuestions };
  const input =
    reset === true || reset === "questions"
      ? { ...keep, questions: DEFAULT_QUESTIONS, hours: DEFAULT_HOURS }
      : reset === "onboarding"
        ? { ...keep, onboarding: DEFAULT_ONBOARDING }
        : reset === "followup"
          ? { ...keep, followupQuestions: DEFAULT_FOLLOWUP_QUESTIONS }
          : { onboarding: current.onboarding, followupQuestions: current.followupQuestions, ...parsed.data };
  const clean = cleanSettings(input);
  if ("error" in clean) return NextResponse.json({ ok: false, error: clean.error }, { status: 400 });
  const saved = await saveChatSettings(clean);
  return NextResponse.json({ ok: true, settings: { ...saved, isDefault: false } });
}
