/**
 * The shape of a candidate as the Admin Panel's client components see them.
 *
 * Separate from the stored `Candidate` because the two differ deliberately:
 * derived values like the verification status and the interview link are
 * computed once on the server, and nothing here reaches for the filesystem.
 * Both the Candidates and Interviews tabs build the same view, so they build it
 * the same way.
 */
import type { Candidate } from "@/lib/store";
import type { CandidateDocument } from "@/lib/documents";
import type { CandidateStatus } from "@/lib/candidateStatus";
import {
  identityStillNeeded,
  identityReuploadPending,
  verificationStatus,
  type VerificationStatus,
} from "@/lib/verification";
import type { IdDocumentType } from "@/lib/identityDocuments";
import { voiceRecordingNeeded } from "@/lib/voice";
import type { Offer } from "@/lib/offer";
// Whether the deadline has *passed* is deliberately not derived here: it turns
// with the clock, and a value computed when the page was rendered would still
// be saying "overdue" about somebody reminded again a minute ago. The tables
// and the panel call replyOverdue themselves.
import { offerAwaitingReply } from "@/lib/offerReminder";
import type { ConfirmedDetails } from "@/lib/hiring";
import { companyDetailsNeeded, type CompanyDetails } from "@/lib/companyDetails";
import type { Availability } from "@/lib/availability";
import { countryRuleApplies } from "@/lib/phoneCountry";
import { hasSsn } from "@/lib/ssn";
import { awaitingDecision } from "@/lib/voiceAck";
import type { CompanyCheck } from "@/lib/companyCheck";
import type { VoiceStatus } from "@/lib/candidateStatus";
import {
  addressProofStatus,
  type AddressProofEvent,
  type AddressProofStatus,
  type AddressProofSubmission,
} from "@/lib/addressProof";
import {
  agreementMissing,
  agreementStatus,
  type AgreementEvent,
  type AgreementStatus,
  type AgreementSubmission,
} from "@/lib/agreement";

export interface CandidateView {
  id: string;
  fullName: string;
  /** Kept alongside fullName so the confirmed-details diff can compare parts. */
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
  phone: string;
  country: string;
  /** Where the application was actually sent from. Never the IP address. */
  detectedCountryName?: string;
  detectedCountryIso?: string;
  detectedCountryAt?: string;
  city: string;
  address: string;
  linkedin: string;
  languages: string[];
  position: string;
  status: CandidateStatus;
  createdAt: string;
  submittedAt?: string;
  invitationSentAt?: string;
  interviewCompleted: boolean;
  score?: number;
  total?: number;
  interviewLink: string;
  notes?: string;
  interviewOpenedAt?: string;
  formCompleted: boolean;
  reminderEmailSentAt?: string;
  reminderEmailCount?: number;
  reminderWhatsAppSentAt?: string;
  reminderWhatsAppCount?: number;
  duplicateFlag?: boolean;
  duplicateOfName?: string;
  interviewEmailSentAt?: string;
  lastOpenedAt?: string;
  openCount?: number;
  lastOpenSource?: string;
  documents?: CandidateDocument[];
  verificationStatus: VerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  imagesDeletedAt?: string;
  verificationConsentAt?: string;
  verificationRequestedAt?: string;
  /** Which of the three documents they sent. Absent for older uploads. */
  identityDocumentType?: IdDocumentType;
  identityReuploadRequestedAt?: string;
  identityReuploadReason?: string;
  /**
   * Proof of residence. The state only.
   *
   * Not the photographs, which are fetched through the documents route like
   * every other image — and deliberately not the candidate's written
   * explanation either. That paragraph can name somebody's immigration
   * status, and this view is built for every row of a table: carrying it here
   * would send forty people's explanations to a browser that renders none of
   * them. The panel fetches the one it is showing, the same way the SSN
   * field does.
   *
   * `residenceExplainedAt` stays, because the status is derived from whether
   * they answered, not from what they wrote.
   */
  /**
   * Starred by a recruiter. A boolean, so it costs nothing to carry on every
   * row — and it has to be on every row, because the Favorites tab is built
   * by filtering the same list everything else is.
   */
  favorite?: boolean;
  favoritedAt?: string;
  residenceRequestedAt?: string;
  residenceCountry?: string;
  residenceReason?: string;
  residenceExplainedAt?: string;
  residenceVerifiedAt?: string;
  residenceRejectedAt?: string;
  residenceRejectionReason?: string;
  residenceReuploadRequestedAt?: string;
  residenceReuploadReason?: string;
  residenceImagesDeletedAt?: string;
  /** India only — whether they said they have a PAN card. See lib/pan. */
  panAnswer?: "yes" | "no";
  /** India only, optional. */
  gstin?: string;
  gstinAddedAt?: string;
  gstinAddedBy?: string;
  gstinAddedVia?: "pan-reupload";
  gstinRequests?: string[];
  gstinWaitingEmails?: { at: string; by?: string }[];
  panReuploadRequestedAt?: string;
  panReuploadReason?: string;
  panReuploadRequests?: { at: string; by?: string; reason: string }[];
  panReuploadedAt?: string;
  panAnsweredAt?: string;
  panDeletedAt?: string;
  /** Proof of address — see lib/addressProof. */
  addressProofRequestedAt?: string;
  addressProofReason?: string;
  addressProofEvents?: AddressProofEvent[];
  addressProofSubmittedAt?: string;
  addressProofSubmissions?: AddressProofSubmission[];
  addressProofApprovedAt?: string;
  addressProofApprovedBy?: string;
  /** Derived, so the table, the filter and the panel cannot disagree. */
  addressProofStatus: AddressProofStatus;
  /** The final agreement — see lib/agreement. */
  agreementStartDate?: string;
  agreementSentAt?: string;
  agreementRef?: string;
  agreementReason?: string;
  agreementEvents?: AgreementEvent[];
  agreementSignedAt?: string;
  agreementSubmissions?: AgreementSubmission[];
  agreementApprovedAt?: string;
  agreementApprovedBy?: string;
  /** Worked out on the server. */
  agreementStatus: AgreementStatus;
  /** Why an agreement cannot be drawn up yet; empty when it can. */
  agreementMissing: string[];
  /** The live identity check: what was sent, and how far they got with it. */
  liveVerificationUrl?: string;
  liveVerificationSentAt?: string;
  liveVerificationCount?: number;
  liveVerificationOpenedAt?: string;
  liveVerificationLastOpenedAt?: string;
  liveVerificationOpenCount?: number;
  liveVerificationStartedAt?: string;
  /** A provider session swapped behind a link already in their inbox. */
  liveVerificationLinkChangedAt?: string;
  liveVerificationLinkChangeCount?: number;
  /** Set while their session is dead and they are held on a waiting page. */
  liveVerificationHeldAt?: string;
  liveVerificationWaitingSince?: string;
  liveVerificationReason?: string;
  liveVerificationPassedAt?: string;
  liveVerificationPassedNote?: string;
  /**
   * Derived, not stored: a request for new photographs that has not been
   * answered yet. Computed here so the tables and the panel cannot disagree
   * about whether someone still owes us a photograph.
   */
  identityReuploadPending: boolean;
  voiceStatus?: VoiceStatus;
  /** Whether they have opened the voice-recording page, and how often. */
  voiceOpenedAt?: string;
  voiceOpenCount?: number;
  voiceReminderSentAt?: string;
  voiceReminderCount?: number;
  /** When we told them the recording arrived and a decision was coming. */
  voiceAckSentAt?: string;
  voiceAckCount?: number;
  voiceAcks?: string[];
  verifiedAckSentAt?: string;
  verifiedAcks?: string[];
  /**
   * Derived: told, and still waiting on us. The Waiting tab, in one field.
   */
  awaitingDecision: boolean;
  /**
   * Derived: a recording has been asked for and none newer has arrived.
   * Computed here so the table, the panel and the reminder button cannot
   * disagree about whether anyone is still waiting.
   */
  voiceNeeded: boolean;
  identityReminderSentAt?: string;
  /** Final-interview chat links sent. The conversation is fetched on demand. */
  chatLinkSentAt?: string;
  chatLinks?: string[];
  onboardingChatLinks?: string[];
  followupChatLinks?: string[];
  /** Where the latest follow-up chat stands (from the chat files, filled in by the page). */
  followupState?: "sent" | "started" | "done";
  /**
   * Whether the current chat link has opened a conversation. Not on the record
   * itself — it lives in the chat store — so pages that need it (Accepted) set
   * it after building the view.
   */
  chatStarted?: boolean;
  /** When the last "not started yet" chat reminder went out. */
  chatRemindedAt?: string;
  fullyVerifiedAt?: string;
  identityReminderCount?: number;
  /** Every identity reminder, oldest first. */
  identityReminders?: string[];
  /** Every "received, under review" email, oldest first. */
  submissionAckSentAt?: string;
  submissionAckCount?: number;
  submissionAcks?: string[];
  /**
   * Derived: they have accepted an offer and still owe us identity documents.
   *
   * Both halves matter. Before accepting there is nothing to chase, and the
   * step only appears on their offer link once they have — so a reminder to
   * anyone else points at a page that will not ask them for anything.
   */
  identityNeeded: boolean;
  /**
   * Whether a Social Security Number is on file — never the number.
   *
   * A boolean, deliberately. The panel needs to know whether there is
   * something to show; the number itself is fetched one candidate at a time
   * when somebody presses Show, so a table listing forty people does not send
   * forty SSNs to the browser to render none of them.
   */
  hasSsn: boolean;
  /** Interview follow-up state, for the Interviews tab's own filters. */
  interviewCompletedAt?: string;
  voiceRequestedAt?: string;
  offer?: Offer;
  offerSentAt?: string;
  offerAcceptedAt?: string;
  offerDeclinedAt?: string;
  offerDeclineReason?: string;
  /** Chasing an answer: when, how often, and by when they were asked to reply. */
  offerReminderSentAt?: string;
  offerReminderCount?: number;
  offerReminders?: string[];
  offerReplyDeadline?: string;
  /**
   * Derived: an offer is out and they have said neither yes nor no.
   *
   * Computed here so the table banner, the profile panel and the reminder
   * button cannot disagree about who is still being waited on.
   */
  offerAwaitingReply: boolean;
  /** What they re-confirmed on accepting. Absent until they do. */
  confirmedDetails?: ConfirmedDetails;
  confirmedDetailsAt?: string;
  /** The window and days they chose when accepting, with the zone they meant. */
  availability?: Availability;
  availabilitySetBy?: string;
  /** The company they contract through, once confirmed with its paperwork. */
  companyDetails?: CompanyDetails;
  companyDetailsAt?: string;
  companyRequestedAt?: string;
  companyRequestCount?: number;
  companyRequests?: string[];
  companyOpenedAt?: string;
  /**
   * Derived: they accepted through a company and it is not confirmed yet.
   *
   * A gate, not a note. The agreement is made with the company, so drawing one
   * up from two boxes typed on an acceptance form would name a legal person we
   * have no evidence exists.
   */
  companyNeeded: boolean;
  /** Last Companies House lookup, if one has been run. */
  companyCheck?: CompanyCheck;
  /**
   * Their assessment invitation is waiting for a person to send it.
   *
   * The whole condition in one place: they submitted, nothing has been
   * emailed, and their country is on the manual-invitation list. Split across
   * the tables this would drift, and a row that stopped offering the button
   * would leave someone waiting indefinitely.
   */
  inviteHeld: boolean;
}

/**
 * @param base     absolute site origin, for building the interview link
 * @param required countries that must verify their identity
 */
export function toCandidateView(
  c: Candidate,
  base: string,
  required: readonly string[],
  /** Countries whose assessment invitation is held for manual sending. */
  manualInvite: readonly string[] = [],
): CandidateView {
  return compact({
    id: c.id,
    fullName: c.fullName,
    firstName: c.firstName,
    lastName: c.lastName,
    dob: c.dob,
    email: c.email,
    phone: c.phone,
    country: c.country,
    detectedCountryName: c.detectedCountryName,
    detectedCountryIso: c.detectedCountryIso,
    detectedCountryAt: c.detectedCountryAt,
    city: c.city,
    address: c.address,
    linkedin: c.linkedin,
    languages: (c.languages ?? []).filter((l) => l.language).map((l) => l.language),
    position: c.position,
    status: c.status,
    createdAt: c.createdAt,
    submittedAt: c.submittedAt,
    invitationSentAt: c.invitationSentAt,
    interviewCompleted: !!c.interview,
    score: c.interview?.score,
    total: c.interview?.total,
    interviewLink: `${base}/interview?c=${c.id}`,
    duplicateFlag: c.duplicateFlag,
    duplicateOfName: c.duplicateOfName,
    interviewEmailSentAt: c.interviewEmailSentAt,
    notes: c.notes,
    interviewOpenedAt: c.interviewOpenedAt,
    formCompleted: !!c.submittedAt,
    reminderEmailSentAt: c.reminderEmailSentAt,
    reminderEmailCount: c.reminderEmailCount,
    reminderWhatsAppSentAt: c.reminderWhatsAppSentAt,
    reminderWhatsAppCount: c.reminderWhatsAppCount,
    lastOpenedAt: c.lastOpenedAt,
    openCount: c.openCount,
    lastOpenSource: c.lastOpenSource,
    documents: c.documents?.map(withoutHash),
    verificationStatus: verificationStatus(c, required),
    verifiedAt: c.verifiedAt,
    verifiedBy: c.verifiedBy,
    rejectedAt: c.rejectedAt,
    rejectionReason: c.rejectionReason,
    imagesDeletedAt: c.imagesDeletedAt,
    verificationConsentAt: c.verificationConsentAt,
    verificationRequestedAt: c.verificationRequestedAt,
    identityDocumentType: c.identityDocumentType,
    identityReuploadRequestedAt: c.identityReuploadRequestedAt,
    identityReuploadReason: c.identityReuploadReason,
    favorite: c.favorite,
    favoritedAt: c.favoritedAt,
    residenceRequestedAt: c.residenceRequestedAt,
    residenceCountry: c.residenceCountry,
    residenceReason: c.residenceReason,
    residenceExplainedAt: c.residenceExplainedAt,
    residenceVerifiedAt: c.residenceVerifiedAt,
    residenceRejectedAt: c.residenceRejectedAt,
    residenceRejectionReason: c.residenceRejectionReason,
    residenceReuploadRequestedAt: c.residenceReuploadRequestedAt,
    residenceReuploadReason: c.residenceReuploadReason,
    residenceImagesDeletedAt: c.residenceImagesDeletedAt,
    panAnswer: c.panAnswer,
    gstin: c.gstin,
    gstinAddedAt: c.gstinAddedAt,
    gstinAddedBy: c.gstinAddedBy,
    gstinAddedVia: c.gstinAddedVia,
    gstinRequests: c.gstinRequests,
    gstinWaitingEmails: c.gstinWaitingEmails,
    panReuploadRequestedAt: c.panReuploadRequestedAt,
    panReuploadReason: c.panReuploadReason,
    panReuploadRequests: c.panReuploadRequests,
    panReuploadedAt: c.panReuploadedAt,
    panAnsweredAt: c.panAnsweredAt,
    panDeletedAt: c.panDeletedAt,
    addressProofRequestedAt: c.addressProofRequestedAt,
    addressProofReason: c.addressProofReason,
    addressProofEvents: c.addressProofEvents,
    addressProofSubmittedAt: c.addressProofSubmittedAt,
    addressProofSubmissions: c.addressProofSubmissions,
    addressProofApprovedAt: c.addressProofApprovedAt,
    addressProofApprovedBy: c.addressProofApprovedBy,
    addressProofStatus: addressProofStatus(c),
    agreementStartDate: c.agreementStartDate,
    agreementSentAt: c.agreementSentAt,
    agreementRef: c.agreementRef,
    agreementReason: c.agreementReason,
    agreementEvents: c.agreementEvents,
    agreementSignedAt: c.agreementSignedAt,
    agreementSubmissions: c.agreementSubmissions,
    agreementApprovedAt: c.agreementApprovedAt,
    agreementApprovedBy: c.agreementApprovedBy,
    agreementStatus: agreementStatus(c),
    agreementMissing: agreementMissing(c),
    liveVerificationUrl: c.liveVerificationUrl,
    liveVerificationSentAt: c.liveVerificationSentAt,
    liveVerificationCount: c.liveVerificationCount,
    liveVerificationOpenedAt: c.liveVerificationOpenedAt,
    liveVerificationLastOpenedAt: c.liveVerificationLastOpenedAt,
    liveVerificationOpenCount: c.liveVerificationOpenCount,
    liveVerificationStartedAt: c.liveVerificationStartedAt,
    liveVerificationLinkChangedAt: c.liveVerificationLinkChangedAt,
    liveVerificationLinkChangeCount: c.liveVerificationLinkChangeCount,
    liveVerificationHeldAt: c.liveVerificationHeldAt,
    liveVerificationWaitingSince: c.liveVerificationWaitingSince,
    liveVerificationReason: c.liveVerificationReason,
    liveVerificationPassedAt: c.liveVerificationPassedAt,
    liveVerificationPassedNote: c.liveVerificationPassedNote,
    identityReuploadPending: identityReuploadPending(c),
    voiceStatus: c.voiceStatus,
    voiceOpenedAt: c.voiceOpenedAt,
    voiceOpenCount: c.voiceOpenCount,
    voiceReminderSentAt: c.voiceReminderSentAt,
    voiceReminderCount: c.voiceReminderCount,
    voiceAckSentAt: c.voiceAckSentAt,
    voiceAckCount: c.voiceAckCount,
    voiceAcks: c.voiceAcks,
    verifiedAckSentAt: c.verifiedAckSentAt,
    verifiedAcks: c.verifiedAcks,
    awaitingDecision: awaitingDecision(c),
    voiceNeeded: voiceRecordingNeeded(c),
    identityReminderSentAt: c.identityReminderSentAt,
    chatLinkSentAt: c.chatLinkSentAt,
    chatLinks: c.chatLinks,
    onboardingChatLinks: c.onboardingChatLinks,
    followupChatLinks: c.followupChatLinks,
    chatRemindedAt: (c.liveReminders ?? []).filter((r) => (r.kind ?? "live") === "nudge").at(-1)?.sentAt,
    fullyVerifiedAt: c.fullyVerifiedAt,
    submissionAckSentAt: c.submissionAckSentAt,
    submissionAckCount: c.submissionAckCount,
    submissionAcks: c.submissionAcks,
    identityReminderCount: c.identityReminderCount,
    identityReminders: c.identityReminders,
    identityNeeded: !!c.offerAcceptedAt && identityStillNeeded(c),
    hasSsn: hasSsn(c),
    interviewCompletedAt: c.interview?.completedAt,
    voiceRequestedAt: c.voiceRequestedAt,
    offer: c.offer,
    offerSentAt: c.offerSentAt,
    offerAcceptedAt: c.offerAcceptedAt,
    offerDeclinedAt: c.offerDeclinedAt,
    offerDeclineReason: c.offerDeclineReason,
    offerReminderSentAt: c.offerReminderSentAt,
    offerReminderCount: c.offerReminderCount,
    offerReminders: c.offerReminders,
    offerReplyDeadline: c.offerReplyDeadline,
    offerAwaitingReply: offerAwaitingReply(c),
    confirmedDetails: c.confirmedDetails,
    confirmedDetailsAt: c.confirmedDetailsAt,
    availability: c.availability,
    availabilitySetBy: c.availabilitySetBy,
    companyDetails: c.companyDetails,
    companyDetailsAt: c.companyDetailsAt,
    companyRequestedAt: c.companyRequestedAt,
    companyRequestCount: c.companyRequestCount,
    companyRequests: c.companyRequests,
    companyOpenedAt: c.companyOpenedAt,
    companyNeeded: companyDetailsNeeded(c),
    companyCheck: c.companyCheck,
    inviteHeld:
      !!c.submittedAt &&
      !c.interviewEmailSentAt &&
      countryRuleApplies(c.country, c.phone, manualInvite),
  });
}

/**
 * Drop the keys that have no value.
 *
 * This object has seventy-odd fields and most of them are empty for most
 * people — nobody has an offer, a company, a live check and a voice recording
 * at once. An absent field still costs its key name in the payload, and the
 * payload carries one of these per candidate, so at a thousand rows the field
 * *names* alone are the larger part of what is sent.
 *
 * Every one of those fields is already optional, so an absent key and a key
 * holding undefined mean exactly the same thing to every reader — they are the
 * same object, minus the part nobody can use.
 */
/**
 * A document, minus the digest of its contents.
 *
 * The hash answers "is this the same file as that one", which is a question
 * only the server asks — it finds the same person applying twice under a new
 * address. Nothing in the browser reads it, so every one sent is sixty-four
 * characters of nothing, per document, per candidate, on every page load.
 *
 * It is also a fingerprint of somebody's passport photograph, and there is no
 * reason for it to leave the server at all.
 */
function withoutHash(doc: CandidateDocument): CandidateDocument {
  if (!doc.sha256) return doc;
  const { sha256: _omitted, ...rest } = doc;
  return rest;
}

function compact<T extends object>(view: T): T {
  const out: Record<string, unknown> = {};
  for (const key in view) {
    const value = (view as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}
