"use client";

import { useState } from "react";
import { adminPost } from "@/lib/adminClient";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FOLLOWUP_REASONS, MAX_FOLLOWUP_REASON, followupReasonMessage } from "@/lib/chat";

/**
 * "Invite to follow-up chat": choose why, see the sentence they will read,
 * send. Used from View info → Assessment and from an ended interview chat.
 */

const ERRORS: Record<string, string> = {
  no_reason: "choose a reason or write one",
  no_interview: "their interview chat has not ended yet",
  too_soon: "an invitation went less than a minute ago",
  warmup_limit: "today's sending limit is reached — try again after it resets",
  no_email: "no email address on file",
  fake_recipient: "the email address is not a real mailbox",
};

export interface FollowupSent {
  followupChatLinks: string[];
  followupReason: string;
}

export function FollowupInviteDialog({
  open,
  candidateId,
  candidateName,
  email,
  again,
  onClose,
  onSent,
}: {
  open: boolean;
  candidateId: string;
  candidateName: string;
  email?: string;
  /** A follow-up link was sent before: say this one replaces it. */
  again?: boolean;
  onClose: () => void;
  onSent: (r: FollowupSent) => void;
}) {
  const [reason, setReason] = useState(FOLLOWUP_REASONS[0].value);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const message = followupReasonMessage(reason, custom);

  async function send() {
    if (!message) {
      setError(ERRORS.no_reason);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await adminPost(`/api/admin/candidates/${candidateId}/chat`, { action: "followup", reason, custom });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<FollowupSent>;
      if (data.ok) {
        onSent({ followupChatLinks: data.followupChatLinks ?? [], followupReason: data.followupReason ?? message });
        onClose();
      } else {
        setError(`Not sent (${res.status === 401 ? "your admin session has expired — sign in again" : ERRORS[data.error ?? ""] ?? data.error ?? "failed"}).`);
      }
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  return (
    <ConfirmDialog
      open={open}
      icon="chat"
      title={again ? "Send a new follow-up chat invitation?" : "Invite to a follow-up chat?"}
      confirmLabel={busy ? "Sending…" : "Send invitation"}
      busy={busy}
      warning={error || undefined}
      onCancel={onClose}
      onConfirm={() => void send()}
      body={
        <div className="space-y-3" data-followup-dialog>
          <p>
            {candidateName || "The candidate"} gets the email{" "}
            <strong className="text-navy-900">&ldquo;A quick follow-up chat with WorkRoute&rdquo;</strong>
            {email ? <> at {email}</> : null} with a personal chat link (valid 7 days) and the reason below.
            {again ? " The follow-up link sent before stops working." : ""}
          </p>
          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wide text-navy-500">What do you need from them?</legend>
            <div className="mt-1.5 space-y-1.5">
              {FOLLOWUP_REASONS.map((r) => (
                <label key={r.value} className="flex items-start gap-2 text-sm text-navy-800">
                  <input
                    type="radio"
                    name={`followup-reason-${candidateId}`}
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-1"
                    data-followup-reason={r.value}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {reason === "custom" ? (
            <textarea
              value={custom}
              maxLength={MAX_FOLLOWUP_REASON}
              onChange={(e) => setCustom(e.target.value)}
              rows={3}
              placeholder="e.g. We need to ask you about your previous employer."
              className="w-full rounded-xl border-2 border-navy-100 px-3 py-2 text-sm text-navy-900 focus:border-brand-400 focus:outline-none"
              data-followup-custom
            />
          ) : null}
          <p className="rounded-xl border-l-4 border-brand-500 bg-cream-100 px-3 py-2 text-sm text-navy-800" data-followup-preview>
            <span className="block text-[11px] font-bold uppercase tracking-wide text-navy-500">They will read</span>
            {message || <span className="text-navy-400">Write the reason above.</span>}
          </p>
        </div>
      }
    />
  );
}
