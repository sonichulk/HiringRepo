"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { adminPost } from "@/lib/adminClient";
import { DAY_KEYS, DAY_LABELS, START_TIMES, endTimeFor, knownTimeZones, type DayKey } from "@/lib/availability";
import { BANK_IDS, BANKS, type BankId } from "@/lib/teamShared";
import { BankLogo } from "@/components/team/BankLogo";
import { refreshAfterSave } from "@/lib/refreshAfterSave";

export interface MemberFormValues {
  candidateId?: string;
  fullName: string;
  loginEmail: string;
  personalPhone: string;
  country: string;
  position: string;
  workEmail: string;
  phoneNumber: string;
  days: DayKey[];
  startTime: string;
  timeZone: string;
  hoursPerDay: number;
  rate: number;
  firstWorkDay: string;
  checkInRequired: boolean;
  allowedBanks: BankId[];
  notes: string;
}

/**
 * Add a member, or edit one. A new member's schedule, hours and rate come
 * from the offer they accepted; everything can be changed here before saving.
 */
export function MemberForm({
  mode,
  memberId,
  initial,
  fromChat,
}: {
  mode: "new" | "edit";
  memberId?: string;
  initial: MemberFormValues;
  /** Opened from an onboarding chat: the login is sent from the chat instead. */
  fromChat?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [sendInvite, setSendInvite] = useState(!fromChat);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const zones = useMemo(() => {
    const list = knownTimeZones();
    return list.includes(v.timeZone) ? list : [v.timeZone, ...list];
  }, [v.timeZone]);

  const set = <K extends keyof MemberFormValues>(k: K, value: MemberFormValues[K]) => {
    setSaved(false);
    setV((x) => ({ ...x, [k]: value }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblems([]);
    const body = {
      ...v,
      schedule: { days: v.days, startTime: v.startTime, timeZone: v.timeZone },
      sendInvite,
      ...(mode === "edit" ? { action: "update" } : {}),
    };
    try {
      const res = await adminPost(mode === "new" ? "/api/admin/team/members" : `/api/admin/team/members/${memberId}`, body);
      const data = (await res.json().catch(() => ({}))) as { problems?: string[]; id?: string };
      if (!res.ok) {
        setProblems(data.problems?.length ? data.problems : ["Could not save."]);
        return;
      }
      if (mode === "new" && data.id) router.push(`/admin/team/${data.id}`);
      else {
        setSaved(true);
        refreshAfterSave(router);
      }
    } catch {
      setProblems(["No connection."]);
    } finally {
      setBusy(false);
    }
  }

  const input = (k: keyof MemberFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`m-${k}`} className="mb-1 block text-xs font-semibold text-navy-600">
        {label}
      </label>
      <input
        id={`m-${k}`}
        value={String(v[k] ?? "")}
        onChange={(e) => set(k, (props.type === "number" ? Number(e.target.value) : e.target.value) as never)}
        className="input py-2 text-sm"
        {...props}
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-6" noValidate data-member-form={mode}>
      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-bold text-navy-900">Person</legend>
        {input("fullName", "Full name")}
        {input("loginEmail", "Personal email (they sign in with this)", { type: "email" })}
        {input("personalPhone", "Personal phone")}
        {input("country", "Country")}
        {input("position", "Position")}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-bold text-navy-900">What we provide</legend>
        {input("workEmail", "Professional email — their portal mailbox", { type: "email", placeholder: "firstname.lastname@workroute.team" })}
        {input("phoneNumber", "Work phone number (full, with country code)", { placeholder: "+44 7700 900123" })}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-bold text-navy-900">Schedule, hours and pay</legend>
        <div>
          <p className="mb-1 text-xs font-semibold text-navy-600">Work days</p>
          <div className="flex flex-wrap gap-2">
            {DAY_KEYS.map((d) => (
              <label
                key={d}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
                  v.days.includes(d) ? "border-brand-500 bg-brand-50 font-semibold text-navy-900" : "border-cream-300 text-navy-600"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={v.days.includes(d)}
                  onChange={(e) =>
                    set("days", e.target.checked ? DAY_KEYS.filter((x) => x === d || v.days.includes(x)) : v.days.filter((x) => x !== d))
                  }
                />
                <span title={DAY_LABELS[d]}>{d}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="m-start" className="mb-1 block text-xs font-semibold text-navy-600">
              Window starts (8 hours)
            </label>
            <select id="m-start" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} className="select py-2 text-sm">
              {START_TIMES.map((t) => (
                <option key={t} value={t}>
                  {t} – {endTimeFor(t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="m-tz" className="mb-1 block text-xs font-semibold text-navy-600">
              Their timezone
            </label>
            <select id="m-tz" value={v.timeZone} onChange={(e) => set("timeZone", e.target.value)} className="select py-2 text-sm">
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
          {input("hoursPerDay", "Paid hours per work day", { type: "number", step: "0.25", min: 0.25, max: 12 })}
          {mode === "new" ? input("rate", "Rate (US$ per hour)", { type: "number", step: "0.01", min: 0.01 }) : null}
          {input("firstWorkDay", "First work day", { type: "date" })}
        </div>
        <label className="flex items-center gap-2 text-sm text-navy-700">
          <input type="checkbox" checked={v.checkInRequired} onChange={(e) => set("checkInRequired", e.target.checked)} />
          Daily check-in required — a day only counts when they press <strong>Start work</strong>
        </label>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-bold text-navy-900">Banks they can be paid into</legend>
        <div className="flex flex-wrap gap-3">
          {BANK_IDS.map((b) => (
            <label key={b} className="flex items-center gap-2 rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                name="allowedBanks"
                value={b}
                checked={v.allowedBanks.includes(b)}
                onChange={(e) =>
                  set("allowedBanks", e.target.checked ? BANK_IDS.filter((x) => x === b || v.allowedBanks.includes(x)) : v.allowedBanks.filter((x) => x !== b))
                }
              />
              <BankLogo bank={b} size={22} className="!rounded-md" />
              {BANKS[b].label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-navy-400">They see only these on their Bank page.</p>
      </fieldset>

      {mode === "edit" ? (
        <div>
          <label htmlFor="m-notes" className="mb-1 block text-xs font-semibold text-navy-600">
            Private notes (never shown to the member)
          </label>
          <textarea id="m-notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} className="textarea text-sm" />
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm text-navy-700">
          <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
          Email them the invitation to the portal now
          {fromChat ? (
            <span className="text-navy-500">— leave this off: press Send portal login in the onboarding chat instead</span>
          ) : null}
        </label>
      )}

      {problems.length ? (
        <ul role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      {saved ? <p className="text-sm text-green-700">Saved.</p> : null}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "Saving…" : mode === "new" ? "Add to the team" : "Save changes"}
      </button>
    </form>
  );
}
