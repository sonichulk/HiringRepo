"use client";

import { useState } from "react";
import { newId } from "@/lib/id";
import { Icon } from "@/components/Icon";
import { adminPost } from "@/lib/adminClient";
import {
  MAX_HOURS_TEXT,
  MAX_ONBOARDING,
  MAX_ONBOARDING_TEXT,
  MAX_ONBOARDING_TITLE,
  MAX_QUESTION,
  MAX_QUESTIONS,
  type OnboardingMessage,
} from "@/lib/chat";

/**
 * Saved questions for the Live chat, and the hours line candidates see.
 *
 * Each question carries its own id while it is being edited, so moving or
 * deleting one moves the right text box — keyed by position, the box you are
 * typing in would silently become a different question.
 */
type Item = { key: string; text: string };
const itemsOf = (qs: string[]): Item[] => qs.map((text) => ({ key: newId(6), text }));
type Guide = { key: string; title: string; text: string };
const guidesOf = (ms: OnboardingMessage[]): Guide[] => ms.map((m) => ({ key: newId(6), ...m }));

type Saved = {
  questions: string[];
  onboarding: OnboardingMessage[];
  followupQuestions: string[];
  hours: string;
  updatedAt?: string;
  isDefault: boolean;
};

export function ChatSettingsEditor({ initial }: { initial: Saved }) {
  const [items, setItems] = useState<Item[]>(() => itemsOf(initial.questions));
  const questions = items.map((i) => i.text);
  const [guides, setGuides] = useState<Guide[]>(() => guidesOf(initial.onboarding));
  const [follow, setFollow] = useState<Item[]>(() => itemsOf(initial.followupQuestions));
  const followupQuestions = follow.map((i) => i.text);
  const onboarding = guides.map(({ title, text }) => ({ title, text }));
  const [hours, setHours] = useState(initial.hours);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    JSON.stringify(questions) !== JSON.stringify(saved.questions) ||
    JSON.stringify(onboarding) !== JSON.stringify(saved.onboarding) ||
    JSON.stringify(followupQuestions) !== JSON.stringify(saved.followupQuestions) ||
    hours !== saved.hours;

  function updateGuide(key: string, change: Partial<Guide>) {
    setGuides((list) => list.map((x) => (x.key === key ? { ...x, ...change } : x)));
  }
  function moveGuide(i: number, by: -1 | 1) {
    setGuides((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function update(key: string, v: string) {
    setItems((list) => list.map((x) => (x.key === key ? { ...x, text: v } : x)));
  }
  function move(i: number, by: -1 | 1) {
    setItems((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save(reset: false | "questions" | "onboarding" | "followup" = false) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminPost("/api/admin/chat-settings", reset ? { reset } : { questions, onboarding, followupQuestions, hours });
      const data = (await res.json()) as { ok?: boolean; error?: string; settings?: Saved };
      if (data.ok && data.settings) {
        setItems(itemsOf(data.settings.questions));
        setGuides(guidesOf(data.settings.onboarding));
        setFollow(itemsOf(data.settings.followupQuestions));
        setHours(data.settings.hours);
        setSaved(data.settings);
        setMessage({
          ok: true,
          text:
            reset === "questions"
              ? "Suggested questions restored."
              : reset === "onboarding"
                ? "Suggested portal messages restored."
                : reset === "followup"
                  ? "Suggested follow-up questions restored."
                  : "Saved.",
        });
      } else {
        setMessage({ ok: false, text: data.error ?? "Could not save." });
      }
    } catch {
      setMessage({ ok: false, text: "Could not reach the server." });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <div className="card p-5 sm:p-6">
        <label htmlFor="chat-hours" className="text-sm font-bold text-navy-900">
          Hours shown to candidates
        </label>
        <p className="mt-1 text-xs text-navy-500">On the chat page and in the invitation email.</p>
        <input
          id="chat-hours"
          value={hours}
          maxLength={MAX_HOURS_TEXT}
          onChange={(e) => setHours(e.target.value)}
          className="mt-3 w-full rounded-xl border-2 border-navy-100 px-3.5 py-2.5 text-sm text-navy-900 focus:border-brand-400 focus:outline-none"
        />
      </div>

      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-navy-900">Saved questions</p>
            <p className="mt-1 text-xs text-navy-500">
              In the Live chat, press <strong>Questions</strong> and click one to put it in the message
              box. Questions already asked in that chat are ticked.
            </p>
          </div>
          <span className="text-xs text-navy-400">
            {questions.length} / {MAX_QUESTIONS}
          </span>
        </div>

        <ol className="mt-4 space-y-2.5" data-question-list>
          {items.map(({ key, text: q }, i) => (
            <li key={key} className="flex items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-right text-xs font-bold text-navy-400">{i + 1}.</span>
              <textarea
                value={q}
                rows={2}
                maxLength={MAX_QUESTION}
                onChange={(e) => update(key, e.target.value)}
                aria-label={`Question ${i + 1}`}
                className="min-h-[60px] flex-1 resize-y rounded-xl border-2 border-navy-100 px-3 py-2 text-sm leading-relaxed text-navy-900 focus:border-brand-400 focus:outline-none"
              />
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100 disabled:opacity-30">
                  <Icon name="chevronUp" className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === questions.length - 1} aria-label="Move down" className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100 disabled:opacity-30">
                  <Icon name="chevronDown" className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setItems((list) => list.filter((x) => x.key !== key))}
                aria-label={`Delete question ${i + 1}`}
                className="mt-1 shrink-0 rounded-lg p-1.5 text-red-600 hover:bg-red-50"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={() => setItems((list) => [...list, { key: newId(6), text: "" }])}
          disabled={questions.length >= MAX_QUESTIONS}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-navy-200 px-4 py-2 text-xs font-bold text-navy-700 hover:bg-navy-50 disabled:opacity-40"
        >
          <Icon name="plus" className="h-3.5 w-3.5" /> Add question
        </button>
      </div>

      <div className="card p-5 sm:p-6" data-followup-editor>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-navy-900">Follow-up chat — saved questions</p>
            <p className="mt-1 text-xs text-navy-500">
              In a follow-up chat, press <strong>Questions</strong> and click one to put it in the message box.
            </p>
          </div>
          <span className="text-xs text-navy-400">
            {follow.length} / {MAX_QUESTIONS}
          </span>
        </div>
        <ol className="mt-4 space-y-2.5" data-followup-list>
          {follow.map(({ key, text: q }, i) => (
            <li key={key} className="flex items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-right text-xs font-bold text-navy-400">{i + 1}.</span>
              <textarea
                value={q}
                rows={2}
                maxLength={MAX_QUESTION}
                onChange={(e) => setFollow((list) => list.map((x) => (x.key === key ? { ...x, text: e.target.value } : x)))}
                aria-label={`Follow-up question ${i + 1}`}
                className="min-h-[60px] flex-1 resize-y rounded-xl border-2 border-navy-100 px-3 py-2 text-sm leading-relaxed text-navy-900 focus:border-brand-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setFollow((list) => list.filter((x) => x.key !== key))}
                aria-label={`Delete follow-up question ${i + 1}`}
                className="mt-1 shrink-0 rounded-lg p-1.5 text-red-600 hover:bg-red-50"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setFollow((list) => [...list, { key: newId(6), text: "" }])}
            disabled={follow.length >= MAX_QUESTIONS}
            className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 px-4 py-2 text-xs font-bold text-navy-700 hover:bg-navy-50 disabled:opacity-40"
          >
            <Icon name="plus" className="h-3.5 w-3.5" /> Add follow-up question
          </button>
          <button type="button" onClick={() => void save("followup")} disabled={busy} className="text-xs font-semibold text-navy-500 underline hover:text-navy-700">
            Restore the suggested follow-up questions
          </button>
        </div>
      </div>

      <div className="card p-5 sm:p-6" data-onboarding-editor>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-navy-900">Onboarding chat — portal guide</p>
            <p className="mt-1 max-w-2xl text-xs text-navy-500">
              Ready-made messages that explain the team portal. In an onboarding chat, press{" "}
              <strong>Portal guide</strong> and click one to put it in the message box. You can write{" "}
              <code className="rounded bg-navy-50 px-1">{"{portal}"}</code> for the portal address,{" "}
              <code className="rounded bg-navy-50 px-1">{"{email}"}</code> for their professional email and{" "}
              <code className="rounded bg-navy-50 px-1">{"{name}"}</code> for their first name. Never put a
              password in a message.
            </p>
          </div>
          <span className="text-xs text-navy-400">
            {guides.length} / {MAX_ONBOARDING}
          </span>
        </div>

        <ol className="mt-4 space-y-3" data-onboarding-list>
          {guides.map((g, i) => (
            <li key={g.key} className="flex items-start gap-2 rounded-xl border border-navy-100 p-2.5">
              <span className="mt-2 w-5 shrink-0 text-right text-xs font-bold text-navy-400">{i + 1}.</span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <input
                  value={g.title}
                  maxLength={MAX_ONBOARDING_TITLE}
                  onChange={(e) => updateGuide(g.key, { title: e.target.value })}
                  aria-label={`Portal message ${i + 1} name`}
                  placeholder="Name, e.g. Bank details"
                  className="w-full rounded-lg border-2 border-navy-100 px-3 py-1.5 text-sm font-bold text-navy-900 focus:border-brand-400 focus:outline-none"
                />
                <textarea
                  value={g.text}
                  rows={3}
                  maxLength={MAX_ONBOARDING_TEXT}
                  onChange={(e) => updateGuide(g.key, { text: e.target.value })}
                  aria-label={`Portal message ${i + 1} text`}
                  className="min-h-[72px] w-full resize-y rounded-lg border-2 border-navy-100 px-3 py-2 text-sm leading-relaxed text-navy-900 focus:border-brand-400 focus:outline-none"
                />
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" onClick={() => moveGuide(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100 disabled:opacity-30">
                  <Icon name="chevronUp" className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => moveGuide(i, 1)} disabled={i === guides.length - 1} aria-label="Move down" className="rounded-lg p-1.5 text-navy-500 hover:bg-navy-100 disabled:opacity-30">
                  <Icon name="chevronDown" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setGuides((list) => list.filter((x) => x.key !== g.key))}
                  aria-label={`Delete portal message ${i + 1}`}
                  className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setGuides((list) => [...list, { key: newId(6), title: "", text: "" }])}
            disabled={guides.length >= MAX_ONBOARDING}
            className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 px-4 py-2 text-xs font-bold text-navy-700 hover:bg-navy-50 disabled:opacity-40"
          >
            <Icon name="plus" className="h-3.5 w-3.5" /> Add portal message
          </button>
          <button
            type="button"
            onClick={() => void save("onboarding")}
            disabled={busy}
            className="text-xs font-semibold text-navy-500 underline hover:text-navy-700"
          >
            Restore the suggested portal messages
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={busy || !dirty} className="btn-primary !px-6 !py-2.5 text-sm disabled:opacity-50">
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => void save("questions")}
          disabled={busy}
          className="text-sm font-semibold text-navy-500 underline hover:text-navy-700"
        >
          Restore the suggested questions
        </button>
        {message ? (
          <span className={`text-sm font-medium ${message.ok ? "text-green-700" : "text-red-700"}`}>{message.text}</span>
        ) : saved.isDefault ? (
          <span className="text-xs text-navy-400">Using the suggested questions.</span>
        ) : null}
      </div>
    </div>
  );
}
