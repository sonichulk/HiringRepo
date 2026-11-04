"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { adminPost } from "@/lib/adminClient";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ChatMessages } from "@/components/admin/chat/ChatMessages";
import { LiveNowButton } from "@/components/admin/chat/LiveNowButton";
import { ChatProfilePopup } from "@/components/admin/chat/ChatProfilePopup";
import { PortalLoginButton } from "@/components/admin/chat/PortalLoginButton";
import { FollowupInviteDialog } from "@/components/admin/chat/FollowupInviteDialog";
import {
  MAX_MESSAGE,
  fillOnboarding,
  needsAttention,
  type AdminSessionView,
  type ChatKind,
  type ChatSummary,
  type OnboardingMessage,
} from "@/lib/chat";
import { newId } from "@/lib/id";
import { FULL_VERIFIED } from "@/lib/candidateStatus";

/**
 * The Live chat tab: every conversation on the left, the open one on the right.
 *
 * Built for several at once. Each conversation keeps its own draft, the list
 * shows who is waiting and who has written, and switching loses nothing —
 * the server holds the conversation, this only shows it.
 *
 * It says when it cannot see. A list that silently stops updating — because the
 * connection dropped, or the admin session ran out overnight — looks exactly
 * like a quiet afternoon, and a candidate waits for nobody.
 */

type Pending = { clientId: string; text: string; failed?: string };
type Health = "ok" | "offline" | "signed_out";

const LIST_MS = 3000;
const OPEN_MS = 2000;
const TIMEOUT_MS = 12_000;
const SOUND_KEY = "wr-chat-sound";

function ago(iso: string | undefined, now: number) {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "just now", "5 min ago", "2 h ago", or "on 3 Oct" — for a sentence. */
function agoText(iso: string, now: number) {
  const a = ago(iso, now);
  return a === "just now" ? a : /^\d+ (min|h)$/.test(a) ? `${a} ago` : `on ${a}`;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
    setTimeout(() => void ctx.close().catch(() => {}), 700);
  } catch {
    /* sound is a nicety */
  }
}

/** The two kinds of chat, each in its own tab. */
const TABS: { kind: ChatKind; label: string; icon: "headset" | "usersGroup" | "chatDots" }[] = [
  { kind: "interview", label: "Interview chat", icon: "headset" },
  { kind: "onboarding", label: "Onboarding chat", icon: "usersGroup" },
  { kind: "followup", label: "Follow-up chat", icon: "chatDots" },
];

export function LiveChatInbox({
  questions,
  onboarding = [],
  followupQuestions = [],
  initialId,
  initialTab = "interview",
}: {
  questions: string[];
  /** Saved questions for follow-up chats. */
  followupQuestions?: string[];
  /** Ready-made portal explanations, for onboarding chats. */
  onboarding?: OnboardingMessage[];
  initialId?: string;
  initialTab?: ChatKind;
}) {
  const [tab, setTab] = useState<ChatKind>(initialTab);
  /** "Invite to follow-up chat", from an ended interview. */
  const [followupFor, setFollowupFor] = useState(false);
  const [notice, setNotice] = useState("");
  const tabSynced = useRef(!initialId);
  const [list, setList] = useState<ChatSummary[] | null>(null);
  const [health, setHealth] = useState<Health>("ok");
  const [selected, setSelected] = useState<string | undefined>(initialId);
  const [open, setOpen] = useState<AdminSessionView | null>(null);
  const [pending, setPending] = useState<Record<string, Pending[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showQuestions, setShowQuestions] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmVerify, setConfirmVerify] = useState(false);
  /** The candidate whose View info is open, from clicking their name. */
  const [profileOf, setProfileOf] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(true);

  const openRef = useRef<AdminSessionView | null>(null);
  const selectedRef = useRef<string | undefined>(initialId);
  const seenWaiting = useRef<Set<string> | null>(null);
  const lastUnread = useRef<Map<string, number>>(new Map());
  const autoPicked = useRef(!!initialId);
  const listFailures = useRef(0);
  const listEl = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastTyping = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const soundRef = useRef(true);
  soundRef.current = sound;
  openRef.current = open;
  selectedRef.current = selected;

  // The sound setting is remembered on this browser.
  useEffect(() => {
    try {
      if (localStorage.getItem(SOUND_KEY) === "off") setSound(false);
    } catch {
      /* storage unavailable: sound stays on */
    }
  }, []);
  function toggleSound() {
    setSound((v) => {
      try {
        localStorage.setItem(SOUND_KEY, v ? "off" : "on");
      } catch {
        /* not remembered, still toggled */
      }
      return !v;
    });
  }

  /** A 401 means the admin session ran out: say so, and stop pretending to listen. */
  const noteStatus = useCallback((status: number) => {
    if (status === 401) setHealth("signed_out");
  }, []);

  /* -- the list ----------------------------------------------------------- */
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetchWithTimeout("/api/admin/chats", { cache: "no-store" }, TIMEOUT_MS);
        if (res.status === 401) {
          noteStatus(401);
          return; // nothing more will work until they sign in again
        }
        const data = (await res.json()) as {
          ok?: boolean;
          sessions?: ChatSummary[];
          counts?: { attention: number };
        };
        if (!data.ok || !data.sessions) throw new Error("bad reply");
        listFailures.current = 0;
        setHealth("ok");
        setList(data.sessions);

        // A new person waiting, or somebody writing whose chat is not the one
        // on screen, is worth a sound. The open chat is already being read.
        const waitingIds = new Set(data.sessions.filter((s) => s.status === "waiting").map((s) => s.id));
        let ping = false;
        if (seenWaiting.current) {
          ping = [...waitingIds].some((id) => !seenWaiting.current!.has(id));
          for (const s of data.sessions) {
            const before = lastUnread.current.get(s.id) ?? 0;
            const watching = s.id === selectedRef.current && !document.hidden;
            if (s.unread > before && !watching) ping = true;
          }
        }
        seenWaiting.current = waitingIds;
        lastUnread.current = new Map(data.sessions.map((s) => [s.id, s.unread]));
        if (ping && soundRef.current) beep();
        const n = data.counts?.attention ?? 0;
        document.title = n ? `(${n}) Live chat` : "Live chat";
      } catch {
        listFailures.current += 1;
        if (listFailures.current >= 2) setHealth((h) => (h === "signed_out" ? h : "offline"));
      }
      if (!stop) timer = setTimeout(poll, document.hidden ? LIST_MS * 3 : LIST_MS);
    };
    void poll();
    const tick = setInterval(() => setNow(Date.now()), 20_000);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [noteStatus]);

  // On first load, on a wide screen, open whoever has waited longest (else the
  // latest active chat). Once only — and never on a phone, where the list is
  // the screen and "Back" has to be able to return to it.
  useEffect(() => {
    if (autoPicked.current || !list) return;
    autoPicked.current = true;
    if (selected || !window.matchMedia("(min-width: 768px)").matches) return;
    const mine = list.filter((s) => s.kind === tab);
    const first = mine.find((s) => s.status === "waiting") ?? mine.find((s) => s.status === "active");
    if (first) setSelected(first.id);
  }, [list, selected, tab]);

  /* -- the open conversation ---------------------------------------------- */
  const applySession = useCallback((s: AdminSessionView) => {
    setOpen((prev) => {
      if (!prev || prev.id !== s.id || s.reset) return s;
      if (s.total < prev.total) return prev; // an older reply, overtaken
      const start = s.total - s.messages.length;
      return { ...s, messages: prev.messages.slice(0, Math.max(0, start)).concat(s.messages) };
    });
    setPending((p) => {
      const mine = p[s.id];
      if (!mine?.length) return p;
      return { ...p, [s.id]: mine.filter((x) => !s.messages.some((m) => m.clientId === x.clientId)) };
    });
  }, []);

  // Opened from a link to one conversation (Telegram): show the tab it is in.
  useEffect(() => {
    if (tabSynced.current || !open || open.id !== initialId) return;
    tabSynced.current = true;
    setTab(open.kind);
  }, [open, initialId]);

  function switchTab(k: ChatKind) {
    if (k === tab) return;
    setTab(k);
    tabSynced.current = true;
    setShowQuestions(false);
    setActionError("");
    // On a wide screen, open whoever is waiting longest in that tab.
    const mine = (list ?? []).filter((s) => s.kind === k);
    const first = window.matchMedia("(min-width: 768px)").matches
      ? mine.find((s) => s.status === "waiting") ?? mine.find((s) => s.status === "active")
      : undefined;
    setSelected(first?.id);
    try {
      window.history.replaceState(null, "", k === "interview" ? "/admin/chat" : `/admin/chat?tab=${k}`);
    } catch {
      /* the address just does not follow */
    }
  }

  const isEnded = open?.id === selected && open?.status === "ended";
  useEffect(() => {
    if (!selected || isEnded) return; // an ended chat cannot change: nothing to poll for
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    setOpen((o) => (o && o.id === selected ? o : null));
    atBottom.current = true;
    const poll = async () => {
      const cur = openRef.current;
      const from = cur && cur.id === selected ? cur.messages.length : 0;
      try {
        const res = await fetchWithTimeout(`/api/admin/chats/${selected}?from=${from}`, { cache: "no-store" }, TIMEOUT_MS);
        if (stop) return;
        if (res.status === 401) {
          noteStatus(401);
          return;
        }
        if (res.status === 404) {
          setSelected(undefined);
          setOpen(null);
          return;
        }
        const data = (await res.json()) as { ok?: boolean; session?: AdminSessionView };
        if (data.ok && data.session) applySession(data.session);
      } catch {
        /* the list poll reports connection trouble; this one just tries again */
      }
      if (!stop) timer = setTimeout(poll, document.hidden ? OPEN_MS * 4 : OPEN_MS);
    };
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [selected, isEnded, applySession, noteStatus]);

  // Seen what is on screen: tell the server, so the unread badge clears.
  const summary = list?.find((s) => s.id === selected);
  useEffect(() => {
    if (!open || open.id !== selected || !summary?.unread || document.hidden) return;
    void adminPost(`/api/admin/chats/${open.id}`, { action: "read", count: open.messages.length }).catch(() => {});
  }, [open?.id, open?.messages.length, summary?.unread, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  /* -- scrolling ---------------------------------------------------------- */
  const myPending = (open && pending[open.id]) || [];
  useLayoutEffect(() => {
    const el = listEl.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [open?.id, open?.messages.length, myPending.length, open?.candidateTyping]);

  /* -- actions ------------------------------------------------------------ */
  async function act(action: "join" | "end" | "verify") {
    if (!open || busy) return;
    setBusy(action);
    setActionError("");
    try {
      const res = await adminPost(`/api/admin/chats/${open.id}`, { action, from: open.messages.length }, TIMEOUT_MS);
      noteStatus(res.status);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; session?: AdminSessionView; error?: string };
      if (data.ok && data.session) {
        applySession(data.session);
        const st = data.session.candidateStatus;
        if (action === "verify" && st) {
          setList((l) => l?.map((x) => (x.candidateId === data.session!.candidateId ? { ...x, candidateStatus: st } : x)) ?? l);
        }
      } else
        setActionError(
          res.status === 401
            ? "Your admin session has expired — sign in again."
            : data.error === "ended"
              ? "This chat has already ended."
              : data.error === "not_ended"
                ? "End the chat before marking it Full verified."
                : "That did not go through. Try again.",
        );
    } catch {
      setActionError("Could not reach the server.");
    }
    setBusy("");
    setConfirmEnd(false);
    setConfirmVerify(false);
    if (action === "join") setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function deliver(sessionId: string, p: Pending) {
    setPending((all) => ({
      ...all,
      [sessionId]: (all[sessionId] ?? []).map((x) => (x.clientId === p.clientId ? { ...x, failed: undefined } : x)),
    }));
    const fail = (why: string) =>
      setPending((all) => ({
        ...all,
        [sessionId]: (all[sessionId] ?? []).map((x) => (x.clientId === p.clientId ? { ...x, failed: why } : x)),
      }));
    try {
      const cur = openRef.current;
      const res = await adminPost(`/api/admin/chats/${sessionId}`, {
        action: "send",
        text: p.text,
        clientId: p.clientId,
        from: cur && cur.id === sessionId ? cur.messages.length : 0,
      }, TIMEOUT_MS);
      noteStatus(res.status);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; session?: AdminSessionView; error?: string };
      if (data.ok && data.session) {
        if (openRef.current?.id === sessionId) applySession(data.session);
        else setPending((all) => ({ ...all, [sessionId]: (all[sessionId] ?? []).filter((x) => x.clientId !== p.clientId) }));
      } else {
        fail(
          res.status === 401
            ? "Not sent — your admin session has expired."
            : data.error === "ended"
              ? "The chat has ended."
              : data.error === "too_long"
                ? "Too long."
                : "Not sent.",
        );
      }
    } catch {
      fail("Not sent — connection problem.");
    }
  }

  function send() {
    if (!open || open.status === "ended") return;
    const text = (drafts[open.id] ?? "").trim();
    if (!text || text.length > MAX_MESSAGE) return;
    const p: Pending = { clientId: newId(12), text };
    setPending((all) => ({ ...all, [open.id]: [...(all[open.id] ?? []), p] }));
    setDrafts((d) => ({ ...d, [open.id]: "" }));
    atBottom.current = true;
    lastTyping.current = 0;
    void deliver(open.id, p);
  }

  function onDraft(value: string) {
    if (!open) return;
    setDrafts((d) => ({ ...d, [open.id]: value }));
    const t = Date.now();
    if (value.trim() && open.status !== "ended" && t - lastTyping.current > 3000) {
      lastTyping.current = t;
      void adminPost(`/api/admin/chats/${open.id}`, { action: "typing", typing: true }).catch(() => {});
    }
  }

  function insertQuestion(q: string) {
    if (!open) return;
    const cur = drafts[open.id] ?? "";
    onDraft(cur.trim() ? `${cur.trimEnd()}\n${q}` : q);
    setShowQuestions(false);
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function pick(id: string) {
    setSelected(id);
    setShowQuestions(false);
    setActionError("");
    lastTyping.current = 0;
  }

  const draft = open ? drafts[open.id] ?? "" : "";
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft, open?.id]);

  const isOnboarding = open?.kind === "onboarding";
  const activeQuestions = open?.kind === "followup" ? followupQuestions : questions;
  /** The ready-made portal messages for the open chat, filled in for this person. */
  const portalMessages = useMemo(() => {
    if (!open || open.kind !== "onboarding") return [];
    const p = open.portal;
    const values = {
      portal: p?.portalUrl.replace(/^https?:\/\//, ""),
      email: p?.member?.workEmail,
      name: p?.member?.firstName || open.candidateName.split(/\s+/)[0],
      start: p?.member?.startDate,
    };
    return onboarding.map((m) => ({ title: m.title, text: fillOnboarding(m.text, values) }));
  }, [open, onboarding]);

  const asked = useMemo(() => {
    const said = new Set((open?.messages ?? []).filter((m) => m.from === "recruiter").map((m) => m.text.trim()));
    return (q: string) => said.has(q.trim());
  }, [open?.messages]);

  const attention = useMemo(() => {
    const n: Record<ChatKind, number> = { interview: 0, onboarding: 0, followup: 0 };
    for (const s of list ?? []) if (needsAttention(s)) n[s.kind] += 1;
    return n;
  }, [list]);

  const groups = useMemo(() => {
    const l = (list ?? []).filter((s) => s.kind === tab);
    return [
      { key: "waiting", title: "Waiting", items: l.filter((s) => s.status === "waiting") },
      { key: "active", title: "Active", items: l.filter((s) => s.status === "active") },
      { key: "ended", title: "Ended", items: l.filter((s) => s.status === "ended") },
    ];
  }, [list, tab]);
  const tabEmpty = !!list && !groups.some((g) => g.items.length);

  const view = open && open.id === selected ? open : null;

  /* -- render ------------------------------------------------------------- */
  return (
    <div className="space-y-3">
      {health !== "ok" ? (
        <div
          role="alert"
          data-chat-health={health}
          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
            health === "signed_out" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {health === "signed_out" ? (
            <>
              <span>Your admin session has expired, so new chats and messages are not arriving here.</span>
              <a href="/admin/login" className="rounded-full bg-red-700 px-3 py-1 text-xs font-bold text-white hover:bg-red-800">
                Sign in again
              </a>
            </>
          ) : (
            <span>Connection problem — trying again. New chats and messages may be delayed.</span>
          )}
        </div>
      ) : null}

      <div role="tablist" aria-label="Chats" className="inline-flex flex-wrap gap-1 rounded-2xl border border-navy-100 bg-white p-1 shadow-soft">
        {TABS.map((t) => {
          const on = t.kind === tab;
          const n = attention[t.kind];
          return (
            <button
              key={t.kind}
              type="button"
              role="tab"
              aria-selected={on}
              data-chat-tab={t.kind}
              onClick={() => switchTab(t.kind)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                on ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-navy-50 hover:text-navy-900"
              }`}
            >
              <Icon name={t.icon} className={`h-4 w-4 ${on ? "text-brand-400" : ""}`} />
              {t.label}
              {n ? (
                <span
                  data-chat-tab-count={t.kind}
                  className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white"
                >
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="chat-inbox-h grid min-h-[520px] overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-soft md:grid-cols-[320px_1fr]">
        {/* ---- conversations ---- */}
        <aside className={`${selected ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-navy-100 bg-navy-50/40`}>
          <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
            <p className="text-sm font-bold text-navy-900">Conversations</p>
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={sound}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-navy-500 hover:bg-navy-100"
              title="Play a sound when somebody starts a chat or writes"
            >
              Sound {sound ? "on" : "off"}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" data-chat-list>
            {list === null ? (
              <p className="p-4 text-sm text-navy-500">{health === "ok" ? "Loading…" : "Could not load chats — retrying…"}</p>
            ) : tabEmpty ? (
              <div className="p-6 text-center" data-chat-empty={tab}>
                <Icon name={TABS.find((t) => t.kind === tab)?.icon ?? "headset"} className="mx-auto h-8 w-8 text-navy-300" />
                <p className="mt-2 text-sm font-semibold text-navy-700">
                  {tab === "onboarding" ? "No onboarding chats yet" : tab === "followup" ? "No follow-up chats yet" : "No interview chats yet"}
                </p>
                <p className="mt-1 text-xs text-navy-500">
                  {tab === "followup"
                    ? "When an interview chat has ended, press Invite to follow-up chat — in that chat here, or in View info → Assessment. When they press Start chat, they appear here and you get a Telegram message."
                    : tab === "onboarding"
                    ? "Accept a signed agreement, then press Invite to onboarding chat in View info → Agreement. When they press Start chat, they appear here and you get a Telegram message."
                    : "Send a final interview chat link from a candidate’s View info. When they press Start chat, they appear here and you get a Telegram message."}
                </p>
              </div>
            ) : (
              groups.map((g) =>
                g.items.length ? (
                  <div key={g.key}>
                    <p className="sticky top-0 z-[1] bg-navy-50/95 px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-navy-500 backdrop-blur">
                      {g.title} · {g.items.length}
                    </p>
                    {g.items.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        data-chat-item={s.candidateName}
                        onClick={() => pick(s.id)}
                        aria-current={s.id === selected ? "true" : undefined}
                        className={`flex w-full items-start gap-3 border-l-4 px-4 py-3 text-left transition ${
                          s.id === selected
                            ? "border-brand-500 bg-white"
                            : s.status === "waiting"
                              ? "border-amber-300 bg-amber-50/60 hover:bg-amber-50"
                              : "border-transparent hover:bg-white"
                        }`}
                      >
                        <span className="relative shrink-0">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">
                            {initials(s.candidateName)}
                          </span>
                          {s.status !== "ended" ? (
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                                s.candidateOnline ? "bg-green-500" : "bg-navy-300"
                              }`}
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-bold text-navy-900">{s.candidateName}</span>
                            <span className="shrink-0 text-[10px] font-medium text-navy-400">
                              {s.status === "waiting" ? `waiting ${ago(s.startedAt, now)}` : ago(s.lastMessageAt, now)}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5 truncate text-[11px] text-navy-500">
                            {s.kind !== "onboarding" && s.candidateStatus === FULL_VERIFIED ? (
                              <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white">
                                Full verified
                              </span>
                            ) : null}
                            <span className="truncate">{[s.candidateCountry, s.candidatePosition].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span className={`truncate text-xs ${s.unread ? "font-semibold text-navy-800" : "text-navy-500"}`}>
                              {s.candidateTyping
                                ? "typing…"
                                : s.preview
                                  ? `${s.preview.from === "recruiter" ? "You: " : ""}${s.preview.text}`
                                  : s.status === "waiting"
                                    ? "Waiting for you to join"
                                    : ""}
                            </span>
                            {s.unread ? (
                              <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                                {s.unread}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null,
              )
            )}
          </div>
        </aside>

        {/* ---- the conversation ---- */}
        <section className={`${selected ? "flex" : "hidden md:flex"} min-h-0 flex-col`}>
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Icon name="chat" className="h-8 w-8" />
              </span>
              <p className="mt-3 text-base font-bold text-navy-900">Select a conversation</p>
              <p className="mt-1 max-w-sm text-sm text-navy-500">
                You can hold several chats at once — switch between them on the left. Nothing is lost
                when you switch.
              </p>
            </div>
          ) : !view ? (
            <div className="flex items-center gap-3 p-4">
              <button
                type="button"
                onClick={() => setSelected(undefined)}
                className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100 md:hidden"
                aria-label="Back to conversations"
              >
                <Icon name="chevronLeft" className="h-5 w-5" />
              </button>
              <p className="text-sm text-navy-500">Loading conversation…</p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelected(undefined)}
                    className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100 md:hidden"
                    aria-label="Back to conversations"
                  >
                    <Icon name="chevronLeft" className="h-5 w-5" />
                  </button>
                  {/* Their name opens View info — everything on record, without
                      leaving the conversation. */}
                  <button
                    type="button"
                    onClick={() => setProfileOf(view.candidateId)}
                    tabIndex={-1}
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white transition hover:ring-2 hover:ring-brand-400"
                  >
                    {initials(view.candidateName)}
                  </button>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setProfileOf(view.candidateId)}
                      title="View info — all their information"
                      data-chat-profile
                      className="group flex max-w-full items-center gap-1.5 text-left"
                    >
                      <span className="truncate text-sm font-bold text-navy-900 group-hover:text-brand-700 group-hover:underline" data-chat-title>
                        {view.candidateName}
                      </span>
                      <span className="shrink-0 rounded-full border border-navy-200 px-1.5 py-px text-[10px] font-semibold text-navy-500 group-hover:border-brand-300 group-hover:text-brand-700">
                        View info
                      </span>
                    </button>
                    {view.kind === "onboarding" ? (
                      <span className="mt-0.5 inline-flex rounded-full bg-brand-500 px-2 py-px text-[10px] font-bold uppercase tracking-wide text-navy-900">
                        Onboarding chat
                      </span>
                    ) : view.kind === "followup" ? (
                      <span className="mt-0.5 inline-flex rounded-full bg-navy-900 px-2 py-px text-[10px] font-bold uppercase tracking-wide text-brand-300">
                        Follow-up chat
                      </span>
                    ) : null}
                    <p className="truncate text-xs text-navy-500">
                      {view.status === "ended" ? (
                        <>{ago(view.endedAt, now) === "just now" ? "Ended just now" : `Ended ${ago(view.endedAt, now)} ago`}</>
                      ) : view.candidateTyping ? (
                        <span className="font-semibold text-brand-700">typing…</span>
                      ) : view.candidateOnline ? (
                        <span className="font-semibold text-green-700">● On the chat page</span>
                      ) : (
                        <>
                          Not on the page
                          {view.candidateSeenAt
                            ? ago(view.candidateSeenAt, now) === "just now"
                              ? " · last seen just now"
                              : ` · last seen ${ago(view.candidateSeenAt, now)} ago`
                            : ""}
                        </>
                      )}
                      {[view.candidateCountry, view.candidatePosition, view.candidateEmail].filter(Boolean).length
                        ? ` · ${[view.candidateCountry, view.candidatePosition, view.candidateEmail].filter(Boolean).join(" · ")}`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {view.kind === "onboarding" ? <PortalLoginButton key={`portal-${view.id}`} view={view} onSent={applySession} /> : null}
                  {/* Here, and they are not: email them that the team is live. */}
                  {view.status !== "ended" && !view.candidateOnline ? (
                    <LiveNowButton
                      key={view.id}
                      candidateId={view.candidateId}
                      chat={view.kind}
                      candidateName={view.candidateName}
                      email={view.candidateEmail}
                      reminders={view.reminders ?? []}
                      onSent={(r) =>
                        setOpen((o) => (o && o.id === view.id ? { ...o, reminders: r.reminders } : o))
                      }
                    />
                  ) : null}
                  {view.status === "waiting" ? (
                    <button
                      type="button"
                      onClick={() => void act("join")}
                      disabled={!!busy}
                      className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-700 disabled:opacity-50"
                    >
                      <Icon name="chat" className="h-3.5 w-3.5" />
                      {busy === "join" ? "Joining…" : "Join chat"}
                    </button>
                  ) : null}
                  {view.status !== "ended" ? (
                    <button
                      type="button"
                      onClick={() => setConfirmEnd(true)}
                      disabled={!!busy}
                      className="rounded-full border border-navy-200 px-4 py-2 text-xs font-bold text-navy-700 transition hover:bg-navy-50 disabled:opacity-50"
                    >
                      End chat
                    </button>
                  ) : (
                    <>
                      <span className="rounded-full bg-navy-100 px-3 py-1 text-[11px] font-bold text-navy-600">
                        {view.endedReason === "replaced" ? "Closed — new link sent" : "Ended"}
                      </span>
                      {/* After the interview: chat with them again, with a reason. */}
                      {view.kind === "interview" && view.endedReason !== "replaced" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setNotice("");
                            setFollowupFor(true);
                          }}
                          disabled={!view.candidateEmail?.includes("@")}
                          data-followup-invite
                          className="inline-flex items-center gap-1 rounded-full bg-brand-500 px-3 py-1 text-[11px] font-bold text-navy-900 transition hover:bg-brand-400 disabled:opacity-50"
                        >
                          <Icon name="send" className="h-3.5 w-3.5" /> Invite to follow-up chat
                        </button>
                      ) : null}
                      {/* The outcome, set in the same place the interview was
                          held. Once set it is a label, not a button: changing
                          it back is done from the status in View info. */}
                      {view.kind === "onboarding" ? null : view.candidateStatus === FULL_VERIFIED ? (
                        <span
                          data-full-verified="done"
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white"
                        >
                          <Icon name="checkCircle" className="h-3.5 w-3.5" /> Full verified
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-full-verified="button"
                          onClick={() => setConfirmVerify(true)}
                          disabled={!!busy}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
                        >
                          <Icon name="shield" className="h-3.5 w-3.5" /> Full verified
                        </button>
                      )}
                    </>
                  )}
                </div>
              </header>

              {actionError ? (
                <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">{actionError}</p>
              ) : null}
              {notice ? (
                <p role="status" className="border-b border-green-200 bg-green-50 px-4 py-2 text-xs font-semibold text-green-800" data-followup-result="ok">
                  {notice}
                </p>
              ) : null}
              {view.kind === "followup" && view.reason ? (
                <p className="border-b border-brand-200 bg-brand-50 px-4 py-1.5 text-[11px] font-medium text-navy-700" data-chat-reason>
                  <strong>Why we asked:</strong> {view.reason}
                </p>
              ) : null}

              {view.kind === "onboarding" && view.portal ? (
                <p
                  data-portal-state={
                    !view.portal.member ? "not_member" : view.portal.member.passwordSet ? "signed_in" : view.portal.member.invitedAt ? "sent" : "member"
                  }
                  className={`border-b px-4 py-1.5 text-[11px] font-medium ${
                    view.portal.member?.passwordSet ? "border-green-200 bg-green-50 text-green-800" : "border-brand-200 bg-brand-50 text-navy-700"
                  }`}
                >
                  <Icon name="key" className="mr-1 inline h-3 w-3 align-[-2px]" />
                  {!view.portal.member ? (
                    <>
                      Not on the team yet. Press <strong>Add to team first</strong>, check the form and save,
                      then come back here and press <strong>Send portal login</strong>.
                    </>
                  ) : view.portal.member.passwordSet ? (
                    <>
                      Signed in to the portal and chose their own password
                      {view.portal.member.lastSignInAt ? ` · last sign-in ${agoText(view.portal.member.lastSignInAt, now)}` : ""}.{" "}
                      <span data-portal-bank={view.portal.member.activated ? "active" : view.portal.member.bank}>
                        {view.portal.member.activated
                          ? "Account active."
                          : view.portal.member.bank === "pending"
                            ? "Bank details added — approve them on their Team page to activate the account."
                            : view.portal.member.bank === "refused"
                              ? "Bank details refused — waiting for new ones."
                              : "Bank details not added yet (required to activate)."}
                      </span>
                    </>
                  ) : view.portal.member.invitedAt ? (
                    <>Portal login emailed {agoText(view.portal.member.invitedAt, now)} · not signed in yet.</>
                  ) : (
                    <>
                      On the team{view.portal.member.workEmail ? ` as ${view.portal.member.workEmail}` : ""} · portal login not sent yet.
                    </>
                  )}{" "}
                  <a href={view.portal.member?.url ?? view.portal.addUrl} target="_blank" rel="noopener" className="font-semibold underline">
                    {view.portal.member ? "Team page" : "Team panel"}
                  </a>
                </p>
              ) : null}

              {view.status !== "ended" && view.reminders?.length ? (
                (() => {
                  const r = view.reminders[view.reminders.length - 1];
                  return (
                    <p
                      data-live-now="last"
                      className={`border-b px-4 py-1.5 text-[11px] font-medium ${
                        r.openedAt ? "border-green-200 bg-green-50 text-green-800" : "border-navy-100 bg-navy-50/60 text-navy-600"
                      }`}
                    >
                      <Icon name="mail" className="mr-1 inline h-3 w-3 align-[-2px]" />
                      {r.kind === "nudge" ? "Reminder to start" : <>&ldquo;We&rsquo;re live&rdquo;</>} email sent {agoText(r.sentAt, now)}
                      {view.reminders.length > 1 ? ` (${view.reminders.length} reminders in total)` : ""}
                      {r.openedAt
                        ? ` · opened ${agoText(r.openedAt, now)}`
                        : " · not opened yet"}
                    </p>
                  );
                })()
              ) : null}

              <div
                ref={listEl}
                onScroll={() => {
                  const el = listEl.current;
                  if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
                className="min-h-0 flex-1 overflow-y-auto bg-cream-100/60 px-4 py-3"
                data-chat-messages
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label={`Conversation with ${view.candidateName}`}
              >
                <ChatMessages messages={view.messages} />
                {myPending.map((p) => (
                  <div key={p.clientId} className="mt-2.5 flex justify-end">
                    <div className="flex max-w-[75%] flex-col items-end">
                      <div
                        className={`whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed ${
                          p.failed ? "border border-red-200 bg-red-50 text-red-900" : "bg-navy-900/60 text-white"
                        }`}
                      >
                        {p.text}
                      </div>
                      {p.failed ? (
                        <span className="mt-0.5 flex gap-2 text-[11px] font-semibold text-red-700" role="alert">
                          {p.failed}
                          {view.status !== "ended" ? (
                            <button type="button" className="underline" onClick={() => void deliver(view.id, p)}>
                              Try again
                            </button>
                          ) : null}
                        </span>
                      ) : (
                        <span className="mt-0.5 text-[10px] text-navy-400">Sending…</span>
                      )}
                    </div>
                  </div>
                ))}
                {view.candidateTyping ? (
                  <div className="mt-2.5 flex">
                    <div className="rounded-2xl rounded-bl-md border border-navy-100 bg-white px-3.5 py-2.5 shadow-sm">
                      <span className="sr-only">{view.candidateName} is typing</span>
                      <span className="flex gap-1" aria-hidden>
                        {[0, 150, 300].map((d) => (
                          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-300" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {view.status === "ended" ? (
                <div className="border-t border-navy-100 bg-white px-4 py-3 text-xs text-navy-500">
                  This chat has ended and cannot be reopened. To talk again, send a new chat link from
                  their View info{view.kind === "onboarding" ? " → Agreement" : ""}.
                </div>
              ) : (
                <div className="border-t border-navy-100 bg-white">
                  {showQuestions && isOnboarding ? (
                    <div className="max-h-64 overflow-y-auto border-b border-navy-100 bg-navy-50/50 p-2" data-portal-messages>
                      {portalMessages.length === 0 ? (
                        <p className="p-2 text-xs text-navy-500">
                          No portal messages. Add some in{" "}
                          <Link href="/admin/settings/chat" className="font-semibold text-brand-700 underline">
                            Settings → Live chat
                          </Link>
                          .
                        </p>
                      ) : (
                        portalMessages.map((m, i) => (
                          <button
                            key={`${i}-${m.title}`}
                            type="button"
                            onClick={() => insertQuestion(m.text)}
                            data-portal-message={m.title}
                            className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-navy-700 transition hover:bg-white"
                          >
                            <span
                              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                                asked(m.text) ? "bg-green-600 text-white" : "bg-navy-200 text-navy-600"
                              }`}
                            >
                              {asked(m.text) ? <Icon name="check" className="h-2.5 w-2.5" /> : i + 1}
                            </span>
                            <span className={`min-w-0 ${asked(m.text) ? "text-navy-400" : ""}`}>
                              <span className="block font-bold text-navy-900">{m.title}</span>
                              <span className="line-clamp-2 whitespace-pre-line">{m.text}</span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : showQuestions ? (
                    <div className="max-h-56 overflow-y-auto border-b border-navy-100 bg-navy-50/50 p-2" data-saved-questions>
                      {activeQuestions.length === 0 ? (
                        <p className="p-2 text-xs text-navy-500">
                          No saved questions. Add some in{" "}
                          <Link href="/admin/settings/chat" className="font-semibold text-brand-700 underline">
                            Settings → Live chat
                          </Link>
                          .
                        </p>
                      ) : (
                        activeQuestions.map((q, i) => (
                          <button
                            key={`${i}-${q.slice(0, 24)}`}
                            type="button"
                            onClick={() => insertQuestion(q)}
                            className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-navy-700 transition hover:bg-white"
                          >
                            <span
                              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                                asked(q) ? "bg-green-600 text-white" : "bg-navy-200 text-navy-600"
                              }`}
                            >
                              {asked(q) ? <Icon name="check" className="h-2.5 w-2.5" /> : i + 1}
                            </span>
                            <span className={asked(q) ? "text-navy-400" : ""}>{q}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                  <form
                    className="flex items-end gap-2 p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send();
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowQuestions((v) => !v)}
                      aria-expanded={showQuestions}
                      className={`flex h-10 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-bold transition ${
                        showQuestions ? "border-brand-400 bg-brand-50 text-brand-800" : "border-navy-200 text-navy-600 hover:bg-navy-50"
                      }`}
                      title={isOnboarding ? "Ready-made messages that explain the portal" : "Saved questions"}
                    >
                      <Icon name="document" className="h-3.5 w-3.5" /> {isOnboarding ? "Portal guide" : "Questions"}
                    </button>
                    {/* 16px on phones, where iOS zooms into any smaller field. */}
                    <textarea
                      ref={inputRef}
                      rows={1}
                      value={draft}
                      onChange={(e) => onDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      placeholder={
                        view.status === "waiting" ? "Type to join and reply…" : "Type a message — Enter to send, Shift+Enter for a new line"
                      }
                      aria-label="Message"
                      className="max-h-44 min-h-[40px] flex-1 resize-none rounded-2xl border-2 border-navy-100 bg-cream-50 px-3.5 py-2 text-base leading-relaxed text-navy-900 focus:border-brand-400 focus:bg-white focus:outline-none sm:text-sm"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || draft.length > MAX_MESSAGE}
                      aria-label="Send"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-navy-900 transition hover:bg-brand-400 disabled:opacity-40"
                    >
                      <Icon name="send" className="h-4 w-4" />
                    </button>
                  </form>
                  {draft.length > MAX_MESSAGE - 300 ? (
                    <p className={`-mt-2 px-4 pb-2 text-right text-[11px] ${draft.length > MAX_MESSAGE ? "font-bold text-red-700" : "text-navy-400"}`}>
                      {draft.length} / {MAX_MESSAGE}
                    </p>
                  ) : null}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {profileOf ? (
        <ChatProfilePopup
          candidateId={profileOf}
          onClose={() => setProfileOf(null)}
          onStatusChange={(st) => {
            setList((l) => l?.map((x) => (x.candidateId === profileOf ? { ...x, candidateStatus: st } : x)) ?? l);
            setOpen((o) => (o && o.candidateId === profileOf ? { ...o, candidateStatus: st } : o));
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmVerify}
        icon="shield"
        title="Mark as Full verified?"
        confirmLabel={busy === "verify" ? "Saving…" : "Mark Full verified"}
        busy={busy === "verify"}
        onCancel={() => setConfirmVerify(false)}
        onConfirm={() => void act("verify")}
        body={
          <>
            {view?.candidateName || "This candidate"}&rsquo;s status changes to{" "}
            <strong className="text-navy-900">Full verified</strong>, and their row in Accepted turns
            green. You can change the status back at any time from their View info.
          </>
        }
      />

      {view ? (
        <FollowupInviteDialog
          open={followupFor}
          candidateId={view.candidateId}
          candidateName={view.candidateName}
          email={view.candidateEmail}
          onClose={() => setFollowupFor(false)}
          onSent={() => setNotice("Follow-up invitation sent. They appear in the Follow-up chat tab when they press Start chat.")}
        />
      ) : null}

      <ConfirmDialog
        open={confirmEnd}
        icon="close"
        title="End this chat?"
        confirmLabel={busy === "end" ? "Ending…" : "End chat"}
        busy={busy === "end"}
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() => void act("end")}
        body={
          <>
            {view?.candidateName || "The candidate"} will see that the chat has ended and will not be
            able to write again. The conversation is kept on their record. To talk again later you
            would send a new chat link.
          </>
        }
      />
    </div>
  );
}
