"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { ChatMessages } from "@/components/admin/chat/ChatMessages";
import { LiveNowButton } from "@/components/admin/chat/LiveNowButton";
import { FollowupInviteDialog } from "@/components/admin/chat/FollowupInviteDialog";
import type { ChatMessage, LiveReminder } from "@/lib/chat";

/**
 * View info → Assessment, under the interview chat: the follow-up chat. Only
 * once the interview chat has ended — before that, there is nothing to follow
 * up. The invitation, why it was sent, reminders, and the transcripts.
 */

interface FollowupSession {
  id: string;
  status: "waiting" | "active" | "ended";
  linkSentAt: string;
  startedAt: string;
  endedAt?: string;
  reason?: string;
  messages: ChatMessage[];
}

function fmt(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function FollowupChatPanel({
  candidate,
  onChange,
}: {
  candidate: { id: string; fullName: string; email?: string; followupChatLinks?: string[] };
  onChange: (patch: { followupChatLinks?: string[]; followupState?: "sent" | "started" | "done" }) => void;
}) {
  const [data, setData] = useState<{
    canFollowup: boolean;
    sessions: FollowupSession[];
    reason?: string;
    reminders: LiveReminder[];
  } | null>(null);
  const [asking, setAsking] = useState(false);
  const [sentNote, setSentNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const seq = useRef(0);
  const links = candidate.followupChatLinks ?? [];
  const last = links.at(-1);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await fetchWithTimeout(`/api/admin/candidates/${candidate.id}/chat`, { cache: "no-store" }, 12_000);
      const d = (await res.json()) as {
        ok?: boolean;
        canFollowup?: boolean;
        followupSessions?: FollowupSession[];
        followupReason?: string;
        followupReminders?: LiveReminder[];
      };
      if (mine !== seq.current || !d.ok) return;
      setData({
        canFollowup: !!d.canFollowup,
        sessions: d.followupSessions ?? [],
        reason: d.followupReason,
        reminders: d.followupReminders ?? [],
      });
    } catch {
      /* the next look tries again */
    }
  }, [candidate.id]);

  useEffect(() => {
    setData(null);
    setSentNote("");
    void load();
  }, [load]);

  if (!data || (!data.canFollowup && !links.length)) return null;
  const current = last ? data.sessions.find((s) => s.linkSentAt === last) : undefined;
  const state = !last ? "not_sent" : !current ? "sent" : current.status === "ended" ? "done" : "started";
  const shown = showAll ? data.sessions : data.sessions.slice(0, 1);

  return (
    <section className="mt-6 rounded-2xl border border-navy-100 bg-white p-5" data-followup-panel={state}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy-500">
            <Icon name="chatDots" className="h-4 w-4" /> Follow-up chat
          </h3>
          <p className="mt-1.5 text-sm text-navy-600">
            After the interview: chat with them again when you need more information.
          </p>
          {last ? (
            <p className="mt-2 text-xs text-navy-600" data-followup-state>
              Invitation sent {fmt(last)} ·{" "}
              {state === "sent" ? "not started yet" : state === "started" ? "chat in progress" : "chat ended"}.{" "}
              <Link href="/admin/chat?tab=followup" className="font-semibold text-brand-700 underline">
                Open follow-up chats
              </Link>
            </p>
          ) : null}
          {data.reason ? (
            <p className="mt-2 rounded-lg border-l-4 border-brand-500 bg-cream-100 px-3 py-1.5 text-sm text-navy-800" data-followup-reason-shown>
              {data.reason}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state === "sent" ? (
            <LiveNowButton
              candidateId={candidate.id}
              candidateName={candidate.fullName}
              email={candidate.email}
              reminders={data.reminders}
              kind="nudge"
              chat="followup"
              size="sm"
              onSent={(r) => setData((d) => (d ? { ...d, reminders: r.reminders } : d))}
            />
          ) : null}
          <button
            type="button"
            onClick={() => setAsking(true)}
            disabled={!candidate.email?.includes("@")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-2 text-sm font-bold text-navy-900 transition hover:bg-brand-400 disabled:opacity-50"
            data-followup-invite
          >
            <Icon name="send" className="h-4 w-4" />
            {last ? "Send a new follow-up invitation" : "Invite to follow-up chat"}
          </button>
        </div>
      </div>
      {sentNote ? (
        <p role="status" className="mt-2 text-xs font-semibold text-green-700" data-followup-result="ok">
          {sentNote}
        </p>
      ) : null}

      {data.sessions.length ? (
        <div className="mt-3 border-t border-navy-100 pt-3">
          {shown.map((s) => (
            <div key={s.id} className="mb-3">
              <p className="text-xs font-semibold text-navy-500">
                Started {fmt(s.startedAt)}
                {s.endedAt ? ` · ended ${fmt(s.endedAt)}` : ""} · {s.messages.filter((m) => m.from !== "system").length} messages
              </p>
              <div className="mt-2 max-h-80 overflow-y-auto rounded-lg bg-cream-100/60 p-3" data-followup-transcript>
                <ChatMessages messages={s.messages} compact />
              </div>
            </div>
          ))}
          {data.sessions.length > 1 ? (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-brand-700 underline">
              {showAll ? "Show only the latest follow-up chat" : `Show all ${data.sessions.length} follow-up chats`}
            </button>
          ) : null}
        </div>
      ) : null}

      <FollowupInviteDialog
        open={asking}
        candidateId={candidate.id}
        candidateName={candidate.fullName}
        email={candidate.email}
        again={!!last}
        onClose={() => setAsking(false)}
        onSent={(r) => {
          onChange({ followupChatLinks: r.followupChatLinks, followupState: "sent" });
          setSentNote("Invitation sent. They appear in Live chat → Follow-up chat when they press Start chat.");
          void load();
        }}
      />
    </section>
  );
}
