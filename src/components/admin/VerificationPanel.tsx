"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { adminPost } from "@/lib/adminClient";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ImageZoom } from "@/components/admin/ImageZoom";
import {
  DOCUMENT_LABEL,
  supersededDocuments,
  type CandidateDocument,
} from "@/lib/documents";
import {
  REUPLOAD_REASONS,
  VERIFICATION_KINDS,
  VERIFICATION_LABEL,
  isVerificationKind,
  notAskedYet,
  type VerificationStatus,
} from "@/lib/verification";
import { ID_DOCUMENT_LABEL, ID_SCAN_LABEL, type IdDocumentType, type IdScanType } from "@/lib/identityDocuments";
import { LiveVerificationButton } from "@/components/admin/LiveVerificationButton";
import type { LiveVerificationState } from "@/lib/liveVerification";

/**
 * Review a candidate's identity photographs.
 *
 * Both images side by side, because the whole check is comparing one to the
 * other: a face against a document. Stacking them would mean scrolling between
 * the two things being compared, which is how mistakes get made.
 */

const TONE: Record<VerificationStatus, string> = {
  not_required: "bg-navy-50 text-navy-500 border-navy-200",
  awaiting: "bg-amber-50 text-amber-700 border-amber-200",
  provided: "bg-brand-50 text-brand-800 border-brand-300",
  verified: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

/**
 * "Awaiting upload" hides a distinction that matters when working a list:
 * someone who has been asked and is taking their time, and someone who has
 * never been told this exists — anyone who finished their assessment before
 * the check was added. The second will wait forever unless a recruiter acts,
 * so it gets its own, louder label rather than looking like ordinary patience.
 */
export function VerificationBadge({
  status,
  requestedAt,
  onOpenPhotos,
}: {
  status: VerificationStatus;
  requestedAt?: string;
  /**
   * Opens the photos directly, skipping the profile. Only offered for
   * "Ready to review" and "Verified" — the two states where there is
   * definitely something to look at. Ignored for every other status, even if
   * a caller passes it: "Awaiting upload" and "Rejected" have no photo to
   * jump to (rejected clears the images), and turning the badge into a button
   * there would be a click that does nothing.
   */
  onOpenPhotos?: () => void;
}) {
  if (status === "not_required") {
    return <span className="text-xs text-navy-300">—</span>;
  }
  const unasked = notAskedYet(status, requestedAt);
  const clickable = !!onOpenPhotos && (status === "provided" || status === "verified");

  const className = `inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
    unasked ? "border-red-200 bg-red-50 text-red-700" : TONE[status]
  } ${clickable ? "transition hover:brightness-95" : ""}`;

  const content = (
    <>
      {status === "verified" ? <Icon name="checkCircle" className="h-3 w-3" /> : null}
      {status === "rejected" ? <Icon name="shield" className="h-3 w-3" /> : null}
      {unasked ? <Icon name="mail" className="h-3 w-3" /> : null}
      {unasked ? "Not asked yet" : VERIFICATION_LABEL[status]}
    </>
  );

  if (!clickable) {
    return <span className={className}>{content}</span>;
  }

  return (
    <button
      type="button"
      onClick={onOpenPhotos}
      title={status === "verified" ? "View the identity photos" : "Review the identity photos"}
      className={className}
    >
      {content}
    </button>
  );
}

export interface VerificationState {
  status: VerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  imagesDeletedAt?: string;
  consentAt?: string;
  /** When we last asked them to upload, if we ever did. */
  requestedAt?: string;
  /** Which document they sent. Absent for uploads made before the picker. */
  documentType?: IdDocumentType;
  /** An outstanding request for new photographs, and why it was made. */
  reuploadRequestedAt?: string;
  reuploadReason?: string;
  reuploadPending?: boolean;
}

/**
 * Pull a panel's starting state out of a candidate view.
 *
 * One definition shared by the profile modal and the quick view, so the two
 * ways of opening this panel can never disagree about which fields it reads.
 */
export function verificationStateOf(c: {
  verificationStatus: VerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  imagesDeletedAt?: string;
  verificationConsentAt?: string;
  verificationRequestedAt?: string;
  identityDocumentType?: IdDocumentType;
  identityReuploadRequestedAt?: string;
  identityReuploadReason?: string;
  identityReuploadPending?: boolean;
}): VerificationState {
  return {
    status: c.verificationStatus,
    verifiedAt: c.verifiedAt,
    verifiedBy: c.verifiedBy,
    rejectedAt: c.rejectedAt,
    rejectionReason: c.rejectionReason,
    imagesDeletedAt: c.imagesDeletedAt,
    consentAt: c.verificationConsentAt,
    requestedAt: c.verificationRequestedAt,
    documentType: c.identityDocumentType,
    reuploadRequestedAt: c.identityReuploadRequestedAt,
    reuploadReason: c.identityReuploadReason,
    reuploadPending: c.identityReuploadPending,
  };
}

/**
 * The inverse of verificationStateOf: what to write back onto the row.
 *
 * One definition, because there are three tables doing this and each one that
 * forgets a field leaves a row silently stale — the panel says the candidate
 * has been asked for new photographs and the list behind it still says
 * "Verified" until the page is reloaded.
 */
export function verificationPatch(v: VerificationState) {
  return {
    verificationStatus: v.status,
    verifiedAt: v.verifiedAt,
    verifiedBy: v.verifiedBy,
    rejectedAt: v.rejectedAt,
    rejectionReason: v.rejectionReason,
    imagesDeletedAt: v.imagesDeletedAt,
    verificationRequestedAt: v.requestedAt,
    identityDocumentType: v.documentType,
    identityReuploadRequestedAt: v.reuploadRequestedAt,
    identityReuploadReason: v.reuploadReason,
    identityReuploadPending: !!v.reuploadPending,
  };
}

/**
 * Whether we can usefully ask this candidate to upload, and what to call it.
 *
 * "Awaiting upload" covers two very different people: someone who was asked
 * and has not got round to it, and someone who finished their assessment
 * before this check existed and has never been told about it at all. The
 * second will wait forever — nothing takes them back to their link — so the
 * button has to be offered in that state, not only when verification is
 * optional for them.
 */
function askAction(state: VerificationState): { label: string; hint: string } | null {
  // Already asked and still waiting. Asking a third time is a nudge, not a new
  // reason, and the reason they were given the first time still stands.
  if (state.reuploadPending) {
    return {
      label: "Ask again",
      hint: "Sends the same request again, with the reason already given.",
    };
  }
  if (state.status === "not_required") {
    return {
      label: "Request verification",
      hint: "Their country does not require it. This asks them anyway and emails them the link.",
    };
  }
  if (state.status === "awaiting") {
    return state.requestedAt
      ? { label: "Ask again", hint: "Sends the request email again with their assessment link." }
      : {
          label: "Send request by email",
          hint: "They have not been told yet — this emails them their link.",
        };
  }
  if (state.status === "rejected") {
    return {
      label: "Ask them to try again",
      hint: "Clears the rejection so they can upload again, and emails them the link.",
    };
  }
  return null;
}

function fmt(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function VerificationPanel({
  id,
  fullName,
  email,
  documents,
  initial,
  live,
  offerAcceptedAt,
  detectedType,
  onLiveChange,
  onChange,
}: {
  id: string;
  fullName?: string;
  /** Needed by the live check, which emails them rather than reopening a page. */
  email?: string;
  documents?: CandidateDocument[];
  initial: VerificationState;
  /** What has happened with the live identity check, if one was ever sent. */
  live?: LiveVerificationState;
  /** Passed through to the live check, which questions "before the agreement"
      wording for somebody who has not been offered anything. */
  offerAcceptedAt?: string;
  /** What the photo was read as (admin only; can be Aadhaar or PAN). */
  detectedType?: IdScanType;
  onLiveChange?: (state: LiveVerificationState) => void;
  /**
   * Report the new state upward. Without this the row behind the profile keeps
   * the value it was rendered with, so verifying someone leaves the table
   * still saying "Ready to review" until the page is reloaded.
   */
  onChange?: (state: VerificationState) => void;
}) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmAsk, setConfirmAsk] = useState(false);
  /** The re-request dialog, and the reason chosen in it. */
  const [askingAgain, setAskingAgain] = useState(false);
  const [reuploadReason, setReuploadReason] = useState<string>(REUPLOAD_REASONS[0].value);
  const [reuploadCustom, setReuploadCustom] = useState("");
  /** Which photo the inspector is showing, or null when it is closed. */
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  /** "sent", or the reason the request email did not go out. */
  const [requestEmailed, setRequestEmailed] = useState("");

  const usable = (d: CandidateDocument) =>
    isVerificationKind(d.kind) && d.status !== "blocked" && !!d.key;
  // What they sent most recently, and what they sent before that. Split rather
  // than merged: the review is of the current set, and a replaced photograph
  // shown alongside it would be verified by accident.
  const images = (documents ?? []).filter((d) => usable(d) && !d.supersededAt);
  const previous = supersededDocuments(documents, VERIFICATION_KINDS).filter(usable);
  const hasImages = images.length > 0;

  /** ?v= names a specific version; without it the route serves the current one. */
  const viewUrl = (d: CandidateDocument) =>
    `/api/admin/documents/${id}/${d.kind}?mode=view${
      d.supersededAt ? `&v=${encodeURIComponent(d.key ?? "")}` : ""
    }`;
  const labelOf = (d: CandidateDocument) =>
    d.supersededAt
      ? `${DOCUMENT_LABEL[d.kind]} — replaced ${fmt(d.supersededAt)}`
      : DOCUMENT_LABEL[d.kind];
  // Current first, then history. The inspector steps through both, so an
  // "is this the same document photographed better?" comparison is arrow keys
  // rather than two windows.
  const zoomable = [...images, ...previous];
  const ask = askAction(state);

  async function act(action: string, extra?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await adminPost(`/api/admin/candidates/${id}/verification`, { action, ...extra });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        verifiedAt?: string;
        rejectedAt?: string;
        rejectionReason?: string;
        verifiedBy?: string;
        emailed?: boolean;
        emailError?: string;
        verificationRequestedAt?: string;
        identityReuploadRequestedAt?: string;
        identityReuploadReason?: string;
      };
      // One place that applies the change, so the panel and the row behind it
      // can never disagree about what just happened.
      const apply = (patch: Partial<VerificationState>) =>
        setState((s) => {
          const next = { ...s, ...patch };
          onChange?.(next);
          return next;
        });

      if (!data.ok) {
        setError(`Could not save (${data.error ?? "unknown"}).`);
      } else if (action === "verify") {
        apply({
          status: "verified",
          verifiedAt: data.verifiedAt,
          verifiedBy: data.verifiedBy,
          rejectedAt: undefined,
          rejectionReason: undefined,
        });
      } else if (action === "reject") {
        apply({
          status: "rejected",
          rejectedAt: data.rejectedAt,
          rejectionReason: data.rejectionReason,
          verifiedAt: undefined,
        });
      } else if (action === "clear-images") {
        apply({ imagesDeletedAt: new Date().toISOString() });
        // The images are gone; reload so the panel reflects storage.
        window.location.reload();
      } else if (action === "request") {
        apply({
          status: "awaiting",
          requestedAt: data.verificationRequestedAt,
          // Asking again withdraws the rejection, so the panel must stop
          // showing one.
          rejectedAt: undefined,
          rejectionReason: undefined,
        });
        // The request is recorded either way, but a candidate who was never
        // told is a request that will never be answered.
        setRequestEmailed(data.emailed ? "sent" : (data.emailError ?? "failed"));
      } else if (action === "reupload") {
        // Back to awaiting, and any decision withdrawn — the server has done
        // the same, and a panel still showing "Verified" beside "we have asked
        // for new photographs" is two contradictory statements at once.
        apply({
          status: "awaiting",
          requestedAt: data.verificationRequestedAt,
          reuploadRequestedAt: data.identityReuploadRequestedAt,
          reuploadReason: data.identityReuploadReason,
          reuploadPending: true,
          verifiedAt: undefined,
          verifiedBy: undefined,
          rejectedAt: undefined,
          rejectionReason: undefined,
        });
        setRequestEmailed(data.emailed ? "sent" : (data.emailError ?? "failed"));
      }
    } catch {
      setError("Could not save. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-navy-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-navy-800">Identity verification</p>
          <VerificationBadge status={state.status} requestedAt={state.requestedAt} />
        </div>
        {ask ? (
          <button
            type="button"
            onClick={() => {
              if (state.reuploadPending) {
                // Nudging, not re-deciding. Their reason stands, so it is
                // carried into the dialog rather than asked for again.
                setReuploadReason("custom");
                setReuploadCustom(state.reuploadReason ?? "");
                setAskingAgain(true);
              } else {
                setConfirmAsk(true);
              }
            }}
            disabled={busy}
            title={ask.hint}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-800 transition hover:bg-brand-100 disabled:opacity-50"
          >
            <Icon name="mail" className="h-3.5 w-3.5" />
            {ask.label}
          </button>
        ) : null}
      </div>

      {/* Outranks the generic "awaiting" line below: this is a specific thing
          we are waiting for, from someone who has already sent something. */}
      {state.reuploadPending ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">
            New photos asked for on {fmt(state.reuploadRequestedAt)} — not arrived yet.
          </p>
          {state.reuploadReason ? (
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              Told them: {state.reuploadReason}
            </p>
          ) : null}
          {images.length ? (
            <p className="mt-1 text-xs text-amber-700">
              The photos below are the ones being replaced.
            </p>
          ) : null}
        </div>
      ) : null}

      {state.documentType ? (
        <p className="mt-2 text-xs text-navy-500">
          Document sent: <strong className="text-navy-700">{ID_DOCUMENT_LABEL[state.documentType]}</strong>
        </p>
      ) : images.length && !detectedType ? (
        <p className="mt-2 text-xs text-navy-400">
          Document type not recorded — sent before we started asking which it was.
        </p>
      ) : null}
      {detectedType && detectedType !== state.documentType ? (
        <p className="mt-1 text-xs text-navy-500" data-id-detected={detectedType}>
          Read from the photo: <strong className="text-navy-700">{ID_SCAN_LABEL[detectedType]}</strong>
        </p>
      ) : null}

      {state.status === "awaiting" && !state.reuploadPending ? (
        <p className="mt-2 text-sm text-navy-500">
          {state.requestedAt ? (
            <>
              Asked on {fmt(state.requestedAt)}. Waiting for {fullName || "the candidate"} to upload
              their ID and photo.
            </>
          ) : (
            <>
              {fullName || "This candidate"} has not been asked yet — they finished their assessment
              before this check existed, so nothing takes them back to their link. Send the request
              and they will see the upload step there.
            </>
          )}
        </p>
      ) : null}

      {requestEmailed === "sent" ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-green-700">
          <Icon name="checkCircle" className="h-4 w-4 shrink-0" />
          Asked by email, with their assessment link.
        </p>
      ) : requestEmailed ? (
        <p className="mt-2 text-sm font-medium text-amber-700">
          Recorded, but the email did not go out ({requestEmailed}). Contact them another way, or
          they will never know to come back.
        </p>
      ) : null}

      {state.imagesDeletedAt && !hasImages ? (
        <p className="mt-2 text-sm text-navy-500">
          Photographs were deleted on {fmt(state.imagesDeletedAt)}. The decision below is kept.
        </p>
      ) : null}

      {hasImages ? (
        <>
          <div
            className={`mt-3 grid gap-3 ${images.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
          >
            {images.map((doc, i) => (
              <button
                key={doc.kind}
                type="button"
                onClick={() => setZoomAt(i)}
                title={`Open ${DOCUMENT_LABEL[doc.kind]} to zoom in`}
                className="group overflow-hidden rounded-xl border border-navy-200 text-left transition hover:border-brand-400"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-navy-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewUrl(doc)}
                    alt={DOCUMENT_LABEL[doc.kind]}
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-navy-900/45 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-navy-800">
                      <Icon name="zoomIn" className="h-3.5 w-3.5" />
                      Zoom in
                    </span>
                  </span>
                </div>
                <p className="px-3 py-2 text-xs font-semibold text-navy-700">
                  {DOCUMENT_LABEL[doc.kind]}
                </p>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-navy-500">
            Click a photo to zoom, pan and rotate it — a sideways passport photograph is readable
            once turned. Check the face matches the document, and that the document is readable and
            not expired.
          </p>
        </>
      ) : null}

      {/* Everything they sent before. Kept because it is the only record of
          what was actually submitted, and because the question worth asking
          about a second attempt is whether it is the same document
          photographed better or a different document altogether. Nothing here
          is part of the review; it goes when someone deletes it. */}
      {previous.length ? (
        <details className="mt-4 rounded-xl border border-navy-100 bg-navy-50/50 p-3">
          <summary className="cursor-pointer text-xs font-bold text-navy-700">
            Earlier submissions ({previous.length} photo{previous.length === 1 ? "" : "s"}) — kept
            until deleted
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {previous.map((doc, i) => (
              <button
                key={doc.key}
                type="button"
                onClick={() => setZoomAt(images.length + i)}
                title={`Open ${labelOf(doc)} to zoom in`}
                className="group overflow-hidden rounded-xl border border-navy-200 bg-white text-left transition hover:border-brand-400"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-navy-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewUrl(doc)}
                    alt={labelOf(doc)}
                    className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
                  />
                </div>
                <p className="px-2.5 py-2 text-[11px] font-semibold leading-snug text-navy-600">
                  {DOCUMENT_LABEL[doc.kind]}
                  <span className="mt-0.5 block font-medium text-navy-400">
                    Sent {fmt(doc.uploadedAt)}
                  </span>
                </p>
              </button>
            ))}
          </div>
        </details>
      ) : null}

      {state.status === "verified" ? (
        <p className="mt-3 text-sm font-medium text-green-700">
          Verified {fmt(state.verifiedAt)}
          {state.verifiedBy ? ` by ${state.verifiedBy}` : ""}.
        </p>
      ) : null}
      {state.status === "rejected" ? (
        <p className="mt-3 text-sm font-medium text-red-600">
          Rejected {fmt(state.rejectedAt)}
          {state.rejectionReason ? ` — ${state.rejectionReason}` : ""}.
        </p>
      ) : null}

      {hasImages || state.status === "verified" || state.status === "rejected" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-navy-100 pt-3">
          {hasImages ? (
            <>
              <button
                type="button"
                onClick={() => act("verify")}
                disabled={busy || state.status === "verified"}
                className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-green-700 disabled:opacity-40"
              >
                <Icon name="checkCircle" className="h-3.5 w-3.5" />
                Verify
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-40"
              >
                Reject
              </button>
            </>
          ) : null}

          {/* The way back when what arrived cannot be used. Offered wherever
              there is something to complain about — including for a verified
              candidate whose photographs have since been deleted, because a
              doubt raised later still has to have somewhere to go. Kept with
              the everyday actions rather than beside Delete: asking for a
              better photograph is the ordinary outcome of a bad one, and
              erasing the evidence is not. */}
          {!state.reuploadPending ? (
            <button
              type="button"
              onClick={() => {
                setReuploadReason(REUPLOAD_REASONS[0].value);
                setReuploadCustom("");
                setAskingAgain(true);
              }}
              disabled={busy}
              title="Emails them a reason and reopens the upload step."
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-40"
            >
              <Icon name="mail" className="h-3.5 w-3.5" />
              Ask for new photos
            </button>
          ) : null}

          {/* The other way of asking, for when better photographs will not
              help: a blurred document can be retaken, but a face that could be
              anybody's is not a photography problem. Kept beside "Ask for new
              photos" because they answer the same question differently, and
              which one to use is a judgement about why the check failed. */}
          <LiveVerificationButton
            id={id}
            fullName={fullName}
            email={email}
            initial={live ?? {}}
            offerAcceptedAt={offerAcceptedAt}
            onChange={(next) => onLiveChange?.(next)}
          />

          {hasImages ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={busy}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-navy-200 px-3.5 py-1.5 text-xs font-bold text-navy-600 transition hover:bg-navy-50 disabled:opacity-40"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
              Delete photos
            </button>
          ) : null}

          {error ? <p className="w-full text-xs font-medium text-red-600">{error}</p> : null}
        </div>
      ) : null}

      {/* Reject, with a reason the candidate's record keeps. */}
      <ConfirmDialog
        open={rejecting}
        icon="shield"
        tone="danger"
        title="Reject this verification?"
        confirmLabel="Reject"
        busy={busy}
        onCancel={() => setRejecting(false)}
        onConfirm={() => {
          setRejecting(false);
          void act("reject", { reason });
        }}
        body={
          <div>
            <p>
              <strong className="text-navy-900">{fullName || "This candidate"}</strong> will be
              marked as failing identity verification.
            </p>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (e.g. photo unreadable)"
              className="input mt-3 !py-2 text-sm"
            />
          </div>
        }
      />

      {/* Asking for new photographs. The reason is picked, not typed, because
          it goes to the candidate word for word — and a reason typed in a
          hurry lands in someone's inbox as the official word on why their
          passport was refused. */}
      <ConfirmDialog
        open={askingAgain}
        icon="mail"
        title="Ask for new identity photos?"
        confirmLabel="Send request"
        busy={busy}
        warning={
          state.status === "verified"
            ? "This withdraws the existing verification until new photos arrive."
            : undefined
        }
        onCancel={() => setAskingAgain(false)}
        onConfirm={() => {
          setAskingAgain(false);
          void act("reupload", { reason: reuploadReason, customReason: reuploadCustom });
        }}
        body={
          <div>
            <p>
              <strong className="text-navy-900">{fullName || "This candidate"}</strong> will be
              emailed the reason below and a link back to the upload step. Their current photos are
              kept until new ones arrive.
            </p>

            <label className="mt-3 block text-xs font-bold text-navy-700">
              What was wrong?
              <select
                value={reuploadReason}
                onChange={(e) => setReuploadReason(e.target.value)}
                className="input mt-1.5 !py-2 text-sm font-normal"
              >
                {REUPLOAD_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
                <option value="custom">Something else — write it myself</option>
              </select>
            </label>

            {reuploadReason === "custom" ? (
              <textarea
                value={reuploadCustom}
                onChange={(e) => setReuploadCustom(e.target.value)}
                rows={3}
                maxLength={400}
                placeholder="Say what is wrong and what they should send instead."
                className="input mt-2 !py-2 text-sm"
              />
            ) : (
              // Shown, not summarised. This is the exact text that will be in
              // their inbox, and it should be read before it is sent.
              <p className="mt-2 rounded-lg border border-navy-200 bg-navy-50 p-3 text-xs leading-relaxed text-navy-700">
                {REUPLOAD_REASONS.find((r) => r.value === reuploadReason)?.message}
              </p>
            )}
          </div>
        }
      />

      {/* Asking sends a real email to a real person, so it is confirmed —
          and for a rejected candidate it also withdraws that rejection. */}
      <ConfirmDialog
        open={confirmAsk}
        icon="mail"
        title={ask?.label ?? "Request verification"}
        confirmLabel="Send request"
        busy={busy}
        warning={
          state.status === "rejected"
            ? "This clears the existing rejection so they can upload again."
            : undefined
        }
        onCancel={() => setConfirmAsk(false)}
        onConfirm={() => {
          setConfirmAsk(false);
          void act("request");
        }}
        body={
          <>
            <strong className="text-navy-900">{fullName || "This candidate"}</strong> will be
            emailed their assessment link and asked to upload an ID document and a photo of
            themselves holding it. The upload step appears on that link.
          </>
        }
      />

      <ConfirmDialog
        open={confirmClear}
        icon="trash"
        tone="danger"
        title="Delete the identity photos?"
        confirmLabel="Delete photos"
        warning="This cannot be undone. The candidate would have to upload them again."
        busy={busy}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          void act("clear-images");
        }}
        body={
          <>
            {/* Named precisely. Earlier submissions are kept on purpose, and
                this is the one action that removes them, so the count has to
                be in front of whoever is about to confirm it. */}
            All {images.length + previous.length} identity photo
            {images.length + previous.length === 1 ? "" : "s"} for{" "}
            <strong className="text-navy-900">{fullName || "this candidate"}</strong> will be erased
            from storage
            {previous.length
              ? `, including the ${previous.length} earlier submission${previous.length === 1 ? "" : "s"}`
              : ""}
            . The verification decision, who made it and when, is kept.
          </>
        }
      />

      {/* Enlarged view, for reading small print on a document. */}
      {zoomAt !== null && zoomable[zoomAt] ? (
        <ImageZoom
          images={zoomable.map((d) => ({ src: viewUrl(d), label: labelOf(d) }))}
          index={zoomAt}
          onIndex={setZoomAt}
          onClose={() => setZoomAt(null)}
        />
      ) : null}
    </div>
  );
}
