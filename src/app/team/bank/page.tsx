import type { Metadata } from "next";
import { requireMember } from "@/lib/teamAuth";
import { bankView } from "@/lib/teamView";
import { DEFAULT_BANK_NOTICE, boldParts, fillNotice, formatDateTime, formatLongDay } from "@/lib/teamShared";
import { getTeamSettings } from "@/lib/teamStore";
import { PortalShell } from "@/components/team/PortalShell";
import { BankForm } from "@/components/team/BankForm";
import { Section } from "@/components/team/ui";
import { Icon } from "@/components/Icon";
import { BankLogo } from "@/components/team/BankLogo";

export const metadata: Metadata = { title: "Bank details" };

export default async function TeamBankPage() {
  const member = await requireMember();
  const current = bankView(member.bank);
  const pending = bankView(member.bankPending);
  const notice = fillNotice((await getTeamSettings()).bankNotice || DEFAULT_BANK_NOTICE, {
    name: member.fullName,
    firstName: member.fullName.split(/\s+/)[0],
    email: member.workEmail,
    phone: member.phoneNumber,
    personalEmail: member.loginEmail,
    startDate: formatLongDay(member.firstWorkDay),
  });

  return (
    <PortalShell member={member} active="bank" title="Bank details" intro="Where your earnings are paid. Payments are in US dollars.">
      <div className="space-y-6">
        <div className="flex gap-3 rounded-2xl border border-navy-100 bg-navy-50 p-4 text-sm text-navy-700">
          <Icon name="shieldCheck" className="h-5 w-5 shrink-0 text-navy-600" />
          <p className="whitespace-pre-line" data-bank-notice>
            {boldParts(notice).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
          </p>
        </div>

        {current ? (
          <Section title="Your account for payments">
            <dl className="grid gap-3 text-sm sm:grid-cols-4" data-bank-current>
              <div>
                <dt className="text-navy-400">Bank</dt>
                <dd className="flex items-center gap-2 font-semibold text-navy-900">
                  <BankLogo bank={current.bank} size={28} className="!rounded-lg" />
                  {current.bankLabel}
                </dd>
              </div>
              <div>
                <dt className="text-navy-400">Holder</dt>
                <dd className="font-semibold text-navy-900">{current.holder}</dd>
              </div>
              <div>
                <dt className="text-navy-400">IBAN</dt>
                <dd className="font-mono font-semibold text-navy-900">{current.masked}</dd>
              </div>
              <div>
                <dt className="text-navy-400">Status</dt>
                <dd className="font-semibold text-green-700">Approved</dd>
              </div>
            </dl>
          </Section>
        ) : null}

        {pending ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-bank-pending>
            <p className="flex items-center gap-2 font-semibold">
              <BankLogo bank={pending.bank} size={28} className="!rounded-lg" />
              Waiting for approval
            </p>
            <p className="mt-1">
              {pending.bankLabel} {pending.masked}, sent {formatDateTime(pending.submittedAt)}. We will email you once it is approved
              {current ? "; until then payments go to your current account" : ""}.
            </p>
          </div>
        ) : null}

        {member.bankRejected && !pending ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-bank-rejected>
            <p className="font-semibold">We could not approve the last details you sent</p>
            <p className="mt-1">{member.bankRejected.reason}</p>
          </div>
        ) : null}

        <Section title={current || pending ? "Change your bank account" : "Add your bank account"}>
          {member.allowedBanks.length ? (
            <BankForm allowed={member.allowedBanks} hasAccount={!!current} />
          ) : (
            <p className="text-sm text-navy-500">Your bank options are being set up. Please check back soon.</p>
          )}
        </Section>
      </div>
    </PortalShell>
  );
}
