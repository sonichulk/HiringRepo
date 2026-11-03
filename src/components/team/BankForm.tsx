"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { problemOf, teamPost } from "@/lib/teamClient";
import { BANKS, bicFor, checkIban, formatIban, ibanBankWarning, type BankId } from "@/lib/teamShared";
import { BankLogo } from "@/components/team/BankLogo";
import { refreshAfterSave } from "@/lib/refreshAfterSave";

/**
 * Add or change the account payments go to: one of the banks allowed for
 * this member, the holder's name, the IBAN and the BIC. The IBAN is checked
 * as it is typed, and the BIC filled in from the bank.
 */
export function BankForm({ allowed, hasAccount }: { allowed: BankId[]; hasAccount: boolean }) {
  const router = useRouter();
  const [bank, setBank] = useState<BankId | "">(allowed.length === 1 ? allowed[0] : "");
  const [holder, setHolder] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState(allowed.length === 1 ? BANKS[allowed[0]].defaultBic : "");
  const [bicTouched, setBicTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const check = useMemo(() => (iban.replace(/\s/g, "").length >= 15 ? checkIban(iban) : null), [iban]);
  const warning = bank && check?.ok ? ibanBankWarning(bank, check.iban) : null;

  function pickBank(b: BankId) {
    setBank(b);
    if (!bicTouched) setBic(bicFor(b, iban));
  }

  function onIban(v: string) {
    setIban(v.toUpperCase());
    if (bank && !bicTouched) setBic(bicFor(bank, v));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await teamPost("/api/team/bank", { bank, holder, iban, bic });
      if (!res.ok) {
        setError(await problemOf(res));
        return;
      }
      setSent(true);
      setIban("");
      refreshAfterSave(router);
    } catch {
      setError("No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="rounded-xl bg-green-50 p-4 text-sm text-green-800" role="status">
        Thank you — your bank details were sent. We check them and email you when they are approved.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate data-bank-form>
      <fieldset>
        <legend className="label">Your bank</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {allowed.map((b) => (
            <label
              key={b}
              data-bank-choice={b}
              className={`flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-brand-300 ${
                bank === b ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-cream-300 bg-white hover:border-brand-300"
              }`}
            >
              <span className="flex items-center gap-3">
                <input type="radio" name="bank" value={b} checked={bank === b} onChange={() => pickBank(b)} className="sr-only" />
                <BankLogo bank={b} size={44} />
                <span className="min-w-0 flex-1 font-semibold text-navy-900">{BANKS[b].label}</span>
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    bank === b ? "border-brand-500 bg-brand-500" : "border-navy-200 bg-white"
                  }`}
                >
                  {bank === b ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                </span>
              </span>
              <a
                href={BANKS[b].signupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-brand-700 underline underline-offset-2"
              >
                No account yet? Create one
              </a>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="bank-holder" className="label">
          Account holder name
        </label>
        <input
          id="bank-holder"
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          className="input"
          autoComplete="name"
          placeholder="Your full name, as your bank shows it"
        />
      </div>

      <div>
        <label htmlFor="bank-iban" className="label">
          IBAN
        </label>
        <input
          id="bank-iban"
          value={iban}
          onChange={(e) => onIban(e.target.value)}
          onBlur={() => check?.ok && setIban(formatIban(check.iban))}
          className={`input font-mono ${check && !check.ok ? "input-invalid" : ""}`}
          autoComplete="off"
          spellCheck={false}
          placeholder="e.g. LT12 3250 0123 4567 8901"
          aria-describedby="iban-help"
        />
        <p id="iban-help" className="mt-1.5 text-xs text-navy-400">
          In your {bank ? BANKS[bank].label : "bank"} app: Account → Account details → IBAN.
        </p>
        {check && !check.ok ? <p className="field-error">{check.problem}</p> : null}
        {check?.ok ? <p className="mt-1.5 text-sm text-green-700">This IBAN is valid.</p> : null}
        {warning ? (
          <p className="mt-1.5 rounded-lg bg-amber-50 p-2 text-sm text-amber-900" data-iban-warning>
            {warning}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="bank-bic" className="label">
          BIC / SWIFT
        </label>
        <input
          id="bank-bic"
          value={bic}
          onChange={(e) => {
            setBicTouched(true);
            setBic(e.target.value.toUpperCase());
          }}
          className="input font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="mt-1.5 text-xs text-navy-400" data-bic-hint>
          {bank && BANKS[bank].bicHint
            ? BANKS[bank].bicHint
            : "Filled in for you. Change it only if your bank app shows a different one."}
        </p>
      </div>

      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy || !bank || !check?.ok} className="btn-primary">
        {busy ? "Sending…" : hasAccount ? "Send my new bank details" : "Save my bank details"}
      </button>
    </form>
  );
}
