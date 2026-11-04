/**
 * SERVER-ONLY lightweight persistence for candidates and interview results.
 *
 * The project has no database, so candidates are stored in a single JSON file
 * (data/candidates.json, git-ignored — it contains personal data). Writes are
 * serialized through an in-process queue to avoid corruption under light load.
 *
 * Set DATA_DIR to relocate the file (e.g. a persistent disk on your host).
 * Note: on ephemeral/serverless filesystems this file does not persist between
 * deployments — use a host with a persistent disk for production.
 */
import { promises as fs } from "node:fs";
import type { LiveVerificationReason } from "@/lib/liveVerification";
import path from "node:path";
import { writeFileAtomic } from "@/lib/atomicWrite";
import {
  BEFORE_REVIEW,
  CANDIDATE_STATUSES,
  VOICE_SKIPPED,
  VOICE_STATUSES,
  type CandidateStatus,
  type VoiceStatus,
} from "@/lib/candidateStatus";
import { normaliseEmail, normalisePhone } from "@/lib/identity";
import { isCandidateOpen, type OpenSource } from "@/lib/followUp";
import {
  currentDocument,
  isPanDocumentKind,
  keepsHistory,
  type CandidateDocument,
  type DocumentKind,
} from "@/lib/documents";
import { needsBack, type IdDocumentType } from "@/lib/identityDocuments";
import { isVerificationKind } from "@/lib/verification";
import { isResidenceKind } from "@/lib/residence";

export { CANDIDATE_STATUSES, VOICE_STATUSES };
export type { CandidateStatus, VoiceStatus };
import { effectiveOffer, type Offer } from "@/lib/offer";
import { panSentSince, type PanAnswer } from "@/lib/pan";
import type { LiveReminder } from "@/lib/chat";
import type { AddressDocType, AddressProofEvent, AddressProofSubmission } from "@/lib/addressProof";
import type { AgreementEvent, AgreementSubmission } from "@/lib/agreement";

/** One "please re-upload your PAN card" email. */
export interface PanReuploadRequest {
  at: string;
  by?: string;
  reason: string;
}
import { deadlineFrom } from "@/lib/offerReminder";
import type { Availability } from "@/lib/availability";
import type { ConfirmedDetails } from "@/lib/hiring";
import type { CompanyDetails } from "@/lib/companyDetails";
import type { CompanyCheck } from "@/lib/companyCheck";

export interface LanguageRow {
  language: string;
  speaking: string;
  writing: string;
  reading: string;
}

export interface InterviewResult {
  completedAt: string;
  score: number;
  total: number;
  answers: Record<string, string>;
}

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dob: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  linkedin: string;
  languages: LanguageRow[];
  position: string;
  /** Full raw application snapshot for the profile view. */
  application: Record<string, unknown>;
  /**
   * Marked by a recruiter as one to come back to.
   *
   * Deliberately not a status. A status says where somebody is in the
   * process and every candidate has exactly one; this says a person found
   * them interesting, which is orthogonal to all of it — you can favourite a
   * new applicant and a hired one, and doing so must not move either of them
   * out of the list they belong in.
   *
   * `favoritedAt` is kept so the tab can put the most recently marked first,
   * which is almost always the order you want: the ones you starred this
   * morning are the ones you are still thinking about.
   */
  favorite?: boolean;
  favoritedAt?: string;
  /**
   * The US Social Security Number, given when the offer was accepted.
   *
   * Deliberately its own field rather than part of confirmedDetails: those are
   * built into the candidate view and travel to the browser with every row of
   * every table, and this is the one value that must never do that. It is read
   * through `ssnOf` and served by one route, to one person, on request.
   *
   * Absent for everybody who is not in the United States, and for anyone who
   * has not accepted an offer yet. Candidates who applied before the question
   * moved still carry theirs inside `application`; `ssnOf` reads both.
   */
  ssn?: string;
  status: CandidateStatus;
  createdAt: string;
  submittedAt?: string;
  invitationSentAt?: string;
  interview?: InterviewResult;
  // Post-interview follow-up (Interviews section). The congratulations and
  // the voice-assessment request are now one email, sent when this is set.
  voiceRequestedAt?: string;
  voiceStatus?: VoiceStatus;
  /**
   * The written offer, exactly as sent. Stored rather than rebuilt from the
   * job listing: a listing's advertised pay changes, and what we offered one
   * person on one day must not change with it.
   */
  offer?: Offer;
  offerSentAt?: string;
  offerAcceptedAt?: string;
  offerDeclinedAt?: string;
  offerDeclineReason?: string;
  /**
   * Chasing an answer to an offer, and the deadline that chase set.
   *
   * The deadline is stored rather than worked out on the fly: somebody told
   * "answer by Saturday" must still have Saturday if the rule behind it is
   * ever changed. Every reminder keeps its date, for the same reason the
   * identity ones do — it is what you read back to someone who says nobody
   * ever asked them.
   */
  offerReminderSentAt?: string;
  offerReminderCount?: number;
  offerReminders?: string[];
  offerReplyDeadline?: string;
  /**
   * What the candidate re-confirmed when they accepted.
   *
   * Kept beside the application rather than written over it. The application
   * is what someone typed to get past a form; this is what they stated when
   * it was about to become a contract, and the difference between the two is
   * worth seeing.
   */
  confirmedDetails?: ConfirmedDetails;
  confirmedDetailsAt?: string;
  /**
   * The company a candidate contracts through, confirmed on its own page.
   *
   * Kept apart from confirmedDetails because it is about a different legal
   * person: the agreement is with the company, and what they typed into two
   * boxes while accepting is a claim about it rather than evidence. The
   * requests are listed so a recruiter can see what has already been asked,
   * with dates, before asking again.
   */
  companyDetails?: CompanyDetails;
  companyDetailsAt?: string;
  companyRequestedAt?: string;
  companyRequestCount?: number;
  companyRequests?: string[];
  companyOpenedAt?: string;
  companyLastOpenedAt?: string;
  companyOpenCount?: number;
  /**
   * The eight-hour window and five days the candidate chose when accepting.
   *
   * Their choice, not ours, and stored with the timezone they picked it in —
   * "08:00" from Casablanca and "08:00" from Lagos are an hour apart, and the
   * schedule is the thing an agreement is built on.
   */
  availability?: Availability;
  /** Set when a recruiter chose the hours and days (Agreement tab), not the candidate. */
  availabilitySetBy?: string;
  availabilitySetAt?: string;
  /**
   * Result of looking this candidate up in the UK register of company
   * officers. Cached because it is a paid-for-with-requests lookup and a
   * recruiter re-opening a profile should not trigger another one — and
   * timestamped because companies are incorporated and dissolved, so an old
   * answer must not read as a current one.
   */
  companyCheck?: CompanyCheck;
  /** Set once the assessment invitation email has gone out, so a resubmit
   *  or a retried request cannot send the candidate a second copy. */
  interviewEmailSentAt?: string;
  /**
   * Set when this application's phone number matches an earlier candidate.
   * A flagged application is stored and notified as normal, but the assessment
   * email is withheld until a recruiter releases it from the Admin Panel.
   */
  duplicateFlag?: boolean;
  /** Id of the earlier candidate whose phone matched. */
  duplicateOfId?: string;
  /** Name of that candidate, kept so the Admin Panel needs no second lookup. */
  duplicateOfName?: string;
  /** Free-text recruiter notes — call outcomes, availability, anything. */
  notes?: string;
  notesUpdatedAt?: string;
  /**
   * First time the candidate actually opened their assessment page.
   *
   * Recorded from the browser, not the server render: pasting a link into
   * WhatsApp makes it fetch the URL to build a preview, which would otherwise
   * mark the assessment opened before the candidate ever saw it. Written once
   * — every write rewrites the whole file, so refreshes must not cost anything.
   */
  interviewOpenedAt?: string;
  /**
   * Most recent open, how many there have been, and which link brought them.
   *
   * interviewOpenedAt alone cannot tell you whether a reminder worked — it is
   * frozen at the first visit, which is usually before you ever chased them.
   */
  lastOpenedAt?: string;
  openCount?: number;
  lastOpenSource?: OpenSource;
  /**
   * Uploaded CV, cover letter and certificate.
   *
   * Only metadata lives here — the files themselves are in R2. A blocked
   * document keeps its entry with no key, so the recruiter can see that
   * something was sent and what happened to it.
   */
  documents?: CandidateDocument[];
  /**
   * Identity verification. The images live in R2 like any other document; these
   * record the decision about them, which outlives the files themselves so a
   * recruiter can clear the photographs without losing the outcome.
   */
  verificationConsentAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  imagesDeletedAt?: string;
  /** Set when a recruiter asks someone whose country is not on the list. */
  verificationRequestedAt?: string;
  /**
   * Which of the three documents they chose to send.
   *
   * Absent on every record made before the picker existed. That absence is
   * meaningful and must not be filled in with a guess — it says "front and
   * selfie, document unknown", which is exactly what those records hold.
   */
  identityDocumentType?: IdDocumentType;
  /**
   * When a recruiter last asked for the photographs to be taken again, and the
   * reason the candidate is shown. Kept as a timestamp rather than a flag so
   * it can be compared against the newest photograph on file — that comparison
   * is what stops the request outliving the answer to it.
   */
  identityReuploadRequestedAt?: string;
  identityReuploadReason?: string;
  /**
   * Proof that they live where they say they live — see lib/residence.
   *
   * Separate from the identity check because it answers a different question.
   * A passport proves nationality; the agreement carries a residence address,
   * and for somebody whose nationality and address are different countries
   * nothing on file connects them to that address. Asked by hand, never by a
   * rule: the mismatch is common and almost always innocent.
   *
   * `residenceCountry` records which country they were asked to prove, so a
   * later "verified" means something specific rather than "a document
   * arrived". The explanation is for the candidate who has no permit — their
   * own words about why they are in the country, which a recruiter reads and
   * then accepts or does not.
   */
  residenceRequestedAt?: string;
  residenceCountry?: string;
  residenceReason?: string;
  residenceExplanation?: string;
  residenceExplainedAt?: string;
  residenceVerifiedAt?: string;
  residenceVerifiedBy?: string;
  residenceRejectedAt?: string;
  residenceRejectionReason?: string;
  residenceReuploadRequestedAt?: string;
  residenceReuploadReason?: string;
  residenceImagesDeletedAt?: string;
  /**
   * Whether they said they have a PAN card, at acceptance. India only, and
   * optional — see lib/pan. The card itself is in documents.
   */
  panAnswer?: PanAnswer;
  panAnsweredAt?: string;
  /** When the PAN card was deleted from the Admin Panel. */
  panDeletedAt?: string;
  /**
   * GSTIN, optional, given at acceptance by somebody living in India. Kept
   * normalised (capitals, no spaces) and only once it has passed the check.
   */
  gstin?: string;
  /** Set when a recruiter typed it in from a reply, rather than the candidate on the offer page. */
  gstinAddedAt?: string;
  gstinAddedBy?: string;
  /** Where a GSTIN added after acceptance came from: absent = a recruiter, from a reply. */
  gstinAddedVia?: "pan-reupload";
  /** "GSTIN needed" emails sent from View info, oldest first. */
  gstinRequests?: string[];
  /**
   * "Your place is waiting — send us your GSTIN when ready" emails, oldest
   * first, with who sent each (a person from View info, or a bulk batch).
   */
  gstinWaitingEmails?: { at: string; by?: string }[];
  /**
   * PAN card re-upload: the newest request (and what the candidate was told),
   * every request with who sent it, and when new photos came back. See lib/pan.
   */
  panReuploadRequestedAt?: string;
  panReuploadReason?: string;
  panReuploadRequests?: PanReuploadRequest[];
  panReuploadedAt?: string;
  /**
   * Proof of address — a recent bill or bank statement, asked for as the last
   * step before the final agreement. Optional; nothing waits on it. See
   * lib/addressProof.
   *
   * `RequestedAt` is the newest request or new-document request (a reminder
   * does not move it): a document counts as an answer only if it arrived
   * after it. Every email is kept in `Events`, every upload in `Submissions`
   * with the address they typed — which never overwrites confirmedDetails.
   */
  addressProofRequestedAt?: string;
  addressProofReason?: string;
  addressProofEvents?: AddressProofEvent[];
  addressProofSubmittedAt?: string;
  addressProofSubmissions?: AddressProofSubmission[];
  addressProofApprovedAt?: string;
  addressProofApprovedBy?: string;
  /**
   * The final agreement — see lib/agreement. `agreementSentAt` is the newest
   * send or new-copy request (a reminder does not move it); the signed copy
   * counts only if it came after it.
   */
  agreementSentAt?: string;
  /** Start date for the agreement, set by a recruiter when the offer had none. */
  agreementStartDate?: string;
  /** Reference and stored PDF of the newest agreement sent. */
  agreementRef?: string;
  agreementKey?: string;
  /** Shown on their page when a new signed copy is asked for. */
  agreementReason?: string;
  agreementEvents?: AgreementEvent[];
  agreementSignedAt?: string;
  agreementSubmissions?: AgreementSubmission[];
  agreementApprovedAt?: string;
  agreementApprovedBy?: string;
  /**
   * The live identity check: a link created for this one candidate in Persona,
   * emailed to them by hand when photographs could not settle the question.
   *
   * Sent, opened and started are kept apart because they are three different
   * problems: an email that never arrived, a person hesitating over it, and a
   * check already half-finished in the provider's dashboard.
   */
  liveVerificationUrl?: string;
  liveVerificationSentAt?: string;
  liveVerificationCount?: number;
  liveVerificationOpenedAt?: string;
  liveVerificationLastOpenedAt?: string;
  liveVerificationOpenCount?: number;
  liveVerificationStartedAt?: string;
  /**
   * Times the provider link behind an already-sent check was swapped.
   *
   * Kept apart from the send count because they are different events: one put
   * something in somebody's inbox, the other changed where a link they already
   * hold points. A provider session expires long before a candidate gets round
   * to it, and emailing them again every time one does would be our filing
   * problem landing in their inbox.
   */
  liveVerificationLinkChanges?: string[];
  liveVerificationLinkChangedAt?: string;
  liveVerificationLinkChangeCount?: number;
  /**
   * When the recruiter marked the provider session dead, and with it the
   * candidate held on a waiting page.
   *
   * One field for two facts, because they are the same fact: its presence
   * means held, and its value means since when. A separate boolean would let
   * "held" and "held since" disagree, and the second is what tells you
   * somebody has been sitting in front of a holding message for ten minutes.
   */
  liveVerificationHeldAt?: string;
  /**
   * When this candidate was first seen on the waiting page, while held.
   *
   * The field above is a decision about the link; this one is a fact about the
   * person, and only this one can answer "how long have they been staring at
   * it". Written by the waiting page itself, cleared the moment they are let
   * out — by a replacement link, a fresh email, or the hold being lifted.
   */
  liveVerificationWaitingSince?: string;
  /** Which of the two live-check emails this candidate was sent. */
  liveVerificationReason?: LiveVerificationReason;
  /**
   * When the recruiter marked the live check passed, after the provider said
   * all was correct. From then on their link shows a "completed" page instead
   * of sending them to the provider again.
   */
  liveVerificationPassedAt?: string;
  /** What the recruiter wrote when marking it, e.g. the provider's reference. */
  liveVerificationPassedNote?: string;
  /**
   * Whether the candidate has actually opened the voice-assessment page, and
   * how often.
   *
   * Separate from interviewOpenedAt even though both live at /interview: the
   * assessment open happened weeks earlier and says nothing about whether they
   * have seen the recording step. Without this, "no recording yet" covers two
   * different people — one who read the email and is putting it off, and one
   * for whom the email never arrived — and only the second is worth chasing
   * on another channel.
   *
   * Recorded from the browser, never from the server render: pasting the link
   * into WhatsApp makes it fetch the URL for a preview, and a preview bot must
   * not count as a candidate.
   */
  voiceOpenedAt?: string;
  voiceLastOpenedAt?: string;
  voiceOpenCount?: number;
  /** Reminders chasing an outstanding recording. Email only, by design. */
  /**
   * When we told them the recording had arrived and a decision was coming.
   *
   * Kept apart from the reminders: those chase the candidate, this one answers
   * them. Every one is dated, because "when did you last hear from us" is the
   * question somebody emailing after three weeks is really asking.
   */
  voiceAckSentAt?: string;
  voiceAckCount?: number;
  voiceAcks?: string[];
  /**
   * "Your information is verified — we will be in touch about a place", for
   * a verified candidate with no voice recording. Every send kept, like the
   * recording receipt. See lib/verifiedAck.
   */
  verifiedAckSentAt?: string;
  verifiedAcks?: string[];
  voiceReminderSentAt?: string;
  voiceReminderCount?: number;
  /**
   * Reminders chasing identity documents from someone who has accepted.
   *
   * Their own counters rather than the voice ones: these are weeks apart and
   * about different things, and "chased 3 times" is useless to whoever is
   * deciding whether to chase a fourth unless it says about what.
   */
  identityReminderSentAt?: string;
  identityReminderCount?: number;
  /**
   * When each identity reminder went out, oldest first.
   *
   * The count and the last date are kept beside it because the tables read
   * them, but this is the record: a candidate asking why they were chased
   * three times, or a recruiter deciding whether a fourth is fair, both need
   * the dates rather than a total. Absent on reminders sent before this was
   * kept — an empty history is not the same as never reminded, which is why
   * the count is not derived from it alone.
   */
  identityReminders?: string[];
  /**
   * Final-interview chat links, oldest first. The last is the live one: the
   * chat page turns away a link whose time is not this. See lib/chat.
   */
  chatLinkSentAt?: string;
  chatLinks?: string[];
  /**
   * Onboarding-chat links, oldest first — kept apart from the interview links
   * above, so sending one kind never replaces or closes the other. The last is
   * the live one. See lib/chat ChatKind.
   */
  onboardingChatLinks?: string[];
  /** Follow-up chat links, oldest first — a third chain, like onboarding's. */
  followupChatLinks?: string[];
  /** Why each follow-up was asked, by the link's send time. */
  followupReasons?: Record<string, string>;
  /** "Our team is live now" emails, oldest first — see lib/chat. */
  liveReminders?: LiveReminder[];
  /** When the status was set to "Full verified", and by whom. Cleared if it is changed away. */
  fullyVerifiedAt?: string;
  fullyVerifiedBy?: string;
  /**
   * "We have received what you sent and it is under review" — sent by hand
   * from the ID check tab. Every one kept, like the reminders, because "told
   * on 9 Sept that it takes one to three business days" is exactly what you
   * need in front of you when somebody writes on the 15th asking what happened.
   */
  submissionAckSentAt?: string;
  submissionAckCount?: number;
  submissionAcks?: string[];
  /**
   * The country the application was actually sent from, as the server saw it.
   *
   * Deliberately not the IP address: a raw address is personal data with real
   * weight, and a two-letter code carries the whole signal at a fraction of the
   * exposure. There is no stored "mismatch" flag either — it is derived when
   * read, so it cannot go stale if the candidate's stated country changes.
   */
  detectedCountryIso?: string;
  /** The same country as a name from the app's list, so it compares to `country`. */
  detectedCountryName?: string;
  detectedCountryAt?: string;
  /** Reminder chasing an unfinished assessment, per channel. */
  reminderEmailSentAt?: string;
  reminderEmailCount?: number;
  reminderWhatsAppSentAt?: string;
  reminderWhatsAppCount?: number;
}

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "candidates.json");

async function readAll(): Promise<Candidate[]> {
  let raw: string;
  try {
    raw = await fs.readFile(FILE, "utf8");
  } catch {
    // No file yet. That is genuinely nobody, on a fresh install.
    return [];
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    /**
     * A file that exists but will not parse is damage, not emptiness, and the
     * two must not look the same. Returning [] here would show an empty
     * candidate list — and if the caller were a write, it would then save that
     * emptiness over the top of everyone. Better a visible failure.
     */
    throw new Error(`${FILE} exists but could not be parsed as JSON`);
  }
  if (!Array.isArray(data)) return [];
  for (const c of data as Candidate[]) separateChatLinks(c);
  return data as Candidate[];
}

/**
 * For a short while onboarding links were also kept with the interview links,
 * and the newest of either kind was "the" chat link. Take them back out, so
 * the interview link on record is an interview link. Saved on the next write.
 */
function separateChatLinks(c: Candidate): void {
  const onboarding = c.onboardingChatLinks;
  if (!onboarding?.length || !c.chatLinks?.some((t) => onboarding.includes(t))) return;
  c.chatLinks = c.chatLinks.filter((t) => !onboarding.includes(t));
  c.chatLinkSentAt = c.chatLinks[c.chatLinks.length - 1];
}

// Serialize writes so concurrent requests don't clobber the file.
let writeChain: Promise<unknown> = Promise.resolve();

function withWrite<T>(fn: (list: Candidate[]) => { list: Candidate[]; result: T }): Promise<T> {
  const run = async (): Promise<T> => {
    const list = await readAll();
    const { list: next, result } = fn(list);
    // Atomic: readers never see a half-written file. Writes are serialized
    // against each other by the chain below, but reads are not serialized
    // against writes at all — and a plain truncate-then-fill let a concurrent
    // read parse nothing and conclude there were no candidates.
    await writeFileAtomic(FILE, JSON.stringify(next, null, 2));
    return result;
  };
  const p = writeChain.then(run, run);
  writeChain = p.catch(() => {});
  return p;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function listCandidates(): Promise<Candidate[]> {
  const list = await readAll();
  return list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function getCandidate(id: string): Promise<Candidate | null> {
  const list = await readAll();
  return list.find((c) => c.id === id) ?? null;
}

export interface DuplicateCheck {
  /** An earlier candidate already used this email address. */
  emailTaken: boolean;
  /** An earlier candidate already used this phone number. */
  phoneMatch: { id: string; name: string; createdAt: string } | null;
  /**
   * Id of this person's own unfinished attempt, if they have one. The form
   * adopts it so a restart updates that record rather than leaving a second
   * one behind.
   */
  resumeId: string | null;
}

/**
 * Look for an earlier application from the same person.
 *
 * `selfId` is the id of the application being filled in right now, so a
 * candidate revisiting their own Personal Information step does not match
 * themselves.
 */
export async function findDuplicates(
  email: string,
  phone: string,
  selfId: string,
): Promise<DuplicateCheck> {
  const list = await readAll();
  const wantEmail = normaliseEmail(email);
  const wantPhone = normalisePhone(phone);

  const others = list.filter((c) => c.id !== selfId);

  /**
   * What counts as having applied.
   *
   * A record is created at step one so the recruiter gets the notification and
   * the interview link straight away, but reaching step one is an attempt, not
   * an application. Counting it meant someone who filled in their details and
   * closed the tab was permanently locked out by their own abandoned record —
   * and told to contact us about an application they never made.
   *
   * Three things do count, because each means the person is already moving
   * through the process rather than starting out:
   *   submittedAt        — they finished the form.
   *   interview          — they finished the assessment.
   *   interviewOpenedAt  — they opened their assessment link. The recruiter has
   *                        already sent it and is waiting on them, so a second
   *                        application would fork the same person into two
   *                        records at the point where that is most confusing.
   */
  const applied = others.filter((c) => c.submittedAt || c.interview || c.interviewOpenedAt);

  const emailTaken = wantEmail
    ? applied.some((c) => normaliseEmail(c.email) === wantEmail)
    : false;

  let phoneMatch: DuplicateCheck["phoneMatch"] = null;
  if (wantPhone) {
    // Oldest first, so the flag names the original application.
    const hit = [...applied]
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
      .find((c) => normalisePhone(c.phone) === wantPhone);
    if (hit) phoneMatch = { id: hit.id, name: hit.fullName || "Unknown", createdAt: hit.createdAt };
  }

  // An unfinished attempt from the same person, so the form can carry on with
  // that record instead of leaving a second one behind. Matched on email only:
  // a phone is shared by families and offices, and merging two people because
  // they use one handset is far worse than keeping a duplicate.
  let resumeId: string | null = null;
  if (wantEmail) {
    const open = others
      .filter(
        (c) =>
          !c.submittedAt &&
          !c.interview &&
          !c.interviewOpenedAt &&
          normaliseEmail(c.email) === wantEmail,
      )
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (open[0]) resumeId = open[0].id;
  }

  return { emailTaken, phoneMatch, resumeId };
}

/**
 * Record that the candidate opened their assessment, the first time only.
 *
 * Repeat opens are recorded too, because "did they come back after we chased
 * them" is the question the follow-up column answers, and the first open alone
 * cannot answer it. They are throttled to one write per REOPEN_THROTTLE_MS,
 * though: every write rewrites the whole file, so a refresh must stay free.
 *
 * Returns false when nothing was written.
 */
const REOPEN_THROTTLE_MS = 10 * 60 * 1000;

export function recordInterviewOpened(id: string, source?: OpenSource): Promise<boolean> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: false };
    // A recruiter checking the link is not the candidate opening it.
    if (!isCandidateOpen(source)) return { list, result: false };

    const now = Date.now();
    const last = c.lastOpenedAt ?? c.interviewOpenedAt;
    const recent = last && now - new Date(last).getTime() < REOPEN_THROTTLE_MS;
    // A refresh within the window is free unless it came in through a link we
    // have not credited yet — the attribution is the point.
    if (recent && (!source || source === c.lastOpenSource)) return { list, result: false };

    const iso = new Date(now).toISOString();
    if (!c.interviewOpenedAt) c.interviewOpenedAt = iso;
    c.lastOpenedAt = iso;
    c.openCount = (c.openCount ?? 0) + 1;
    if (source) c.lastOpenSource = source;
    return { list, result: true };
  });
}

/**
 * Record that the candidate opened their voice-assessment page.
 *
 * Same shape and the same throttle as the assessment open, for the same
 * reasons: repeat opens answer "did they come back after we chased them", and
 * every write rewrites the whole file so a refresh has to stay free.
 */
export function recordVoiceOpened(id: string, source?: OpenSource): Promise<boolean> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: false };
    // A recruiter checking the link is not the candidate opening it.
    if (!isCandidateOpen(source)) return { list, result: false };

    const now = Date.now();
    const last = c.voiceLastOpenedAt ?? c.voiceOpenedAt;
    if (last && now - new Date(last).getTime() < REOPEN_THROTTLE_MS) {
      return { list, result: false };
    }

    const iso = new Date(now).toISOString();
    if (!c.voiceOpenedAt) c.voiceOpenedAt = iso;
    c.voiceLastOpenedAt = iso;
    c.voiceOpenCount = (c.voiceOpenCount ?? 0) + 1;
    return { list, result: true };
  });
}

/**
 * Log a reminder sent about identity documents an accepted candidate owes.
 *
 * Counted only once the message is away — a count that includes failures reads
 * as "chased twice, no response" about somebody who was never reached.
 */
export function recordIdentityReminder(id: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    const now = new Date().toISOString();
    // Every one of them, kept. "Chased twice" is a number; "9 Sept, then 14
    // Sept" is what tells you whether the second one was reasonable and when
    // a third would be — and it is what you read back to somebody who says
    // nobody ever told them.
    c.identityReminders = [...(c.identityReminders ?? []), now];
    c.identityReminderSentAt = now;
    c.identityReminderCount = c.identityReminders.length;
    return { list, result: c };
  });
}

/**
 * Record that a live identity check was emailed to a candidate.
 *
 * The link is stored with it. It is the only copy: the recruiter created it in
 * Persona for this one person, and without it here a second attempt means
 * going back to the provider's dashboard to find which inquiry belonged to
 * whom. Sending again replaces the link, because the newest one is the one
 * their email now points at.
 */
export function recordLiveVerificationSent(
  id: string,
  url: string,
  reason: LiveVerificationReason = "retry",
): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.liveVerificationUrl = url;
    // Kept so the page they land on tells the same story as the email that
    // sent them there. A candidate reading "one last step before your
    // agreement" and arriving at "your photographs were not clear enough" has
    // been given two different accounts of where they stand.
    c.liveVerificationReason = reason;
    c.liveVerificationSentAt = new Date().toISOString();
    c.liveVerificationCount = (c.liveVerificationCount ?? 0) + 1;
    // A fresh request, so what happened to the last one is history. Leaving
    // the old marks would show "opened" against a link nobody has opened yet.
    c.liveVerificationOpenedAt = undefined;
    c.liveVerificationLastOpenedAt = undefined;
    c.liveVerificationOpenCount = undefined;
    c.liveVerificationStartedAt = undefined;
    // A new email starts the story again, so the swaps made against the old
    // one are not a fact about this link.
    c.liveVerificationLinkChanges = undefined;
    c.liveVerificationLinkChangedAt = undefined;
    c.liveVerificationLinkChangeCount = undefined;
    c.liveVerificationHeldAt = undefined;
    c.liveVerificationWaitingSince = undefined;
    return { list, result: c };
  });
}

/**
 * Point an already-sent check at a new provider session.
 *
 * The link in the candidate's inbox is ours, and their token is checked
 * against `liveVerificationSentAt` — so leaving that field alone is what keeps
 * their email working. Only the destination behind it changes.
 *
 * `liveVerificationStartedAt` is cleared deliberately. Whatever they started
 * was the session that has since died; whether they start this one is a fresh
 * question, and the recruiter should be told about it when they do. What
 * happened is not lost — the swap is dated here, and the opens are untouched,
 * because opening our page is still something they did.
 *
 * Refuses when nothing has been sent. There is no link in anybody's inbox to
 * re-point, and quietly storing a URL nobody has would look like a check was
 * out when none was.
 */
export function replaceLiveVerificationLink(id: string, url: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c || !c.liveVerificationSentAt) return { list, result: null };
    const now = new Date().toISOString();
    c.liveVerificationUrl = url;
    c.liveVerificationLinkChanges = [...(c.liveVerificationLinkChanges ?? []), now];
    c.liveVerificationLinkChangedAt = now;
    c.liveVerificationLinkChangeCount = c.liveVerificationLinkChanges.length;
    c.liveVerificationStartedAt = undefined;
    // A working session is exactly what the waiting page was waiting for.
    c.liveVerificationHeldAt = undefined;
    c.liveVerificationWaitingSince = undefined;
    return { list, result: c };
  });
}

/**
 * Hold a candidate on a waiting page, or let them through.
 *
 * Marks the provider session dead without touching anything else. The link in
 * their inbox still opens — it just shows "we are preparing your verification"
 * instead of a button that would end at a session the provider has closed.
 *
 * Refuses when nothing has been sent, for the same reason replacing does:
 * there is no page for anybody to be held on.
 */
/**
 * Mark the live check passed, or take that back.
 *
 * Only for somebody who was actually sent one. Passing also ends any hold:
 * a candidate who has finished is not waiting for a new link.
 */
export function setLiveVerificationPassed(
  id: string,
  passed: { note?: string } | null,
): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c || !c.liveVerificationSentAt) return { list, result: null };
    if (passed) {
      c.liveVerificationPassedAt = new Date().toISOString();
      c.liveVerificationPassedNote = passed.note || undefined;
      c.liveVerificationHeldAt = undefined;
      c.liveVerificationWaitingSince = undefined;
    } else {
      c.liveVerificationPassedAt = undefined;
      c.liveVerificationPassedNote = undefined;
    }
    return { list, result: c };
  });
}

export function setLiveVerificationHold(
  id: string,
  held: boolean,
): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c || !c.liveVerificationSentAt) return { list, result: null };
    // Re-marking an already-held candidate keeps the original moment. The
    // waiting message changes with how long they have been there, and
    // restarting the clock would quietly tell somebody who has waited twenty
    // minutes that they have waited one.
    if (held) c.liveVerificationHeldAt = c.liveVerificationHeldAt ?? new Date().toISOString();
    else {
      c.liveVerificationHeldAt = undefined;
      // Letting them out ends the wait. Leaving this set would keep a cleared
      // candidate showing on the panel as somebody still sitting on the page.
      c.liveVerificationWaitingSince = undefined;
    }
    return { list, result: c };
  });
}

/**
 * This candidate is on the waiting page, as of now.
 *
 * Only the first sighting is kept, so the clock measures how long they have
 * been there rather than how recently they were last seen. The waiting page
 * reports itself on load and on every poll, and a reload after a long wait
 * must not restart the count at zero — that was the whole reason for not
 * reusing the open timestamps, which are throttled to a longer interval than
 * the wait this is measuring.
 *
 * Does nothing unless the candidate is actually held: a page that is not
 * showing the waiting message has nobody waiting on it.
 */
export function markLiveVerificationWaiting(id: string): Promise<string | null> {
  return withWrite<string | null>((list) => {
    const c = list.find((x) => x.id === id);
    if (!c || !c.liveVerificationHeldAt) return { list, result: null };
    c.liveVerificationWaitingSince = c.liveVerificationWaitingSince ?? new Date().toISOString();
    return { list, result: c.liveVerificationWaitingSince };
  });
}

/** They opened the page we sent them. Throttled like the other opens. */
export function recordLiveVerificationOpened(
  id: string,
): Promise<{ recorded: boolean; firstOpen: boolean }> {
  type Result = { recorded: boolean; firstOpen: boolean };
  return withWrite<Result>((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: { recorded: false, firstOpen: false } };

    const now = Date.now();
    const last = c.liveVerificationLastOpenedAt ?? c.liveVerificationOpenedAt;
    if (last && now - new Date(last).getTime() < REOPEN_THROTTLE_MS) {
      return { list, result: { recorded: false, firstOpen: false } };
    }

    // Reported separately from "recorded" because they answer different
    // questions. Every un-throttled open is worth counting; only the first is
    // worth telling somebody about, or a candidate who looks at the page four
    // times over a weekend becomes four messages.
    const firstOpen = !c.liveVerificationOpenedAt;
    const iso = new Date(now).toISOString();
    if (firstOpen) c.liveVerificationOpenedAt = iso;
    c.liveVerificationLastOpenedAt = iso;
    c.liveVerificationOpenCount = (c.liveVerificationOpenCount ?? 0) + 1;
    return { list, result: { recorded: true, firstOpen } };
  });
}

/**
 * They pressed through to the provider.
 *
 * Only the first time. This answers "did they ever get as far as starting",
 * and a later attempt does not make that less true.
 */
export function recordLiveVerificationStarted(id: string): Promise<boolean> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c || c.liveVerificationStartedAt) return { list, result: false };
    c.liveVerificationStartedAt = new Date().toISOString();
    return { list, result: true };
  });
}

/**
 * Log a request for a candidate's company details, with its date.
 *
 * Every one is kept, for the same reason the identity reminders are: "asked
 * twice" is a number, and the dates are what tell you whether a third is fair.
 */
export function recordCompanyRequest(id: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    const now = new Date().toISOString();
    c.companyRequests = [...(c.companyRequests ?? []), now];
    c.companyRequestedAt = now;
    c.companyRequestCount = c.companyRequests.length;
    return { list, result: c };
  });
}

/** They opened the page. Throttled like every other open. */
export function recordCompanyOpened(id: string): Promise<boolean> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: false };

    const now = Date.now();
    const last = c.companyLastOpenedAt ?? c.companyOpenedAt;
    if (last && now - new Date(last).getTime() < REOPEN_THROTTLE_MS) {
      return { list, result: false };
    }
    const iso = new Date(now).toISOString();
    if (!c.companyOpenedAt) c.companyOpenedAt = iso;
    c.companyLastOpenedAt = iso;
    c.companyOpenCount = (c.companyOpenCount ?? 0) + 1;
    return { list, result: true };
  });
}

/**
 * Store what the candidate confirmed about their company.
 *
 * Overwrites the previous answer rather than keeping versions: unlike a
 * document, this is a statement of what is true now, and the acceptance form's
 * original claim is still on the record beside it to compare against.
 */
export function saveCompanyDetails(
  id: string,
  details: CompanyDetails,
): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.companyDetails = details;
    c.companyDetailsAt = new Date().toISOString();
    return { list, result: c };
  });
}

/**
 * Log a reminder sent about an outstanding voice recording.
 *
 * Kept apart from the assessment reminder counters rather than reusing them.
 * They chase different things weeks apart, and a single count would tell a
 * recruiter "chased 3 times" without saying about what — which is the one
 * thing they need to know before sending a fourth.
 */
export function recordVoiceReminder(id: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.voiceReminderSentAt = new Date().toISOString();
    c.voiceReminderCount = (c.voiceReminderCount ?? 0) + 1;
    return { list, result: c };
  });
}

/**
 * Log a reminder chasing an answer to an offer, and set its deadline.
 *
 * The deadline moves with the reminder rather than being fixed to the offer:
 * a second chase is a fresh 48 hours, because the alternative is telling
 * somebody the time ran out before we asked them the second time.
 */
export function recordOfferReminder(id: string, sentAt?: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    // The caller's timestamp when it has one: the deadline stored here has to
    // be the same moment the email named, and recomputing it after the send
    // would drift by however long the send took.
    const now = sentAt ?? new Date().toISOString();
    c.offerReminders = [...(c.offerReminders ?? []), now];
    c.offerReminderSentAt = now;
    c.offerReminderCount = c.offerReminders.length;
    c.offerReplyDeadline = deadlineFrom(now);
    return { list, result: c };
  });
}

/**
 * Log the email telling somebody their recording arrived.
 *
 * Moves them to "Under Review" at the same time, because that is exactly what
 * was just said to them — and a status that disagrees with the last thing the
 * candidate was told is how two people in the same panel reach different
 * answers about where somebody is.
 *
 * Only ever forwards. A candidate already further along is left where they
 * are; nothing here should be able to walk somebody backwards.
 */
export function recordVoiceAck(id: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    const now = new Date().toISOString();
    c.voiceAcks = [...(c.voiceAcks ?? []), now];
    c.voiceAckSentAt = now;
    c.voiceAckCount = c.voiceAcks.length;
    if (BEFORE_REVIEW.includes(c.status)) c.status = "Under Review";
    return { list, result: c };
  });
}

/**
 * The "your information is verified" email went out. Moves them on exactly as
 * the email says: Under Review, the voice step skipped for the final video
 * interview (no more voice reminders; an offer may follow), and onto Waiting.
 */
export function recordVerifiedAck(id: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    const now = new Date().toISOString();
    c.verifiedAcks = [...(c.verifiedAcks ?? []), now];
    c.verifiedAckSentAt = now;
    c.voiceStatus = VOICE_SKIPPED;
    if (BEFORE_REVIEW.includes(c.status)) c.status = "Under Review";
    return { list, result: c };
  });
}

/** Log a reminder sent about an unfinished assessment. */
export function recordReminder(id: string, channel: "email" | "whatsapp"): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    const now = new Date().toISOString();
    if (channel === "email") {
      c.reminderEmailSentAt = now;
      c.reminderEmailCount = (c.reminderEmailCount ?? 0) + 1;
    } else {
      c.reminderWhatsAppSentAt = now;
      c.reminderWhatsAppCount = (c.reminderWhatsAppCount ?? 0) + 1;
    }
    return { list, result: c };
  });
}

/** Save recruiter notes against a candidate. */
export function setNotes(id: string, notes: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.notes = notes.slice(0, 5000);
    c.notesUpdatedAt = new Date().toISOString();
    return { list, result: c };
  });
}

/**
 * Permanently remove a candidate.
 *
 * There is no undo and no soft-delete: the record holds personal data, and a
 * deletion request under GDPR means the data goes, not that it is hidden.
 */
/**
 * Remove a candidate, returning the record that was removed.
 *
 * The record rather than a boolean, because their documents have to be deleted
 * from R2 as well and the keys only exist here. Storage is cleaned up by the
 * caller: this module owns the file, not the network.
 */
export function deleteCandidate(id: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const i = list.findIndex((x) => x.id === id);
    if (i === -1) return { list, result: null };
    const [removed] = list.splice(i, 1);
    return { list, result: removed };
  });
}

/**
 * Record an uploaded document.
 *
 * Two behaviours, deliberately different.
 *
 * An identity photograph or a voice recording never displaces its
 * predecessor. When a recruiter sends someone back for a clearer picture, what
 * they sent the first time is the only record of what was actually submitted —
 * and the interesting question is often whether the second attempt is the same
 * document photographed better or a different document entirely, which cannot
 * be asked at all once the first one is gone. The same holds for a re-recorded
 * assessment. The old record is marked superseded and kept; it leaves when a
 * recruiter deletes it by hand.
 *
 * Everything else — a CV, a cover letter, a certificate — is replaced. There
 * is no evidential question about a CV, and the key of the file it replaced is
 * returned so the caller can delete the orphan: otherwise the old object sits
 * in the bucket forever, paid for and unreachable.
 */
export function addDocument(
  id: string,
  doc: CandidateDocument,
): Promise<{ ok: boolean; replacedKey?: string }> {
  type Result = { ok: boolean; replacedKey?: string };
  return withWrite<Result>((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: { ok: false } };
    const docs = c.documents ?? [];

    if (keepsHistory(doc.kind)) {
      const now = new Date().toISOString();
      c.documents = [
        ...docs.map((d) =>
          d.kind === doc.kind && !d.supersededAt ? { ...d, supersededAt: now } : d,
        ),
        doc,
      ];
      // Nothing to delete: the point is that it stays.
      return { list, result: { ok: true } };
    }

    const previous = docs.find((d) => d.kind === doc.kind);
    c.documents = [...docs.filter((d) => d.kind !== doc.kind), doc];
    return { list, result: { ok: true, replacedKey: previous?.key } };
  });
}

/**
 * One stored document, or null. Used by the admin download route.
 *
 * The current one, not the first one in the list. Identity photographs keep
 * their predecessors, so "the identity document" and "a document whose kind is
 * identity" stopped meaning the same thing — and answering with the wrong one
 * would put a replaced photograph in front of whoever is reviewing it.
 *
 * Pass `key` to reach a specific version. It is matched against this
 * candidate's own documents, so it selects among their files and can never
 * name anybody else's.
 */
export async function getDocument(
  id: string,
  kind: DocumentKind,
  key?: string,
): Promise<CandidateDocument | null> {
  const c = await getCandidate(id);
  if (key) {
    return (c?.documents ?? []).find((d) => d.kind === kind && d.key === key) ?? null;
  }
  return currentDocument(c?.documents, kind);
}

/**
 * Another candidate who uploaded a byte-identical file.
 *
 * The same person applying again under a new email and a new number still
 * photographs the same passport, so an identical hash on an identity image is
 * the same person with near-certainty. Returned rather than acted on: two
 * siblings sharing a household is not the same as one person applying twice,
 * and only a human can tell those apart.
 */
export async function findDocumentTwin(
  id: string,
  sha256: string,
): Promise<{ id: string; name: string; kind: DocumentKind } | null> {
  if (!sha256) return null;
  const list = await readAll();
  for (const c of list) {
    if (c.id === id) continue;
    const hit = (c.documents ?? []).find((d) => d.sha256 === sha256 && d.status !== "blocked");
    if (hit) return { id: c.id, name: c.fullName || "Unknown", kind: hit.kind };
  }
  return null;
}

/** Record the candidate's explicit consent to identity processing. */
export function recordVerificationConsent(id: string): Promise<boolean> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: false };
    if (!c.verificationConsentAt) c.verificationConsentAt = new Date().toISOString();
    return { list, result: true };
  });
}

/** A recruiter's decision on the images. */
export function setVerificationDecision(
  id: string,
  decision: "verified" | "rejected",
  by: string,
  reason?: string,
): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    const now = new Date().toISOString();
    if (decision === "verified") {
      c.verifiedAt = now;
      c.verifiedBy = by;
      delete c.rejectedAt;
      delete c.rejectionReason;
    } else {
      c.rejectedAt = now;
      c.verifiedBy = by;
      c.rejectionReason = reason?.slice(0, 300) || undefined;
      delete c.verifiedAt;
    }
    // A decision is the end of the question, so it closes any outstanding
    // request for new photographs.
    //
    // Without this the two disagree permanently and the request wins: asking
    // again outranks the decision in the derived status — deliberately, so
    // that somebody asked for a clearer picture is not left sitting in the
    // review queue with the pictures that were just refused — so a recruiter
    // who asked, then looked again and decided the originals were fine, saw
    // "Verified" until the page reloaded and "Awaiting upload" ever after.
    //
    // Asking again after a decision still reopens it: requestIdentityReupload
    // clears the decision in the same way, from the other side.
    delete c.identityReuploadRequestedAt;
    delete c.identityReuploadReason;
    return { list, result: c };
  });
}

/**
 * Forget the identity images, keeping the decision.
 *
 * Returns the keys so the caller can remove them from storage. The record
 * stays: "verified on 3 March by wradmin" is the useful part, and the
 * photographs are the part worth not keeping once they have been looked at.
 */
export function clearVerificationImages(id: string): Promise<string[]> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: [] as string[] };
    const removed: string[] = [];
    c.documents = (c.documents ?? []).filter((d) => {
      if (!isVerificationKind(d.kind)) return true;
      if (d.key) removed.push(d.key);
      return false;
    });
    if (removed.length) c.imagesDeletedAt = new Date().toISOString();
    return { list, result: removed };
  });
}

/**
 * Ask a candidate to verify, and record when.
 *
 * Used for three people: someone whose country is not on the list, someone
 * whose country is but who finished their assessment before the check existed,
 * and someone who was rejected and is being given another go. A previous
 * rejection is cleared, because it is what makes their status "rejected" and
 * so stops the upload step ever appearing for them again — asking someone to
 * try again while leaving them barred is not asking at all.
 */
export function requestVerification(id: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.verificationRequestedAt = new Date().toISOString();
    delete c.rejectedAt;
    delete c.rejectionReason;
    return { list, result: c };
  });
}

/**
 * Ask for the identity photographs to be taken again, with a reason.
 *
 * For the candidate who already sent something and whose something is no good:
 * unreadable, the wrong document, an expired card, a back that never arrived.
 * Distinct from requestVerification because that one asks someone who has sent
 * nothing, and the two need opposite things from the record.
 *
 * The existing photographs stay. Deleting them here would be the tidier code
 * and the wrong behaviour: the old picture is the only evidence of what was
 * actually sent, and it has to survive until a replacement arrives — otherwise
 * a candidate who never answers leaves a record showing they sent nothing at
 * all.
 *
 * Any decision is withdrawn. A verified candidate whose passport turns out to
 * be illegible is not verified, and a rejected one being given another go is
 * not barred; leaving either in place would stop the upload step from ever
 * appearing for them again.
 */
export function requestIdentityReupload(
  id: string,
  reason: string,
): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    const now = new Date().toISOString();
    c.identityReuploadRequestedAt = now;
    c.identityReuploadReason = reason.trim().slice(0, 400) || undefined;
    // Also counted as a request, so the panel shows "Awaiting upload" rather
    // than the louder "Not asked yet" — they have been asked, twice now.
    c.verificationRequestedAt = now;
    delete c.verifiedAt;
    delete c.verifiedBy;
    delete c.rejectedAt;
    delete c.rejectionReason;
    return { list, result: c };
  });
}

/** A "received, under review" email went out. Kept with the others it followed. */
export function recordSubmissionAck(id: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    const now = new Date().toISOString();
    c.submissionAcks = [...(c.submissionAcks ?? []), now];
    c.submissionAckSentAt = now;
    c.submissionAckCount = c.submissionAcks.length;
    return { list, result: c };
  });
}

/**
 * Star a candidate, or take the star off.
 *
 * The flag is removed rather than set to false when unstarred, so a record
 * that was never starred and one that was starred and unstarred look the
 * same on disk. There is nothing to learn from the difference and keeping it
 * would mean every candidate eventually carrying a dead `false`.
 */
export function setFavorite(id: string, favorite: boolean): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    if (favorite) {
      c.favorite = true;
      c.favoritedAt = new Date().toISOString();
    } else {
      delete c.favorite;
      delete c.favoritedAt;
    }
    return { list, result: c };
  });
}

/* -------------------------------------------------------------------------- */
/* Proof of residence                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Ask a candidate to prove they live where they say they do.
 *
 * Any previous answer is cleared along with any previous decision: asking is
 * reopening the question, and a stale "verified" or a stale explanation
 * sitting under a fresh request would make the panel contradict itself. The
 * photographs are deliberately left where they are — a recruiter asking again
 * usually wants to compare what arrives against what came before.
 */
export function requestResidenceProof(
  id: string,
  country: string,
  reason: string,
): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    const now = new Date().toISOString();
    const first = !c.residenceRequestedAt;
    c.residenceRequestedAt = first ? now : c.residenceRequestedAt;
    // Always moved forward, so "asked again" is what decides whether an older
    // upload still counts as an answer.
    c.residenceReuploadRequestedAt = first ? undefined : now;
    c.residenceCountry = country.trim().slice(0, 100) || undefined;
    c.residenceReason = reason.trim().slice(0, 400) || undefined;
    if (!first) c.residenceReuploadReason = c.residenceReason;
    delete c.residenceVerifiedAt;
    delete c.residenceVerifiedBy;
    delete c.residenceRejectedAt;
    delete c.residenceRejectionReason;
    delete c.residenceExplanation;
    delete c.residenceExplainedAt;
    return { list, result: c };
  });
}

/** A recruiter's decision on what came back. */
export function setResidenceDecision(
  id: string,
  decision: "verify" | "reject",
  by?: string,
  reason?: string,
): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    const now = new Date().toISOString();
    if (decision === "verify") {
      c.residenceVerifiedAt = now;
      c.residenceVerifiedBy = by;
      delete c.residenceRejectedAt;
      delete c.residenceRejectionReason;
    } else {
      c.residenceRejectedAt = now;
      c.residenceRejectionReason = (reason ?? "").trim().slice(0, 400) || undefined;
      delete c.residenceVerifiedAt;
      delete c.residenceVerifiedBy;
    }
    return { list, result: c };
  });
}

/** Forget the permit photographs, keeping the decision made from them. */
export function clearResidenceImages(id: string): Promise<string[]> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: [] as string[] };
    const removed: string[] = [];
    c.documents = (c.documents ?? []).filter((d) => {
      if (!isResidenceKind(d.kind)) return true;
      if (d.key) removed.push(d.key);
      return false;
    });
    if (removed.length) c.residenceImagesDeletedAt = new Date().toISOString();
    return { list, result: removed };
  });
}

/**
 * A chat link was emailed — for the final interview, or for onboarding. The
 * newest of its kind replaces the one before; the other kind is not touched.
 */
export function recordChatLink(
  id: string,
  sentAt: string,
  kind: "interview" | "onboarding" | "followup" = "interview",
  reason?: string,
): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    if (kind === "onboarding") {
      c.onboardingChatLinks = [...(c.onboardingChatLinks ?? []), sentAt];
      return { list, result: c };
    }
    if (kind === "followup") {
      c.followupChatLinks = [...(c.followupChatLinks ?? []), sentAt];
      if (reason) c.followupReasons = { ...(c.followupReasons ?? {}), [sentAt]: reason };
      return { list, result: c };
    }
    c.chatLinks = [...(c.chatLinks ?? []), sentAt];
    c.chatLinkSentAt = sentAt;
    return { list, result: c };
  });
}

/** Longest "we're live" history kept per candidate. */
const MAX_LIVE_REMINDERS = 50;

/**
 * A "we're live" email is about to go out. Recorded before the send, like a
 * chat link, so a candidate who clicks at once is recognised; undone if the
 * send fails.
 */
export function recordLiveReminder(id: string, reminder: LiveReminder): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.liveReminders = [...(c.liveReminders ?? []), reminder].slice(-MAX_LIVE_REMINDERS);
    return { list, result: c };
  });
}

export function revertLiveReminder(id: string, reminderId: string): Promise<boolean> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c?.liveReminders?.some((r) => r.id === reminderId)) return { list, result: false };
    c.liveReminders = c.liveReminders.filter((r) => r.id !== reminderId);
    return { list, result: true };
  });
}

/**
 * The candidate opened a "we're live" email. Returns the reminder only the
 * first time, and only for the link it was sent with — so a refresh, a second
 * tab, or an old email for a replaced link tells nobody anything.
 */
export function markLiveReminderOpened(
  id: string,
  reminderId: string,
  linkSentAt: string,
): Promise<LiveReminder | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    const r = c?.liveReminders?.find((x) => x.id === reminderId);
    if (!r || r.openedAt || r.linkSentAt !== linkSentAt) return { list, result: null };
    r.openedAt = new Date().toISOString();
    return { list, result: { ...r } };
  });
}

/**
 * A PAN re-upload request is about to be emailed. Recorded first — the link
 * is checked against it, and a candidate who clicks at once must find it —
 * and undone with revertPanReupload if the email does not go.
 */
export function recordPanReupload(id: string, request: PanReuploadRequest): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.panReuploadRequests = [...(c.panReuploadRequests ?? []), request];
    c.panReuploadRequestedAt = request.at;
    c.panReuploadReason = request.reason;
    return { list, result: c };
  });
}

export function revertPanReupload(id: string, at: string): Promise<boolean> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c || c.panReuploadRequestedAt !== at) return { list, result: false };
    c.panReuploadRequests = (c.panReuploadRequests ?? []).filter((r) => r.at !== at);
    const prev = c.panReuploadRequests.at(-1);
    c.panReuploadRequestedAt = prev?.at;
    c.panReuploadReason = prev?.reason;
    return { list, result: true };
  });
}

/**
 * New PAN photos arrived for the request sent at `requestedAt`. Only for that
 * request, and only once both sides are on file since it — checked inside the
 * write, so two quick presses cannot both count. A GSTIN is added only when
 * there is none on record.
 */
export function completePanReupload(
  id: string,
  requestedAt: string,
  gstin?: string,
): Promise<{ ok: true; candidate: Candidate; first: boolean } | { ok: false; reason: "not_found" | "replaced" | "incomplete" }> {
  type R = { ok: true; candidate: Candidate; first: boolean } | { ok: false; reason: "not_found" | "replaced" | "incomplete" };
  return withWrite<R>((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: { ok: false, reason: "not_found" } };
    if (c.panReuploadRequestedAt !== requestedAt) return { list, result: { ok: false, reason: "replaced" } };
    if (!panSentSince(c.documents, requestedAt)) return { list, result: { ok: false, reason: "incomplete" } };
    const first = !(c.panReuploadedAt && c.panReuploadedAt > requestedAt);
    if (first) c.panReuploadedAt = new Date().toISOString();
    if (gstin && !c.gstin) {
      c.gstin = gstin;
      c.gstinAddedAt = new Date().toISOString();
      c.gstinAddedVia = "pan-reupload";
    }
    return { list, result: { ok: true, candidate: c, first } };
  });
}

/**
 * A proof-of-address email went out. Written once the email is away — the
 * link in it never retires, so there is nothing to check it against before.
 * A request or a new-document request opens the step again; a reminder only
 * adds to the list.
 */
export function recordAddressProofEmail(id: string, event: AddressProofEvent): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.addressProofEvents = [...(c.addressProofEvents ?? []), event];
    if (event.kind === "request" || event.kind === "reask") {
      c.addressProofRequestedAt = event.at;
      if (event.kind === "reask" && event.reason) c.addressProofReason = event.reason;
      else delete c.addressProofReason;
      // A new document is wanted, so the old approval no longer describes it.
      delete c.addressProofApprovedAt;
      delete c.addressProofApprovedBy;
    }
    return { list, result: c };
  });
}

/**
 * The candidate sent their proof of address. Only once a PDF has arrived since
 * the newest request — checked inside the write, so two quick presses cannot
 * both count. A second press for the same request is answered ok and records
 * nothing.
 */
export function completeAddressProof(
  id: string,
  input: { type: AddressDocType; address: string; onFile: string },
): Promise<
  | { ok: true; candidate: Candidate; first: boolean }
  | { ok: false; reason: "not_found" | "not_asked" | "no_document" }
> {
  type R =
    | { ok: true; candidate: Candidate; first: boolean }
    | { ok: false; reason: "not_found" | "not_asked" | "no_document" };
  return withWrite<R>((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: { ok: false, reason: "not_found" } };
    const asked = c.addressProofRequestedAt;
    if (!asked) return { list, result: { ok: false, reason: "not_asked" } };
    if (c.addressProofSubmittedAt && c.addressProofSubmittedAt >= asked) {
      return { list, result: { ok: true, candidate: c, first: false } };
    }
    const doc = currentDocument(c.documents, "addressProof");
    if (!doc || doc.status === "blocked" || !doc.key || doc.uploadedAt <= asked) {
      return { list, result: { ok: false, reason: "no_document" } };
    }
    const at = new Date().toISOString();
    c.addressProofSubmissions = [
      ...(c.addressProofSubmissions ?? []),
      { at, type: input.type, address: input.address, onFile: input.onFile, key: doc.key },
    ];
    c.addressProofSubmittedAt = at;
    return { list, result: { ok: true, candidate: c, first: true } };
  });
}

/** Approve the proof of address on file, or take the approval back (null). */
export function setAddressProofApproved(id: string, by: string | null): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    if (by === null) {
      delete c.addressProofApprovedAt;
      delete c.addressProofApprovedBy;
    } else {
      c.addressProofApprovedAt = new Date().toISOString();
      c.addressProofApprovedBy = by;
    }
    return { list, result: c };
  });
}

/**
 * An agreement email went out. Written once the email is away. Sending (or
 * asking for a new signed copy) opens the step again; a reminder only adds to
 * the list.
 */
export function recordAgreementEmail(id: string, event: AgreementEvent): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.agreementEvents = [...(c.agreementEvents ?? []), event];
    if (event.kind === "sent" || event.kind === "updated" || event.kind === "reask") {
      c.agreementSentAt = event.at;
      if (event.kind === "sent" || event.kind === "updated") {
        if (event.ref) c.agreementRef = event.ref;
        if (event.key) c.agreementKey = event.key;
        else delete c.agreementKey;
      }
      // The new version carries the new start date; the offer stays as sent.
      if (event.kind === "updated" && event.toDate) c.agreementStartDate = event.toDate;
      if (event.kind === "reask" && event.reason) c.agreementReason = event.reason;
      else delete c.agreementReason;
      // A new signed copy is wanted, so the old acceptance no longer describes it.
      delete c.agreementApprovedAt;
      delete c.agreementApprovedBy;
    }
    return { list, result: c };
  });
}

/**
 * The signed agreement came back. From the candidate's page: every clean
 * signed file uploaded since the newest send, checked inside the write so two
 * quick presses cannot both count. From a recruiter: the keys they uploaded.
 * A second press for the same send is answered ok and records nothing.
 */
export function completeAgreement(
  id: string,
  input: { via: "upload" } | { via: "admin"; by: string; keys: string[] },
): Promise<
  | { ok: true; candidate: Candidate; first: boolean }
  | { ok: false; reason: "not_found" | "not_sent" | "no_document" }
> {
  type R =
    | { ok: true; candidate: Candidate; first: boolean }
    | { ok: false; reason: "not_found" | "not_sent" | "no_document" };
  return withWrite<R>((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: { ok: false, reason: "not_found" } };
    const sent = c.agreementSentAt;
    if (!sent) return { list, result: { ok: false, reason: "not_sent" } };
    if (input.via === "upload" && c.agreementSignedAt && c.agreementSignedAt >= sent) {
      return { list, result: { ok: true, candidate: c, first: false } };
    }
    const keys =
      input.via === "admin"
        ? input.keys
        : (c.documents ?? [])
            .filter((d) => d.kind === "signedAgreement" && d.status !== "blocked" && d.key && d.uploadedAt > sent)
            .map((d) => d.key!);
    if (!keys.length) return { list, result: { ok: false, reason: "no_document" } };
    const at = new Date().toISOString();
    c.agreementSubmissions = [
      ...(c.agreementSubmissions ?? []),
      { at, keys, via: input.via, ...(input.via === "admin" ? { by: input.by } : {}) },
    ];
    c.agreementSignedAt = at;
    delete c.agreementReason;
    return { list, result: { ok: true, candidate: c, first: true } };
  });
}

/** The agreement's start date, set in the Agreement tab (null clears it). */
export function setAgreementStartDate(id: string, date: string | null): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    if (date) c.agreementStartDate = date;
    else delete c.agreementStartDate;
    return { list, result: c };
  });
}

/**
 * Work hours and days chosen by a recruiter — for somebody who accepted
 * without choosing them — so the agreement can be drawn up. Already checked.
 */
export function setAvailabilityByRecruiter(id: string, availability: Availability, by: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.availability = availability;
    c.availabilitySetBy = by;
    c.availabilitySetAt = new Date().toISOString();
    return { list, result: c };
  });
}

/** Accept the signed agreement on file, or take the acceptance back (null). */
export function setAgreementApproved(id: string, by: string | null): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    if (by === null) {
      delete c.agreementApprovedAt;
      delete c.agreementApprovedBy;
    } else {
      c.agreementApprovedAt = new Date().toISOString();
      c.agreementApprovedBy = by;
    }
    return { list, result: c };
  });
}

/** A "GSTIN needed" email went out. */
export function recordGstinRequest(id: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.gstinRequests = [...(c.gstinRequests ?? []), new Date().toISOString()];
    return { list, result: c };
  });
}

/** A "your place is waiting for your GSTIN" email went out. */
export function recordGstinWaiting(id: string, by?: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.gstinWaitingEmails = [...(c.gstinWaitingEmails ?? []), { at: new Date().toISOString(), ...(by ? { by } : {}) }];
    return { list, result: c };
  });
}

/** A recruiter added (or corrected) the GSTIN — already checked by the caller. */
export function setGstinByRecruiter(id: string, gstin: string, by?: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.gstin = gstin;
    c.gstinAddedAt = new Date().toISOString();
    c.gstinAddedBy = by;
    delete c.gstinAddedVia;
    return { list, result: c };
  });
}

/**
 * Undo a chat link whose email never left, so the previous link keeps working.
 * Only when it is still the newest — a later send is not touched.
 */
export function revertChatLink(
  id: string,
  sentAt: string,
  kind: "interview" | "onboarding" | "followup" = "interview",
): Promise<boolean> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (kind === "followup") {
      if (!c || c.followupChatLinks?.at(-1) !== sentAt) return { list, result: false };
      c.followupChatLinks = (c.followupChatLinks ?? []).slice(0, -1);
      if (c.followupReasons?.[sentAt]) {
        const { [sentAt]: _gone, ...rest } = c.followupReasons;
        void _gone;
        c.followupReasons = rest;
      }
      return { list, result: true };
    }
    if (kind === "onboarding") {
      if (!c || c.onboardingChatLinks?.at(-1) !== sentAt) return { list, result: false };
      c.onboardingChatLinks = (c.onboardingChatLinks ?? []).slice(0, -1);
      return { list, result: true };
    }
    if (!c || c.chatLinkSentAt !== sentAt) return { list, result: false };
    c.chatLinks = (c.chatLinks ?? []).filter((t) => t !== sentAt);
    c.chatLinkSentAt = c.chatLinks[c.chatLinks.length - 1];
    return { list, result: true };
  });
}

/**
 * Forget a candidate's PAN card: both sides, every version. Returns the storage
 * keys to delete. Their answer is kept, so the record still says they had one.
 */
export function clearPanDocuments(id: string): Promise<string[]> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: [] as string[] };
    const removed: string[] = [];
    let any = false;
    c.documents = (c.documents ?? []).filter((d) => {
      if (!isPanDocumentKind(d.kind)) return true;
      any = true;
      if (d.key) removed.push(d.key);
      return false;
    });
    if (any) c.panDeletedAt = new Date().toISOString();
    return { list, result: removed };
  });
}

/**
 * Record which of the three documents a candidate chose.
 *
 * Written when they submit, alongside consent, rather than when they pick:
 * someone flicking between the options while deciding is not information, and
 * a value stored on every click would leave "driver's licence" against a
 * record holding a passport photograph.
 */
export function setIdentityDocumentType(
  id: string,
  type: IdDocumentType,
): Promise<boolean> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: false };
    c.identityDocumentType = type;

    // Someone who sent an ID card and is now sending a passport has a "back of
    // card" on file that belongs to the submission they are replacing. Nothing
    // supersedes it, because no new back is coming — so it would sit in the
    // current set as though it were part of what they just sent. Retire it
    // here, where the change of type is known.
    if (!needsBack(type)) {
      const now = new Date().toISOString();
      c.documents = (c.documents ?? []).map((d) =>
        d.kind === "identityBack" && !d.supersededAt ? { ...d, supersededAt: now } : d,
      );
    }
    return { list, result: true };
  });
}

/**
 * Record an offer as sent, with the exact terms.
 *
 * The status moves to "Offer Sent" here rather than being left to the
 * recruiter: an offer is out in the world, and a record still reading "Under
 * review" would be wrong the moment the email leaves.
 */
export function recordOffer(id: string, offer: Offer, sentAt?: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.offer = offer;
    // The caller may supply the timestamp because the acceptance link in the
    // email is signed against it, and that email is built before this write
    // happens — the offer is still only recorded once the mail has actually
    // left, but both sides have to agree on which moment this offer is.
    c.offerSentAt = sentAt ?? new Date().toISOString();
    // A re-sent offer supersedes the previous answer; the terms just changed.
    delete c.offerAcceptedAt;
    delete c.offerDeclinedAt;
    delete c.offerDeclineReason;
    c.status = "Offer Sent";
    return { list, result: c };
  });
}

/** What the candidate said. Accepting moves them to Hired. */
export function setOfferOutcome(
  id: string,
  outcome: "accepted" | "declined",
  reason?: string,
): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c || !c.offerSentAt) return { list, result: null };
    const now = new Date().toISOString();
    if (outcome === "accepted") {
      c.offerAcceptedAt = now;
      delete c.offerDeclinedAt;
      delete c.offerDeclineReason;
      c.status = "Hired";
    } else {
      c.offerDeclinedAt = now;
      c.offerDeclineReason = reason?.slice(0, 300) || undefined;
      delete c.offerAcceptedAt;
      c.status = "Rejected";
    }
    return { list, result: c };
  });
}

/**
 * Why a candidate's own answer to an offer could not be recorded.
 *
 * "superseded" is the one worth having: a revised offer changes offerSentAt,
 * and an older email still sitting in an inbox must not be able to accept the
 * terms it was sent with.
 */
export type OfferAnswerResult =
  | { ok: true; candidate: Candidate }
  | { ok: false; reason: "not_found" | "no_offer" | "superseded" | "already_answered" };

/**
 * The candidate's own answer, from the link in their offer email.
 *
 * Separate from setOfferOutcome, which is the recruiter recording what they
 * were told on a call. This one has to defend itself: every precondition is
 * re-checked inside the same serialized write that acts on it, so two taps on
 * a slow phone connection cannot both succeed, and a link cannot be redeemed
 * against an offer that has since been replaced.
 *
 * Details and acceptance are written together or not at all. Half of this —
 * a candidate marked Hired with no confirmed details, or details stored
 * against an offer nobody accepted — would be worse than neither.
 */
export function acceptOfferWithDetails(
  id: string,
  offerSentAt: string,
  details: ConfirmedDetails,
  availability?: Availability,
  /**
   * The US Social Security Number, when one was asked for and given.
   *
   * Passed separately rather than folded into `details`, because those go into
   * the candidate view and this must not. Written in the same serialized write
   * as the acceptance, so there is never an accepted offer whose SSN landed a
   * moment later or not at all.
   */
  ssn?: string,
  /** India only: whether they have a PAN card. Absent when not asked. */
  pan?: PanAnswer,
  /** India only, optional: a GSTIN that has already passed the check. */
  gstin?: string,
): Promise<OfferAnswerResult> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: { ok: false, reason: "not_found" } as OfferAnswerResult };
    if (!c.offerSentAt) return { list, result: { ok: false, reason: "no_offer" } as OfferAnswerResult };
    if (c.offerSentAt !== offerSentAt) {
      return { list, result: { ok: false, reason: "superseded" } as OfferAnswerResult };
    }
    if (c.offerAcceptedAt || c.offerDeclinedAt) {
      return { list, result: { ok: false, reason: "already_answered" } as OfferAnswerResult };
    }

    const now = new Date().toISOString();
    c.confirmedDetails = details;
    c.confirmedDetailsAt = now;
    if (availability) c.availability = availability;
    // Only ever set, never cleared: a second acceptance cannot happen, and an
    // empty value arriving here should not wipe a number already on file.
    if (ssn) c.ssn = ssn;
    if (pan) {
      c.panAnswer = pan;
      c.panAnsweredAt = now;
    }
    if (gstin) c.gstin = gstin;
    // They accepted what the page showed them, which is the capped figure —
    // so that is what the record says they accepted. The original survives on
    // the offer as hoursCappedFrom, because their email still quotes it.
    if (c.offer) c.offer = effectiveOffer(c.offer);
    c.offerAcceptedAt = now;
    c.status = "Hired";
    return { list, result: { ok: true, candidate: c } as OfferAnswerResult };
  });
}

/** The candidate declining from their own link, with an optional reason. */
export function declineOfferByCandidate(
  id: string,
  offerSentAt: string,
  reason?: string,
): Promise<OfferAnswerResult> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: { ok: false, reason: "not_found" } as OfferAnswerResult };
    if (!c.offerSentAt) return { list, result: { ok: false, reason: "no_offer" } as OfferAnswerResult };
    if (c.offerSentAt !== offerSentAt) {
      return { list, result: { ok: false, reason: "superseded" } as OfferAnswerResult };
    }
    if (c.offerAcceptedAt || c.offerDeclinedAt) {
      return { list, result: { ok: false, reason: "already_answered" } as OfferAnswerResult };
    }

    c.offerDeclinedAt = new Date().toISOString();
    c.offerDeclineReason = reason?.trim().slice(0, 300) || undefined;
    c.status = "Rejected";
    return { list, result: { ok: true, candidate: c } as OfferAnswerResult };
  });
}

/**
 * Record where the application came from, as the server observed it.
 *
 * Written on both step one and final submit: the second call catches anyone
 * who changed their stated country in between, and re-detection is cheap.
 * Silently does nothing for an unknown id — detection runs alongside a
 * best-effort upsert that may not have landed.
 */
export function setDetectedCountry(id: string, iso2: string, name: string): Promise<boolean> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: false };
    c.detectedCountryIso = iso2;
    c.detectedCountryName = name;
    c.detectedCountryAt = new Date().toISOString();
    return { list, result: true };
  });
}

/**
 * Store the outcome of a Companies House lookup.
 *
 * Overwrites any previous one: this is a snapshot of the register at a moment,
 * not a history, and keeping stale snapshots beside a fresh one only invites
 * reading the wrong one.
 */
export function recordCompanyCheck(id: string, check: CompanyCheck): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.companyCheck = check;
    return { list, result: c };
  });
}

/** Every R2 key a candidate owns, for cleanup. */
export function documentKeys(c: Candidate | null): string[] {
  return (c?.documents ?? []).map((d) => d.key).filter((k): k is string => !!k);
}

/** Mark an application as a possible duplicate of an earlier one. */
export function flagDuplicate(id: string, ofId: string, ofName: string): Promise<void> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (c) {
      c.duplicateFlag = true;
      c.duplicateOfId = ofId;
      c.duplicateOfName = ofName;
    }
    return { list, result: undefined };
  });
}

interface PersonalInput {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  linkedin: string;
}

/** Create or update a candidate from the Personal Information step. */
export function upsertPersonal(input: PersonalInput): Promise<Candidate> {
  return withWrite((list) => {
    const now = new Date().toISOString();
    const fullName = `${input.firstName} ${input.lastName}`.trim();
    const existing = list.find((c) => c.id === input.id);
    if (existing) {
      Object.assign(existing, {
        firstName: input.firstName,
        lastName: input.lastName,
        fullName,
        dob: input.dob,
        email: input.email,
        phone: input.phone,
        country: input.country,
        city: input.city,
        address: input.address,
        linkedin: input.linkedin,
      });
      return { list, result: existing };
    }
    const candidate: Candidate = {
      id: input.id,
      firstName: input.firstName,
      lastName: input.lastName,
      fullName,
      dob: input.dob,
      email: input.email,
      phone: input.phone,
      country: input.country,
      city: input.city,
      address: input.address,
      linkedin: input.linkedin,
      languages: [],
      position: "",
      application: {},
      status: "New Application",
      createdAt: now,
    };
    list.push(candidate);
    return { list, result: candidate };
  });
}

/** Save the full application on final submit. */
export function saveApplication(id: string, application: Record<string, unknown>): Promise<Candidate> {
  return withWrite((list) => {
    const now = new Date().toISOString();
    let c = list.find((x) => x.id === id);
    if (!c) {
      c = {
        id,
        firstName: str(application.firstName),
        lastName: str(application.lastName),
        fullName: `${str(application.firstName)} ${str(application.lastName)}`.trim(),
        dob: str(application.dob),
        email: str(application.email),
        phone: str(application.phone),
        country: str(application.country),
        city: str(application.city),
        address: str(application.address),
        linkedin: str(application.linkedin),
        languages: [],
        position: "",
        application: {},
        status: "New Application",
        createdAt: now,
      };
      list.push(c);
    }
    c.fullName = `${str(application.firstName)} ${str(application.lastName)}`.trim() || c.fullName;
    c.firstName = str(application.firstName) || c.firstName;
    c.lastName = str(application.lastName) || c.lastName;
    c.dob = str(application.dob) || c.dob;
    c.email = str(application.email) || c.email;
    c.phone = str(application.phone) || c.phone;
    c.country = str(application.country) || c.country;
    c.city = str(application.city) || c.city;
    c.address = str(application.address) || c.address;
    c.linkedin = str(application.linkedin) || c.linkedin;
    c.position = str(application.position) || c.position;
    if (Array.isArray(application.languages)) c.languages = application.languages as LanguageRow[];
    c.application = application;
    c.submittedAt = now;
    return { list, result: c };
  });
}

/** Record interview answers + score when the candidate completes the interview. */
export function recordInterview(
  id: string,
  result: { score: number; total: number; answers: Record<string, string> },
): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.interview = {
      completedAt: new Date().toISOString(),
      score: result.score,
      total: result.total,
      answers: result.answers,
    };
    c.status = "Interview Completed";
    return { list, result: c };
  });
}

export function setStatus(id: string, status: CandidateStatus, by?: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.status = status;
    // The date belongs to the status: set when it becomes Full verified, gone
    // when it stops being — so a green row always means it is true now.
    if (status === "Full verified") {
      if (!c.fullyVerifiedAt) {
        c.fullyVerifiedAt = new Date().toISOString();
        c.fullyVerifiedBy = by;
      }
    } else {
      delete c.fullyVerifiedAt;
      delete c.fullyVerifiedBy;
    }
    return { list, result: c };
  });
}

export function recordInvitation(id: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.invitationSentAt = new Date().toISOString();
    if (c.status === "New Application") c.status = "Interview Invitation Sent";
    return { list, result: c };
  });
}

/**
 * Claim the right to send the assessment invitation.
 *
 * Returns true only for the first caller; the timestamp is written inside the
 * same serialized write that checks it, so two concurrent submits cannot both
 * be told to send.
 */
export function claimInterviewEmail(id: string): Promise<boolean> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c || c.interviewEmailSentAt) return { list, result: false };
    c.interviewEmailSentAt = new Date().toISOString();
    return { list, result: true };
  });
}

/** Release the claim if the send failed, so a later retry can try again. */
export function releaseInterviewEmail(id: string): Promise<void> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (c) delete c.interviewEmailSentAt;
    return { list, result: undefined };
  });
}

export function recordVoiceRequest(id: string): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.voiceRequestedAt = new Date().toISOString();
    if (!c.voiceStatus || c.voiceStatus === "Voice Assessment Not Requested") {
      c.voiceStatus = "Voice Assessment Requested";
    }
    return { list, result: c };
  });
}

export function setVoiceStatus(id: string, status: VoiceStatus): Promise<Candidate | null> {
  return withWrite((list) => {
    const c = list.find((x) => x.id === id);
    if (!c) return { list, result: null };
    c.voiceStatus = status;
    return { list, result: c };
  });
}
