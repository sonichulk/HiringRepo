"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { InterviewBadge } from "@/components/admin/StatusBadge";
import { CANDIDATE_STATUSES, type CandidateStatus } from "@/lib/candidateStatus";
import { DocumentList } from "@/components/admin/DocumentChips";
import { NotesEditor } from "@/components/admin/NotesEditor";
import {
  VerificationPanel,
  verificationPatch,
  verificationStateOf,
} from "@/components/admin/VerificationPanel";
import { ResidencePanel } from "@/components/admin/ResidencePanel";
import { AddressProofPanel } from "@/components/admin/AddressProofPanel";
import { AddressReviewViewer } from "@/components/admin/AddressReviewViewer";
import { AgreementPanel } from "@/components/admin/AgreementPanel";
import type { CandidateDocument } from "@/lib/documents";
import type { CandidateView } from "@/lib/candidateView";
import { PhoneCountryFlag } from "@/components/admin/PhoneCountryFlag";
import { countryMatch } from "@/lib/countryCheck";
import { OfferPanel } from "@/components/admin/OfferPanel";
import { OfferReplyPanel } from "@/components/admin/OfferReplyPanel";
import { canOffer } from "@/lib/offer";
import { holdOverdue, liveStateOf } from "@/lib/liveVerification";
import { ConfirmedDetailsPanel } from "@/components/admin/ConfirmedDetailsPanel";
import { CompanyDetailsPanel } from "@/components/admin/CompanyDetailsPanel";
import { PanCardPanel } from "@/components/admin/PanCardPanel";
import { ChatLinkPanel } from "@/components/admin/chat/ChatLinkPanel";
import { FollowupChatPanel } from "@/components/admin/chat/FollowupChatPanel";
import { VoicePanel } from "@/components/admin/VoicePanel";
import { VoiceAckButton } from "@/components/admin/VoiceAckButton";
import { VerifiedAckButton } from "@/components/admin/VerifiedAckButton";
import { currentVoiceRecording } from "@/lib/voice";
import { IdentityReminderButton } from "@/components/admin/IdentityReminderButton";
import { SubmissionReceivedButton } from "@/components/admin/SubmissionReceivedButton";
import { CompanyCheckPanel } from "@/components/admin/CompanyCheckPanel";
import { SsnField } from "@/components/admin/SsnField";
import { FavoriteButton } from "@/components/admin/FavoriteButton";
import { ssnExpected } from "@/lib/ssn";

/**
 * The groups the profile is divided into.
 *
 * Ordered by how often they are opened rather than by when they happen in the
 * process: who they are, then the three checks that stand between an accepted
 * offer and an agreement, then the assessment — which is read once and settled
 * — and finally the notes.
 *
 * Every panel stays mounted whichever group is showing, hidden rather than
 * unmounted. A half-typed note, a pasted verification link and a part-filled
 * offer are all state living inside those panels, and throwing them away
 * because somebody looked at another group would be a worse fault than the
 * scrolling this replaces.
 */
const TABS = [
  { id: "profile", label: "Profile", icon: "users" },
  { id: "id", label: "ID check", icon: "shield" },
  { id: "company", label: "Company", icon: "briefcase" },
  { id: "offer", label: "Offer", icon: "handshake" },
  { id: "agreement", label: "Agreement", icon: "fileCheck" },
  { id: "assessment", label: "Assessment", icon: "microphone" },
  { id: "notes", label: "Notes", icon: "document" },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

type TabId = (typeof TABS)[number]["id"];

/**
 * The group last looked at, remembered between candidates.
 *
 * Module scope rather than component state, because callers key this dialog by
 * candidate id — deliberately, so the panels inside cannot describe the person
 * you just navigated away from. That remount takes any state with it, and
 * somebody working through a morning of identity checks wants the next
 * person's identity check rather than their address again.
 *
 * Not persisted beyond the page: a fresh visit starts on the profile, which is
 * the right place to start when you do not already know what you are looking
 * for.
 */
let lastTab: TabId = "profile";

/** Open the next profile on this tab — for a row button that is about one section. */
export function openProfileOn(tab: TabId): void {
  lastTab = tab;
}

/**
 * Everything known about one candidate, in a dialog.
 *
 * Shared by the Candidates and Interviews tabs rather than written twice. Two
 * profile views of the same person would drift, and the one that got less use
 * would quietly stop showing whatever was added to the other.
 *
 * It owns no data. Every change is reported through `onChange` so whichever
 * table opened it can keep its own row in step — a modal that silently knew
 * more than the page behind it is how a row ends up showing a stale badge.
 *
 * Callers must give it `key={candidate.id}`. The panels inside seed their own
 * state from their props once, on mount, so swapping the candidate underneath
 * a mounted dialog would leave the verification panel, the offer form and the
 * Companies House result all describing the person you just navigated away
 * from — and a save from any of them would write their data onto this one.
 */

function fmt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Why an accepted offer cannot become an agreement yet, in one sentence.
 *
 * Both gates read the same way to whoever is looking at the profile: something
 * is outstanding, so nothing goes out. Said here once rather than in the offer
 * panel, which has no business knowing what a W-9 is.
 */
function agreementBlocker(c: CandidateView): string | undefined {
  const missing: string[] = [];
  if (c.identityNeeded) missing.push("identity documents");
  if (c.companyNeeded) missing.push("company details");
  if (!missing.length) return undefined;
  // Both are plural, so one verb reads correctly either way round.
  return `No agreement yet — their ${missing.join(" and ")} are still outstanding.`;
}

/**
 * This candidate's row checkbox, reachable from inside the dialog.
 *
 * The dialog steps through the list with ‹ and ›, which is exactly how somebody
 * works out who a bulk action should go to — so the tick belongs here, where
 * the deciding happens, rather than back in the table behind the dialog where
 * the row has scrolled out of sight. It is the same selection, not a copy:
 * ticking here ticks the row, and the row's own checkbox moves with it.
 *
 * Omitted by tables that have no bulk actions, which hides the control rather
 * than offering a selection that does nothing.
 */
export interface ProfileSelection {
  selected: boolean;
  onToggle: () => void;
  /** How many are ticked in the list now, so stepping through shows a tally. */
  count: number;
}

/** Stepping to the next candidate without closing the dialog. */
export interface ProfileNav {
  /** Zero-based position in the filtered list. */
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function CandidateProfileModal({
  candidate,
  showOffer,
  nav,
  onClose,
  onChange,
  onOpenDocument,
  onStatusChange,
  selection,
  addressQueue,
}: {
  candidate: CandidateView;
  /**
   * The candidates the address review steps through — the list on screen. Without
   * it, the review shows this candidate only.
   */
  addressQueue?: { candidates: CandidateView[]; onChange: (id: string, patch: Partial<CandidateView>) => void };
  /** Omitted where there is nothing to step through, which hides the controls. */
  nav?: ProfileNav;
  /**
   * Whether to offer the job from here.
   *
   * Only the Interviews tab does. An offer follows the live interview, which
   * only happens once the voice assessment is passed, and that whole sequence
   * is run from that tab — putting the form in front of every applicant on the
   * Candidates tab as well only invites it being sent to the wrong person.
   */
  showOffer?: boolean;
  onClose: () => void;
  /** Fields that changed, for the caller to merge into its own copy. */
  onChange: (patch: Partial<CandidateView>) => void;
  onOpenDocument: (doc: CandidateDocument) => void;
  onStatusChange: (id: string, status: CandidateStatus) => void;
  selection?: ProfileSelection;
}) {
  const verification = verificationStateOf(candidate);
  const [reviewingAddress, setReviewingAddress] = useState(false);

  /**
   * Notes are saved on a button, not on every keystroke, so a half-written note
   * lives only in the textarea. Stepping to the next candidate would discard it
   * without a word — so the first press warns and the second goes, the same
   * two-step the offer and verification panels use for anything irreversible.
   */
  const [notesDirty, setNotesDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState<"prev" | "next" | null>(null);

  function move(dir: "prev" | "next") {
    if (!nav) return;
    if (notesDirty && confirmLeave !== dir) {
      setConfirmLeave(dir);
      return;
    }
    (dir === "prev" ? nav.onPrev : nav.onNext)();
  }

  const atStart = !nav || nav.index <= 0;
  const atEnd = !nav || nav.index >= nav.total - 1;

  // Read through a ref so the listener is registered once rather than being
  // torn down and rebuilt on every render by an inline `nav` object.
  const moveRef = useRef(move);
  moveRef.current = move;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // While something is being typed in or chosen from, the arrows belong to
      // it — navigating away mid-sentence is not what the key was pressed for.
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      moveRef.current(e.key === "ArrowLeft" ? "prev" : "next");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Which group is on screen. Seeded from, and written back to, lastTab. */
  const [tab, setTabState] = useState<TabId>(lastTab);
  function setTab(next: TabId) {
    lastTab = next;
    setTabState(next);
  }

  // Two things in here are somebody else's time: a candidate sitting in front
  // of a holding message, and photographs nobody has looked at. Marked on the
  // tab, because a tab is a place things get missed behind.
  const idNeedsAttention =
    holdOverdue(candidate) || candidate.verificationStatus === "provided";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${candidate.fullName || "Candidate"} profile`}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            {/* The star sits with the name rather than among the actions on
                the right, because it is about the person rather than about
                the record — and because the name is what you are looking at
                when you decide somebody is worth coming back to. */}
            <div className="flex items-center gap-1.5">
              <h3 className="text-xl font-bold text-navy-900">
                {candidate.fullName || "Candidate"}
              </h3>
              <FavoriteButton
                id={candidate.id}
                favorite={!!candidate.favorite}
                onChange={(patch) => onChange(patch)}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* There is no status column on either table, so this is the only
                  place a status can be changed. Editable here rather than a
                  badge, or the capability disappears with the column. */}
              <select
                value={candidate.status}
                onChange={(e) => onStatusChange(candidate.id, e.target.value as CandidateStatus)}
                className="select !w-auto !py-1.5 text-xs"
                aria-label="Change status"
              >
                {CANDIDATE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <InterviewBadge
                completed={candidate.interviewCompleted}
                opened={!!candidate.interviewOpenedAt}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {selection ? (
              <label
                className={`mr-1.5 inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                  selection.selected
                    ? "border-brand-300 bg-brand-50 text-navy-900"
                    : "border-navy-200 text-navy-600 hover:bg-navy-50"
                }`}
                title="Select this candidate in the list, for a bulk action"
              >
                <input
                  type="checkbox"
                  checked={selection.selected}
                  onChange={selection.onToggle}
                  className="h-4 w-4 rounded border-navy-300 text-brand-600"
                  aria-label={`Select ${candidate.fullName || "this candidate"} in the list`}
                />
                {selection.selected ? "Selected" : "Select"}
                {/* The running tally, so stepping through with the arrows
                    tells you how many you have picked without closing. */}
                {selection.count > 0 ? (
                  <span
                    className="rounded-full bg-navy-900 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums"
                    aria-label={`${selection.count} selected in the list`}
                  >
                    {selection.count}
                  </span>
                ) : null}
              </label>
            ) : null}
            {nav ? (
              <>
                <button
                  type="button"
                  onClick={() => move("prev")}
                  disabled={atStart}
                  className="rounded-lg border border-navy-200 px-2 py-1.5 text-navy-600 transition hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Previous candidate"
                  title="Previous candidate (←)"
                >
                  <Icon name="chevronLeft" className="h-4 w-4" />
                </button>
                {/* Position in the filtered list, so it answers "how many left". */}
                <span className="whitespace-nowrap px-1 text-xs font-semibold tabular-nums text-navy-500">
                  {nav.index + 1} of {nav.total}
                </span>
                <button
                  type="button"
                  onClick={() => move("next")}
                  disabled={atEnd}
                  className="mr-1 rounded-lg border border-navy-200 px-2 py-1.5 text-navy-600 transition hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Next candidate"
                  title="Next candidate (→)"
                >
                  <Icon name="chevronRight" className="h-4 w-4" />
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-navy-500 hover:bg-navy-100"
              aria-label="Close"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
        </div>

        {confirmLeave ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Your notes have not been saved. Press{" "}
            {confirmLeave === "prev" ? "Previous" : "Next"} again to leave them behind, or save
            them first.
          </p>
        ) : null}

        {/* Sticky, because the panels below are long and the way back to
            another group should not be a scroll to the top. */}
        <div
          role="tablist"
          aria-label="Candidate sections"
          className="sticky top-0 z-10 -mx-6 mt-4 flex gap-1 overflow-x-auto border-b border-navy-100 bg-white px-6 pb-0"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-bold transition ${
                  active
                    ? "border-brand-500 text-navy-900"
                    : "border-transparent text-navy-400 hover:border-navy-200 hover:text-navy-700"
                }`}
              >
                <Icon name={t.icon} className="h-4 w-4 shrink-0" />
                {t.label}
                {t.id === "id" && idNeedsAttention ? (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
                    title="Something here is waiting on you"
                  />
                ) : null}
                {t.id === "agreement" && candidate.agreementStatus === "signed" ? (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
                    title="A signed agreement is waiting to be checked"
                  />
                ) : null}
                {t.id === "notes" && candidate.notes ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-navy-300" title="Has notes" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div hidden={tab !== "profile"}>
        <dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Email" value={candidate.email} />
          <Field
            label="WhatsApp number"
            value={
              <>
                {candidate.phone}
                <PhoneCountryFlag country={candidate.country} phone={candidate.phone} />
              </>
            }
          />
          <Field label="Date of birth" value={candidate.dob} />
          <Field label="Position" value={candidate.position} />
          <Field label="Country" value={candidate.country} />
          {/* Where the application actually came from, so the stated country
              can be read next to it rather than taken on trust. */}
          <Field
            label="Sent from"
            value={
              candidate.detectedCountryName ? (
                <>
                  <span
                    className={
                      countryMatch(candidate) === "mismatch" ? "font-semibold text-amber-700" : ""
                    }
                  >
                    {candidate.detectedCountryName}
                  </span>
                  <span className="block text-xs font-normal text-navy-400">
                    Detected {fmt(candidate.detectedCountryAt)} · from the network address, not the
                    form
                  </span>
                </>
              ) : (
                <span className="text-navy-400">Not detected</span>
              )
            }
          />
          {/* Only for the people it is asked of. An empty "SSN —" against
              somebody in Morocco reads as missing rather than inapplicable. */}
          {ssnExpected(candidate.country) || candidate.hasSsn ? (
            <Field
              label="Social Security Number"
              value={
                <SsnField
                  candidateId={candidate.id}
                  hasSsn={candidate.hasSsn}
                  // Whether we have got as far as asking. Without this, every
                  // US candidate who has not been offered anything yet reads
                  // as one who was asked and did not answer.
                  asked={!!candidate.offerAcceptedAt}
                />
              }
            />
          ) : null}
          <Field label="City" value={candidate.city} />
          <Field label="Full address" value={candidate.address} full />
          <Field label="Languages" value={candidate.languages.join(", ")} full />
          <Field
            label="LinkedIn"
            full
            value={
              candidate.linkedin ? (
                <a
                  href={candidate.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 underline"
                >
                  {candidate.linkedin}
                </a>
              ) : (
                ""
              )
            }
          />
          <Field label="Applied" value={fmt(candidate.submittedAt || candidate.createdAt)} />
          <Field label="Invitation sent" value={fmt(candidate.invitationSentAt)} />
        </dl>

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-navy-800">Documents</p>
          <DocumentList
            id={candidate.id}
            documents={candidate.documents}
            onOpen={onOpenDocument}
          />
        </div>

        </div>

        <div hidden={tab !== "assessment"}>
        <div className="mt-5 rounded-xl border border-navy-100 bg-navy-50/50 p-4">
          <p className="text-sm font-semibold text-navy-800">Interview</p>
          {candidate.interviewCompleted ? (
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm text-navy-600">
                Score:{" "}
                <strong>
                  {candidate.score}/{candidate.total}
                </strong>
              </p>
              <Link
                href={`/admin/interviews/${candidate.id}`}
                className="text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                View full results →
              </Link>
            </div>
          ) : (
            <p className="mt-1 text-sm text-navy-500">Not completed yet.</p>
          )}
        </div>

        <div className="mt-5">
          <VoicePanel
            id={candidate.id}
            documents={candidate.documents}
            voiceStatus={candidate.voiceStatus}
            requestedAt={candidate.voiceRequestedAt}
            openedAt={candidate.voiceOpenedAt}
            openCount={candidate.voiceOpenCount}
            reminderSentAt={candidate.voiceReminderSentAt}
            reminderCount={candidate.voiceReminderCount}
          />

          {/* Directly under the recording it is about: the answer to somebody
              who has sent theirs and heard nothing. */}
          <VoiceAckButton
            candidate={{
              id: candidate.id,
              fullName: candidate.fullName,
              email: candidate.email,
              status: candidate.status,
              voiceStatus: candidate.voiceStatus,
              voiceAckSentAt: candidate.voiceAckSentAt,
              voiceAckCount: candidate.voiceAckCount,
              voiceAcks: candidate.voiceAcks,
              offerSentAt: candidate.offerSentAt,
              hasRecording: !!currentVoiceRecording(candidate.documents),
            }}
            onSent={(patch) => onChange(patch)}
          />

          {/* The same promise for somebody verified who sent no recording —
              they would rather wait for the final video interview. */}
          <VerifiedAckButton candidate={candidate} onSent={(patch) => onChange(patch)} />

          {/* The last step of the assessment: the final interview, held as a
              live chat. The link, whether they started, and the transcript. */}
          <ChatLinkPanel
            candidate={{
              id: candidate.id,
              fullName: candidate.fullName,
              email: candidate.email,
              chatLinkSentAt: candidate.chatLinkSentAt,
              chatLinks: candidate.chatLinks,
            }}
            onChange={(patch) => onChange(patch)}
          />

          {/* After the interview chat has ended: chat with them again. */}
          <FollowupChatPanel
            candidate={{
              id: candidate.id,
              fullName: candidate.fullName,
              email: candidate.email,
              followupChatLinks: candidate.followupChatLinks,
            }}
            onChange={(patch) => onChange(patch)}
          />
        </div>
        </div>

        <div hidden={tab !== "id"}>
        <div className="mt-5">
          <VerificationPanel
            id={candidate.id}
            fullName={candidate.fullName}
            email={candidate.email}
            documents={candidate.documents}
            initial={verification}
            live={liveStateOf(candidate)}
            offerAcceptedAt={candidate.offerAcceptedAt}
            onLiveChange={(live) => onChange(live)}
            onChange={(v) =>
              onChange(verificationPatch(v))
            }
          />

          {/* Beside the photographs, because it is the same question: have we
              got what we need from this person, and what have we already done
              about it. */}
          <IdentityReminderButton
            candidate={candidate}
            onSent={(patch) => onChange(patch)}
          />

          {/* Under the identity check, because it is that question one step
              on: the passport says which country issued it, this says which
              country they are in, and the agreement carries the second. */}
          <ResidencePanel
            id={candidate.id}
            documents={candidate.documents}
            state={candidate}
            defaultCountry={candidate.confirmedDetails?.country || candidate.country}
            nationality={candidate.confirmedDetails?.nationality}
            onChange={(patch) => onChange(patch)}
          />

          {/* The optional last step before the agreement: a bill or bank
              statement showing the address the agreement will carry. */}
          <AddressProofPanel
            candidate={candidate}
            onOpenDocument={onOpenDocument}
            onChange={onChange}
            onReview={() => setReviewingAddress(true)}
          />
          {reviewingAddress ? (
            <AddressReviewViewer
              queue={addressQueue?.candidates.length ? addressQueue.candidates : [candidate]}
              startId={candidate.id}
              onClose={() => setReviewingAddress(false)}
              onChange={(id, patch) => (id === candidate.id ? onChange(patch) : addressQueue?.onChange(id, patch))}
            />
          ) : null}

          {/* Last, because it answers for both panels above: what they sent
              under either has arrived and is waiting for us. */}
          <SubmissionReceivedButton
            candidate={candidate}
            onSent={(patch) => onChange(patch)}
          />
        </div>
        </div>

        <div hidden={tab !== "offer"}>
        {/* The live interview happens off-system, once the recording is in;
            this is where its outcome lands. */}
        {showOffer && canOffer(candidate.voiceStatus, candidate) ? (
          <div className="mt-5">
            <OfferPanel
              id={candidate.id}
              fullName={candidate.fullName}
              position={candidate.position}
              hasEmail={!!candidate.email}
              blocked={agreementBlocker(candidate)}
              initial={{
                offer: candidate.offer,
                offerSentAt: candidate.offerSentAt,
                offerAcceptedAt: candidate.offerAcceptedAt,
                offerDeclinedAt: candidate.offerDeclinedAt,
                offerDeclineReason: candidate.offerDeclineReason,
              }}
              onChange={({ status, ...offerState }) =>
                onChange({
                  ...offerState,
                  ...(status ? { status: status as CandidateStatus } : {}),
                })
              }
            />

            {/* Directly under the offer, because it is the same question:
                what happened to it. */}
            <OfferReplyPanel candidate={candidate} onSent={(patch) => onChange(patch)} />
          </div>
        ) : null}

        {/* What they stated when accepting, and what they corrected. Sits
            directly under the offer, which is what prompted it. */}
        </div>

        <div hidden={tab !== "company"}>
        {/* What they stated when accepting, kept directly above the company
            answer rather than with the offer. The two are read against each
            other — a claim about who they are, and then evidence about who the
            agreement is actually with — and separating them would mean looking
            in two places to notice they disagree. */}
        <ConfirmedDetailsPanel candidate={candidate} />

        {/* India only, and optional: the card they chose to send when
            accepting, for the agreement and its payments. */}
        <PanCardPanel
          candidate={candidate}
          onOpenDocument={onOpenDocument}
          onChange={onChange}
        />

        <CompanyDetailsPanel
          candidate={candidate}
          onOpenDocument={onOpenDocument}
          onChange={onChange}
        />

        {/* Whether they already trade through a UK limited company, which is
            the same question the offer step asks them. */}
        <CompanyCheckPanel
          id={candidate.id}
          initial={candidate.companyCheck}
          hasDob={!!(candidate.dob || candidate.confirmedDetails?.dob)}
        />
        </div>

        <div hidden={tab !== "agreement"}>
          <AgreementPanel candidate={candidate} onOpenDocument={onOpenDocument} onChange={onChange} />
        </div>

        <div hidden={tab !== "notes"}>
        <NotesEditor
          id={candidate.id}
          initial={candidate.notes ?? ""}
          onSaved={(notes) => onChange({ notes })}
          onDirtyChange={(dirty) => {
            setNotesDirty(dirty);
            // Saving them clears the warning, rather than leaving it standing
            // over a note that is now safely stored.
            if (!dirty) setConfirmLeave(null);
          }}
        />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  full,
}: {
  label: string;
  value: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-medium uppercase tracking-wide text-navy-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-navy-900">{value || "—"}</dd>
    </div>
  );
}
