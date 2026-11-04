"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { adminPost } from "@/lib/adminClient";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  NUDGE_WARN_HOURS,
  REMINDER_WARN_MINUTES,
  reminderKind,
  type LiveReminder,
  type ReminderKind,
} from "@/lib/chat";

/**
 * The two chat reminders, one button each:
 *
 *   "live"   Send "We're live" email — the recruiter is in the chat and the
 *            candidate is not (Live chat header, View info)
 *   "nudge"  Send reminder — sent the link, never started (View info)
 *
 * Nothing goes out before the confirm step, and the step warns when one of the
 * same kind went out recently: two in a row read as spam.
 */

export interface LiveNowResult {
  newLink: boolean;
  reminders: LiveReminder[];
  chatLinkSentAt?: string;
  chatLinks?: string[];
  link?: string;
}

function time(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function minutesAgo(iso: string) {
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
}

function agoWords(minutes: number) {
  if (!minutes) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.round(minutes / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

const ERRORS: Record<string, string> = {
  warmup_limit: "today's sending limit is reached",
  no_email: "no email address on file",
  no_link: "send them a chat link first",
  ended: "this chat has already ended — send a new chat link instead",
  too_soon: "one was sent less than a minute ago",
  started: "they have already started the chat",
};

const WORDS: Record<ReminderKind, { button: string; title: string; attr: string; hint: string }> = {
  live: {
    button: "Send “We’re live” email",
    title: "Send the “We’re live” email?",
    attr: "data-live-now",
    hint: "Email them that the recruitment team is live now, with a button to the chat",
  },
  nudge: {
    button: "Send reminder",
    title: "Send a reminder to start the chat?",
    attr: "data-chat-reminder",
    hint: "Remind them they have not started their final interview chat yet",
  },
};

export function LiveNowButton({
  candidateId,
  candidateName,
  email,
  reminders,
  linkExpired,
  size = "md",
  kind = "live",
  chat = "interview",
  onSent,
}: {
  candidateId: string;
  candidateName: string;
  email?: string;
  reminders: LiveReminder[];
  /** The link has run out and never opened a chat: the email carries a fresh one. */
  linkExpired?: boolean;
  size?: "sm" | "md";
  kind?: ReminderKind;
  /** Which chat the email is about: the interview, or the onboarding chat. */
  chat?: "interview" | "onboarding" | "followup";
  onSent: (r: LiveNowResult) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const hasEmail = !!email?.includes("@");
  const words = WORDS[kind];
  const mark = { [words.attr]: "button" };
  const last = reminders.filter((r) => reminderKind(r) === kind).at(-1);
  const warnMinutes = kind === "nudge" ? NUDGE_WARN_HOURS * 60 : REMINDER_WARN_MINUTES;
  const recent = last && minutesAgo(last.sentAt) < warnMinutes ? last : undefined;

  async function send() {
    if (busy) return;
    setBusy(true);
    setResult("");
    try {
      const res = await adminPost(`/api/admin/candidates/${candidateId}/chat`, { action: "remind", kind, ...(chat !== "interview" ? { chat } : {}) }, 20_000);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<LiveNowResult>;
      if (data.ok) {
        setResult("sent");
        onSent({
          newLink: !!data.newLink,
          reminders: data.reminders ?? [],
          chatLinkSentAt: data.chatLinkSentAt,
          chatLinks: data.chatLinks,
          link: data.link,
        });
      } else {
        setResult(
          res.status === 401
            ? "your admin session has expired — sign in again"
            : ERRORS[data.error ?? ""] ?? data.error ?? "failed",
        );
      }
    } catch {
      setResult("could not reach the server");
    }
    setBusy(false);
    setAsking(false);
  }

  const small = size === "sm";
  // No "sent" note beside it: the dated list (View info) and the bar under
  // the chat header already say so. A failure pops under the button, so the
  // row of buttons never reflows.
  return (
    <>
      <span className="relative inline-flex">
        <button
          type="button"
          {...mark}
          onClick={() => {
            setResult("");
            setAsking(true);
          }}
          disabled={!hasEmail || busy}
          title={hasEmail ? words.hint : "No email on file"}
          className={`inline-flex items-center gap-1.5 rounded-full border font-bold transition disabled:opacity-50 ${
            kind === "nudge"
              ? "border-navy-200 bg-white text-navy-700 hover:bg-navy-50"
              : "border-green-300 bg-green-50 text-green-800 hover:bg-green-100"
          } ${small ? "px-3.5 py-1.5 text-xs" : "px-4 py-2 text-xs"}`}
        >
          <Icon name={kind === "nudge" ? "clock" : "mail"} className="h-3.5 w-3.5" />
          {words.button}
        </button>
        {result && result !== "sent" ? (
          <span
            role="alert"
            {...{ [words.attr]: "error" }}
            className={`absolute top-full z-20 mt-1.5 w-max max-w-[18rem] rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 shadow-sm ${
              small ? "left-0" : "right-0"
            }`}
          >
            Not sent ({result}).
            <button type="button" onClick={() => setResult("")} className="ml-2 underline">
              OK
            </button>
          </span>
        ) : null}
      </span>

      <ConfirmDialog
        open={asking}
        icon="mail"
        title={words.title}
        confirmLabel={busy ? "Sending…" : "Send email"}
        busy={busy}
        warning={
          recent
            ? `You already sent one ${agoWords(minutesAgo(recent.sentAt))}${
                recent.openedAt ? ", and they opened it" : ", and they have not opened it yet"
              }. Another so soon can feel like spam.`
            : undefined
        }
        onCancel={() => setAsking(false)}
        onConfirm={() => void send()}
        body={
          <>
            An email goes to <strong className="text-navy-900">{candidateName || "this candidate"}</strong>
            {email ? (
              <>
                {" "}at <span className="font-medium text-navy-800">{email}</span>
              </>
            ) : null}
            {kind === "nudge" ? (
              <>
                {" "}saying <em>&ldquo;Your final interview chat is waiting&rdquo;</em> &mdash; they have
                not started it yet &mdash; with a{" "}
                <strong className="text-navy-900">Start my final interview chat</strong> button.{" "}
              </>
            ) : (
              <>
                {" "}saying <em>&ldquo;Our recruitment team is live now&rdquo;</em>, with a{" "}
                <strong className="text-navy-900">Join the chat now</strong> button.{" "}
              </>
            )}
            {linkExpired
              ? "Their chat link has expired, so the email carries a fresh one (valid 7 days) and the old one stops working."
              : "It uses their same chat link — nothing about their chat changes."}{" "}
            When they open it you get a Telegram message.
          </>
        }
      />
    </>
  );
}

/** The dated list of one kind of reminder, and whether each was opened. */
export function LiveNowHistory({
  reminders,
  kind = "live",
  className = "",
}: {
  reminders: LiveReminder[];
  kind?: ReminderKind;
  className?: string;
}) {
  const mine = reminders.filter((r) => reminderKind(r) === kind);
  if (!mine.length) return null;
  return (
    <div className={`text-xs text-navy-600 ${className}`} {...{ [WORDS[kind].attr]: "history" }}>
      <p className="font-semibold text-navy-500">
        {kind === "nudge" ? "Reminders to start the chat" : <>&ldquo;We&rsquo;re live&rdquo; emails</>}
      </p>
      <ol className="mt-1 space-y-0.5">
        {mine.map((r, i) => (
          <li key={r.id} className="flex flex-wrap gap-x-2">
            <span className="font-semibold text-navy-400">{i + 1}.</span>
            <span>
              {time(r.sentAt)}
              {r.by ? ` by ${r.by}` : ""}
            </span>
            {r.openedAt ? (
              <span className="font-semibold text-green-700">— opened {time(r.openedAt)}</span>
            ) : (
              <span className="text-navy-400">— not opened yet</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
