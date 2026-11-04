/**
 * Every email this application sends, rendered with sample data, for reading.
 *
 * Read-only by design. The templates are code — they are reviewed and
 * committed like everything else — and a panel that let somebody retype an
 * offer email in a text box would be a second, unreviewed source of truth for
 * words that promise people money. What a recruiter needs is to see exactly
 * what a candidate will receive, and that is all this is.
 *
 * Rendered through the real template functions and the real formatting
 * helpers, never through copies. A preview built from hand-typed strings would
 * drift from the email the moment somebody changed either, and the whole value
 * of this page is that it cannot disagree with what actually goes out.
 *
 * Adding a template means adding it here. The test suite checks every
 * exported `…Html` function in emailTemplates has an entry, so a new template
 * cannot quietly be missing from the page.
 */
import { siteConfig } from "@/config/site";
import {
  addressProofReaskHtml,
  addressProofReaskSubject,
  addressProofReaskText,
  addressProofReminderHtml,
  addressProofReminderSubject,
  addressProofReminderText,
  addressProofRequestHtml,
  addressProofRequestSubject,
  addressProofRequestText,
  companyDetailsHtml,
  composedEmailHtml,
  companyDetailsSubject,
  companyDetailsText,
  identityReminderHtml,
  identityReminderSubject,
  identityReminderText,
  identityReuploadHtml,
  identityReuploadSubject,
  identityReuploadText,
  interviewInviteHtml,
  interviewInviteSubject,
  interviewInviteText,
  liveVerificationHtml,
  liveVerificationSubject,
  liveVerificationText,
  offerHtml,
  offerReminderHtml,
  offerReminderSubject,
  offerReminderText,
  offerSubject,
  offerText,
  reminderHtml,
  reminderSubject,
  reminderText,
  residenceRequestHtml,
  residenceRequestSubject,
  residenceRequestText,
  submissionReceivedHtml,
  finalChatHtml,
  finalChatSubject,
  onboardingChatHtml,
  onboardingChatSubject,
  onboardingChatText,
  followupChatHtml,
  followupChatSubject,
  followupChatText,
  finalChatText,
  chatLiveNowHtml,
  chatLiveNowSubject,
  chatLiveNowText,
  chatReminderHtml,
  chatReminderSubject,
  chatReminderText,
  gstinRequestHtml,
  gstinRequestSubject,
  gstinRequestText,
  gstinWaitingHtml,
  gstinWaitingSubject,
  gstinWaitingText,
  panReuploadHtml,
  panReuploadSubject,
  panReuploadText,
  submissionReceivedSubject,
  submissionReceivedText,
  verificationRequestHtml,
  verificationRequestSubject,
  verificationRequestText,
  voiceAckHtml,
  verifiedAckHtml,
  verifiedAckSubject,
  verifiedAckText,
  voiceAckSubject,
  voiceAckText,
  voiceAssessmentHtml,
  voiceAssessmentSubject,
  voiceAssessmentText,
  voiceReminderHtml,
  voiceReminderSubject,
  voiceReminderText,
} from "@/lib/emailTemplates";
import {
  teamActivatedHtml,
  teamActivatedSubject,
  teamActivatedText,
  teamBankHtml,
  teamBankSubject,
  teamBankText,
  teamPasswordChangedHtml,
  teamPasswordChangedSubject,
  teamPasswordChangedText,
  teamDayOffHtml,
  teamDayOffSubject,
  teamDayOffText,
  teamInviteHtml,
  teamInviteSubject,
  teamInviteText,
  teamMailAlertHtml,
  teamMailAlertSubject,
  teamMailAlertText,
  teamPaymentHtml,
  teamPaymentSubject,
  teamPaymentText,
  teamPhoneHtml,
  teamPhoneSubject,
  teamPhoneText,
  teamPortalUrl,
  teamTicketHtml,
  teamTicketSubject,
  teamTicketText,
} from "@/lib/teamEmailTemplates";
import { effectiveOffer, formatRate, type Offer } from "@/lib/offer";
import { deadlineFrom, formatDeadline } from "@/lib/offerReminder";
import { sampleAgreement } from "@/lib/sampleAgreement";
import { AGREEMENT_REASK_REASONS } from "@/lib/agreement";
import {
  agreementReaskHtml,
  agreementReaskSubject,
  agreementReaskText,
  agreementReceivedHtml,
  agreementReceivedSubject,
  agreementReceivedText,
  agreementReminderHtml,
  agreementReminderSubject,
  agreementReminderText,
  agreementSentHtml,
  agreementSentSubject,
  agreementSentText,
  agreementUpdatedHtml,
  agreementUpdatedSubject,
  agreementUpdatedText,
} from "@/lib/agreementEmails";
import { REUPLOAD_REASONS } from "@/lib/verification";
import { RESIDENCE_REASONS } from "@/lib/residence";
import { ADDRESS_REASK_REASONS } from "@/lib/addressProof";
import { CHAT_LINK_TTL_DAYS, DEFAULT_HOURS } from "@/lib/chat";

export type EmailStage = "application" | "voice" | "identity" | "offer" | "team";

export const STAGE_LABEL: Record<EmailStage, string> = {
  application: "Application & assessment",
  voice: "Voice assessment",
  identity: "Identity & residence",
  offer: "Offer & agreement",
  team: "Team portal (workroute.team)",
};

export const STAGE_ORDER: readonly EmailStage[] = ["application", "voice", "identity", "offer", "team"];

export interface CatalogueEntry {
  /** Stable, used in the URL: /admin/emails?t=offer */
  id: string;
  name: string;
  stage: EmailStage;
  /** What causes it to be sent, in the terms of the panel that sends it. */
  when: string;
  /**
   * Whether it counts against the daily warm-up cap. Only the acknowledgement
   * somebody gets for applying is exempt.
   */
  kind: "campaign" | "reactive" | "both";
  /** The template function it renders, so the test can prove none is missing. */
  source: string;
  render: () => { subject: string; html: string; text: string };
}

/* -------------------------------------------------------------------------- */
/* Sample data                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One invented candidate, used in every preview.
 *
 * Plainly fictional and the same person throughout, so a recruiter reading
 * the offer and then the reminder sees one story rather than a different
 * stranger in each email.
 */
const SAMPLE_NAME = "Amina Diallo";
const SAMPLE_EMAIL = "amina.diallo@example.com";
const SAMPLE_POSITION = "Customer Support Representative";

/**
 * Links in a preview point at the real site with an obviously fake token.
 * They are never followed — the preview frame does not allow it — but the
 * address shown in "Button not working? Copy this link" should look like the
 * real thing rather than like a placeholder.
 */
const base = siteConfig.url.replace(/\/$/, "");
const link = (path: string) => `${base}${path}`;

const SAMPLE_OFFER: Offer = {
  position: SAMPLE_POSITION,
  rate: 9,
  currency: "USD",
  unit: "HOUR",
  hoursPerWeek: 25,
  startDate: "2026-10-05",
  engagement: "Independent contractor",
};

/* -------------------------------------------------------------------------- */
/* The catalogue                                                               */
/* -------------------------------------------------------------------------- */

export const EMAIL_CATALOGUE: readonly CatalogueEntry[] = [
  /* ---------------------------------------------------------------- */
  /* Application & assessment                                          */
  /* ---------------------------------------------------------------- */
  {
    id: "interview-invite",
    name: "Assessment invitation",
    stage: "application",
    when:
      "Sent automatically the moment somebody submits an application, and again when you send the assessment link from the Candidates tab.",
    kind: "both",
    source: "interviewInviteHtml",
    render: () => {
      const invite = {
        fullName: SAMPLE_NAME,
        interviewUrl: link("/interview?c=EXAMPLE"),
        position: SAMPLE_POSITION,
      };
      return {
        subject: interviewInviteSubject(SAMPLE_POSITION),
        html: interviewInviteHtml(invite),
        text: interviewInviteText(invite),
      };
    },
  },
  {
    id: "assessment-reminder",
    name: "Assessment reminder",
    stage: "application",
    when:
      "Sent from Remind to answer, to candidates who were sent the assessment and have not finished it.",
    kind: "campaign",
    source: "reminderHtml",
    render: () => {
      const invite = {
        fullName: SAMPLE_NAME,
        interviewUrl: link("/interview?c=EXAMPLE&s=reminder-email"),
        position: SAMPLE_POSITION,
      };
      return {
        subject: reminderSubject(SAMPLE_POSITION),
        html: reminderHtml(invite),
        text: reminderText(invite),
      };
    },
  },

  /* ---------------------------------------------------------------- */
  /* Voice assessment                                                  */
  /* ---------------------------------------------------------------- */
  {
    id: "voice-assessment",
    name: "Interview passed — voice assessment",
    stage: "voice",
    when:
      "Sent from the Interviews tab when a candidate has passed the online interview and is asked to record the voice assessment.",
    kind: "campaign",
    source: "voiceAssessmentHtml",
    render: () => {
      const invite = {
        fullName: SAMPLE_NAME,
        email: SAMPLE_EMAIL,
        position: SAMPLE_POSITION,
        recordUrl: link("/interview?c=EXAMPLE"),
      };
      return {
        subject: voiceAssessmentSubject(),
        html: voiceAssessmentHtml(invite),
        text: voiceAssessmentText(invite),
      };
    },
  },
  {
    id: "voice-reminder",
    name: "Voice assessment reminder",
    stage: "voice",
    when: "Sent to candidates who were asked for a recording and have not sent one.",
    kind: "campaign",
    source: "voiceReminderHtml",
    render: () => {
      const invite = {
        fullName: SAMPLE_NAME,
        email: SAMPLE_EMAIL,
        position: SAMPLE_POSITION,
        recordUrl: link("/interview?c=EXAMPLE"),
      };
      return {
        subject: voiceReminderSubject(),
        html: voiceReminderHtml(invite),
        text: voiceReminderText(invite),
      };
    },
  },
  {
    id: "voice-ack",
    name: "Recording received",
    stage: "voice",
    when:
      "Sent to confirm a voice recording arrived and that an answer is coming. The candidate then appears in the Waiting tab.",
    kind: "campaign",
    source: "voiceAckHtml",
    render: () => {
      const invite = {
        fullName: SAMPLE_NAME,
        position: SAMPLE_POSITION,
        receivedAt: new Date().toISOString(),
      };
      return {
        subject: voiceAckSubject(),
        html: voiceAckHtml(invite),
        text: voiceAckText(invite),
      };
    },
  },
  {
    id: "verified-ack",
    name: "Information verified — waiting for a place",
    stage: "voice",
    when:
      "Sent with “Tell them they’re verified” (View info → Assessment, or in bulk from the Interviews tab) to a candidate whose ID is verified and who has not sent a voice recording. Their voice step becomes “Skipped — final video interview” and they appear in the Waiting tab.",
    kind: "campaign",
    source: "verifiedAckHtml",
    render: () => {
      const payload = { fullName: SAMPLE_NAME, position: SAMPLE_POSITION };
      return { subject: verifiedAckSubject(), html: verifiedAckHtml(payload), text: verifiedAckText(payload) };
    },
  },

  /* ---------------------------------------------------------------- */
  /* Identity & residence                                              */
  /* ---------------------------------------------------------------- */
  {
    id: "verification-request",
    name: "Identity check request",
    stage: "identity",
    when:
      "Sent from the ID check tab to ask for identity documents from somebody whose country does not require them automatically.",
    kind: "campaign",
    source: "verificationRequestHtml",
    render: () => {
      const invite = {
        fullName: SAMPLE_NAME,
        interviewUrl: link("/interview?c=EXAMPLE"),
        position: SAMPLE_POSITION,
      };
      return {
        subject: verificationRequestSubject(),
        html: verificationRequestHtml(invite),
        text: verificationRequestText(invite),
      };
    },
  },
  {
    id: "identity-reupload",
    name: "New identity photos needed",
    stage: "identity",
    when:
      "Sent from Ask for new photos in the ID check tab. The highlighted box carries the reason you choose; this preview shows the first preset.",
    kind: "campaign",
    source: "identityReuploadHtml",
    render: () => {
      const payload = {
        fullName: SAMPLE_NAME,
        url: link("/offer?t=EXAMPLE"),
        reason: REUPLOAD_REASONS[0].message,
      };
      return {
        subject: identityReuploadSubject(),
        html: identityReuploadHtml(payload),
        text: identityReuploadText(payload),
      };
    },
  },
  {
    id: "identity-reminder",
    name: "Identity documents reminder",
    stage: "identity",
    when: "Sent to candidates who owe identity documents and have not sent them.",
    kind: "campaign",
    source: "identityReminderHtml",
    render: () => {
      const invite = {
        fullName: SAMPLE_NAME,
        uploadUrl: link("/offer?t=EXAMPLE"),
        position: SAMPLE_POSITION,
      };
      return {
        subject: identityReminderSubject(),
        html: identityReminderHtml(invite),
        text: identityReminderText(invite),
      };
    },
  },
  {
    id: "live-agreement",
    name: "Live verification — before the agreement",
    stage: "identity",
    when:
      "Sent from Start live verification when the reason is “One last step before we send your agreement”.",
    kind: "campaign",
    source: "liveVerificationHtml",
    render: () => {
      const invite = {
        fullName: SAMPLE_NAME,
        startUrl: link("/verify/live?t=EXAMPLE"),
        reason: "agreement" as const,
      };
      return {
        subject: liveVerificationSubject("agreement"),
        html: liveVerificationHtml(invite),
        text: liveVerificationText(invite),
      };
    },
  },
  {
    id: "live-retry",
    name: "Live verification — could not verify ID",
    stage: "identity",
    when:
      "Sent from Start live verification when the reason is “We couldn't verify your ID”.",
    kind: "campaign",
    source: "liveVerificationHtml",
    render: () => {
      const invite = {
        fullName: SAMPLE_NAME,
        startUrl: link("/verify/live?t=EXAMPLE"),
        reason: "retry" as const,
      };
      return {
        subject: liveVerificationSubject("retry"),
        html: liveVerificationHtml(invite),
        text: liveVerificationText(invite),
      };
    },
  },
  {
    id: "residence",
    name: "Proof of residence",
    stage: "identity",
    when:
      "Sent from Ask for proof of residence in the ID check tab. The highlighted box carries the reason you choose; this preview shows the first preset.",
    kind: "campaign",
    source: "residenceRequestHtml",
    render: () => {
      const payload = {
        fullName: SAMPLE_NAME,
        url: link("/offer?t=EXAMPLE&step=residence"),
        reason: RESIDENCE_REASONS[0].message,
        country: "China",
      };
      return {
        subject: residenceRequestSubject(),
        html: residenceRequestHtml(payload),
        text: residenceRequestText(payload),
      };
    },
  },
  {
    id: "submission-received",
    name: "Submission received — under review",
    stage: "identity",
    when:
      "Sent by hand from the ID check tab — once a candidate has submitted identity documents or proof of residence waiting for review, or while their ID check shows Awaiting upload or Verified.",
    kind: "campaign",
    source: "submissionReceivedHtml",
    render: () => {
      const payload = { fullName: SAMPLE_NAME };
      return {
        subject: submissionReceivedSubject(),
        html: submissionReceivedHtml(payload),
        text: submissionReceivedText(payload),
      };
    },
  },
  {
    id: "final-chat",
    name: "Final interview — live chat invitation",
    stage: "voice",
    when:
      "Sent by hand from View info → Assessment with Send final interview chat link. The link opens the live chat page and is valid for 7 days.",
    kind: "campaign",
    source: "finalChatHtml",
    render: () => {
      const payload = {
        fullName: SAMPLE_NAME,
        chatUrl: link("/chat?t=EXAMPLE"),
        position: SAMPLE_POSITION,
        hours: DEFAULT_HOURS,
        validDays: CHAT_LINK_TTL_DAYS,
      };
      return {
        subject: finalChatSubject(),
        html: finalChatHtml(payload),
        text: finalChatText(payload),
      };
    },
  },
  {
    id: "followup-chat",
    name: "Follow-up chat invitation",
    stage: "voice",
    when:
      "Sent by hand with Invite to follow-up chat — in View info → Assessment, or in an ended interview chat in Live chat — once the interview chat has ended. Carries the reason you chose. The link is valid for 7 days; the chat appears in Live chat → Follow-up chat. The “we’re live” and reminder emails for it say “follow-up chat”.",
    kind: "campaign",
    source: "followupChatHtml",
    render: () => {
      const payload = {
        fullName: SAMPLE_NAME,
        chatUrl: link("/chat?t=EXAMPLE"),
        reason: "We need a few more details about your experience.",
        hours: DEFAULT_HOURS,
        validDays: CHAT_LINK_TTL_DAYS,
      };
      return { subject: followupChatSubject(), html: followupChatHtml(payload), text: followupChatText(payload) };
    },
  },
  {
    id: "chat-live-now",
    name: "Final interview — “our team is live now”",
    stage: "voice",
    when:
      "Sent by hand with Send “We’re live” email — in Live chat when the candidate is not on the chat page, or in View info → Assessment. Uses their same chat link (a fresh one if it has expired). When they open it you get a Telegram message.",
    kind: "campaign",
    source: "chatLiveNowHtml",
    render: () => {
      const payload = { fullName: SAMPLE_NAME, chatUrl: link("/chat?t=EXAMPLE&r=EXAMPLE"), validDays: CHAT_LINK_TTL_DAYS };
      return { subject: chatLiveNowSubject(), html: chatLiveNowHtml(payload), text: chatLiveNowText(payload) };
    },
  },
  {
    id: "chat-reminder",
    name: "Final interview — reminder to start the chat",
    stage: "voice",
    when:
      "Sent by hand with Send reminder in View info → Assessment, or to many at once from the Accepted tab (Live interview: Sent — not started). For somebody sent the chat link who has not started. Same link (a fresh one if it has expired). When they open it you get a Telegram message.",
    kind: "campaign",
    source: "chatReminderHtml",
    render: () => {
      const payload = {
        fullName: SAMPLE_NAME,
        chatUrl: link("/chat?t=EXAMPLE&r=EXAMPLE"),
        hours: DEFAULT_HOURS,
        validUntil: "7 October",
      };
      return { subject: chatReminderSubject(), html: chatReminderHtml(payload), text: chatReminderText(payload) };
    },
  },
  {
    id: "pan-reupload",
    name: "PAN card re-upload",
    stage: "identity",
    when:
      "Sent by hand from View info → Company (PAN card & GSTIN) with Ask to re-upload PAN, to a candidate in India who already accepted — the back was missing, a scan or e-PAN was sent, or the photo is unclear. Personal link valid for 14 days; you get a Telegram message when they re-upload.",
    kind: "campaign",
    source: "panReuploadHtml",
    render: () => {
      const payload = {
        fullName: SAMPLE_NAME,
        url: link("/pan?t=EXAMPLE"),
        reason: "The back of your PAN card is missing.",
        validDays: 14,
      };
      return { subject: panReuploadSubject(), html: panReuploadHtml(payload), text: panReuploadText(payload) };
    },
  },
  {
    id: "gstin-request",
    name: "GSTIN request",
    stage: "identity",
    when:
      "Sent by hand from View info → Company (PAN card & GSTIN) with Request GSTIN, to a candidate in India who has not given one. They reply with it, and you add it with the edit icon.",
    kind: "campaign",
    source: "gstinRequestHtml",
    render: () => {
      const payload = { fullName: SAMPLE_NAME };
      return { subject: gstinRequestSubject(), html: gstinRequestHtml(payload), text: gstinRequestText(payload) };
    },
  },
  {
    id: "gstin-waiting",
    name: "Waiting for the GSTIN — your place is held",
    stage: "identity",
    when:
      "Sent by hand from View info → Company (PAN card & GSTIN) with Send “place still waiting” email, or to many at once from the Accepted tab (Remind: waiting for GSTIN), to a candidate in India who accepted and has no GSTIN yet. Tells them their agreement is ready and their place stays available until they have one. They reply with it, and you add it with the edit icon.",
    kind: "campaign",
    source: "gstinWaitingHtml",
    render: () => {
      const payload = { fullName: SAMPLE_NAME };
      return { subject: gstinWaitingSubject(), html: gstinWaitingHtml(payload), text: gstinWaitingText(payload) };
    },
  },

  /* ---------------------------------------------------------------- */
  /* Offer & agreement                                                 */
  /* ---------------------------------------------------------------- */
  {
    id: "offer",
    name: "Job offer",
    stage: "offer",
    when:
      "Sent from the Offer tab in View info. The terms shown are a sample — the real email carries the rate, hours and start date you enter.",
    kind: "campaign",
    source: "offerHtml",
    render: () => {
      const sample = sampleAgreement(base);
      const offerUrl = link("/offer?t=EXAMPLE");
      const payload = {
        fullName: SAMPLE_NAME,
        position: SAMPLE_OFFER.position,
        rate: formatRate(SAMPLE_OFFER),
        engagement: SAMPLE_OFFER.engagement,
        hoursPerWeek: effectiveOffer(SAMPLE_OFFER).hoursPerWeek,
        startDate: SAMPLE_OFFER.startDate,
        acceptUrl: offerUrl,
        declineUrl: `${offerUrl}&a=decline`,
        sampleUrl: sample?.url,
        sampleVersion: sample?.version,
      };
      return {
        subject: offerSubject(),
        html: offerHtml(payload),
        text: offerText(payload),
      };
    },
  },
  {
    id: "offer-reminder",
    name: "Offer reminder",
    stage: "offer",
    when:
      "Sent from the Offers tab to candidates who have not answered their offer, with a deadline to reply.",
    kind: "campaign",
    source: "offerReminderHtml",
    render: () => {
      const invite = {
        fullName: SAMPLE_NAME,
        position: SAMPLE_OFFER.position,
        rate: formatRate(SAMPLE_OFFER),
        offerUrl: link("/offer?t=EXAMPLE"),
        deadline: formatDeadline(deadlineFrom(Date.now())),
      };
      return {
        subject: offerReminderSubject(invite.position),
        html: offerReminderHtml(invite),
        text: offerReminderText(invite),
      };
    },
  },
  {
    id: "company-details",
    name: "Company details request",
    stage: "offer",
    when:
      "Sent from the Company tab to a candidate who accepted as a company, asking them to confirm it with its paperwork.",
    kind: "campaign",
    source: "companyDetailsHtml",
    render: () => {
      const invite = {
        fullName: SAMPLE_NAME,
        companyName: "Diallo Support Services LLC",
        url: link("/company?t=EXAMPLE"),
      };
      return {
        subject: companyDetailsSubject(),
        html: companyDetailsHtml(invite),
        text: companyDetailsText(invite),
      };
    },
  },
  {
    id: "address-proof",
    name: "Proof of address request",
    stage: "offer",
    when:
      "Sent by hand from View info → ID check → Proof of address with Send request, or to many at once from the Accepted tab (Ask for proof of address). Optional last step before the final agreement — nothing waits on it. The link never expires; you get a Telegram message when they upload.",
    kind: "campaign",
    source: "addressProofRequestHtml",
    render: () => {
      const payload = { fullName: SAMPLE_NAME, url: link("/address?t=EXAMPLE") };
      return {
        subject: addressProofRequestSubject(),
        html: addressProofRequestHtml(payload),
        text: addressProofRequestText(payload),
      };
    },
  },
  {
    id: "address-proof-reminder",
    name: "Proof of address reminder",
    stage: "offer",
    when:
      "Sent by hand with Send reminder in View info → ID check → Proof of address, to somebody who was asked and has not uploaded yet. Same link.",
    kind: "campaign",
    source: "addressProofReminderHtml",
    render: () => {
      const payload = { fullName: SAMPLE_NAME, url: link("/address?t=EXAMPLE") };
      return {
        subject: addressProofReminderSubject(),
        html: addressProofReminderHtml(payload),
        text: addressProofReminderText(payload),
      };
    },
  },
  {
    id: "address-proof-reask",
    name: "Proof of address — new document needed",
    stage: "offer",
    when:
      "Sent from Ask for a new document in View info → ID check → Proof of address. The highlighted box carries the reason you choose; this preview shows the first preset. Their page opens again for a new upload.",
    kind: "campaign",
    source: "addressProofReaskHtml",
    render: () => {
      const payload = {
        fullName: SAMPLE_NAME,
        url: link("/address?t=EXAMPLE"),
        reason: ADDRESS_REASK_REASONS[0].message,
      };
      return {
        subject: addressProofReaskSubject(),
        html: addressProofReaskHtml(payload),
        text: addressProofReaskText(payload),
      };
    },
  },
  {
    id: "agreement-sent",
    name: "Final agreement — please sign",
    stage: "offer",
    when:
      "Sent with Send final agreement, from View info → Agreement or the Accepted tab (one candidate or many), to a Full verified candidate. The agreement PDF, filled with their details, is attached. They sign it and upload it with the link, or reply to the email. You get a Telegram message when they upload.",
    kind: "campaign",
    source: "agreementSentHtml",
    render: () => {
      const payload = { fullName: SAMPLE_NAME, url: link("/agreement?t=EXAMPLE"), ref: "WR-EXAMPLE-20261029" };
      return { subject: agreementSentSubject(), html: agreementSentHtml(payload), text: agreementSentText(payload) };
    },
  },
  {
    id: "agreement-updated",
    name: "Final agreement — updated start date",
    stage: "offer",
    when:
      "Sent with Send updated agreement in View info → Agreement, when you change the start date for somebody who has not signed yet. The new version is attached with a new reference; the email tells them the earlier one no longer applies.",
    kind: "campaign",
    source: "agreementUpdatedHtml",
    render: () => {
      const payload = {
        fullName: SAMPLE_NAME,
        url: link("/agreement?t=EXAMPLE"),
        ref: "WR-EXAMPLE-20261105-V2",
        fromDate: "2 November 2026",
        toDate: "16 November 2026",
      };
      return { subject: agreementUpdatedSubject(), html: agreementUpdatedHtml(payload), text: agreementUpdatedText(payload) };
    },
  },
  {
    id: "agreement-reminder",
    name: "Final agreement reminder",
    stage: "offer",
    when:
      "Sent with Send reminder in View info → Agreement, or in bulk from the Accepted tab, to somebody who was sent the agreement and has not sent it back. The same agreement PDF is attached again.",
    kind: "campaign",
    source: "agreementReminderHtml",
    render: () => {
      const payload = { fullName: SAMPLE_NAME, url: link("/agreement?t=EXAMPLE"), ref: "WR-EXAMPLE-20261029" };
      return { subject: agreementReminderSubject(), html: agreementReminderHtml(payload), text: agreementReminderText(payload) };
    },
  },
  {
    id: "agreement-reask",
    name: "Final agreement — send it again",
    stage: "offer",
    when:
      "Sent from Ask again in View info → Agreement when the signed copy will not do. The highlighted box carries the reason you choose; this preview shows the first preset. The agreement is attached again.",
    kind: "campaign",
    source: "agreementReaskHtml",
    render: () => {
      const payload = {
        fullName: SAMPLE_NAME,
        url: link("/agreement?t=EXAMPLE"),
        ref: "WR-EXAMPLE-20261029",
        reason: AGREEMENT_REASK_REASONS[0].message,
      };
      return { subject: agreementReaskSubject(), html: agreementReaskHtml(payload), text: agreementReaskText(payload) };
    },
  },
  {
    id: "agreement-received",
    name: "Signed agreement received",
    stage: "offer",
    when: "Sent automatically when a candidate uploads their signed agreement on their page.",
    kind: "reactive",
    source: "agreementReceivedHtml",
    render: () => {
      const payload = { fullName: SAMPLE_NAME, ref: "WR-EXAMPLE-20261029" };
      return { subject: agreementReceivedSubject(), html: agreementReceivedHtml(payload), text: agreementReceivedText(payload) };
    },
  },
  {
    id: "onboarding-chat",
    name: "Onboarding chat invitation",
    stage: "offer",
    when:
      "Sent by hand from View info → Agreement with Invite to onboarding chat, once the signed agreement is accepted. The link opens the live chat page (valid 7 days); in the chat you send the portal login and explain the portal. The “we’re live” and reminder emails for this chat say “onboarding chat” instead of “final interview”.",
    kind: "campaign",
    source: "onboardingChatHtml",
    render: () => {
      const payload = {
        fullName: SAMPLE_NAME,
        chatUrl: link("/chat?t=EXAMPLE"),
        position: SAMPLE_POSITION,
        hours: DEFAULT_HOURS,
        validDays: CHAT_LINK_TTL_DAYS,
      };
      return { subject: onboardingChatSubject(), html: onboardingChatHtml(payload), text: onboardingChatText(payload) };
    },
  },
  {
    id: "composed",
    name: "Your own email (Send email tab)",
    stage: "offer",
    when:
      "Written and sent by hand from the Send email tab, to one address at a time. The words, formatting and subject are yours; this shows the WorkRoute design around a sample message (a plain design without the logo and footer can be chosen instead).",
    kind: "campaign",
    source: "composedEmailHtml",
    render: () => {
      const subject = "A quick update about your application";
      const bodyHtml =
        '<div>Hi Amina,</div><div><br></div><div>Thank you for your patience. <strong>Your file is complete</strong> and our team will be in touch within the next few days.</div><div><br></div><div>Kind regards,<br>WorkRoute Recruitment Team</div>';
      return {
        subject,
        html: composedEmailHtml({ subject, bodyHtml, design: "workroute" }),
        text: "Hi Amina,\n\nThank you for your patience. Your file is complete and our team will be in touch within the next few days.\n\nKind regards,\nWorkRoute Recruitment Team",
      };
    },
  },

  /* ---------------------------------------------------------------- */
  /* Team portal                                                        */
  /* ---------------------------------------------------------------- */
  {
    id: "team-invite",
    name: "Welcome to the team — login details",
    stage: "team",
    when: "Sent when you add someone to the team (Accepted → Add to team, or Team → Add member), press Send login details again on their Team page, or Send portal login in an onboarding chat. Includes their professional email, a temporary password and their start date — and, until the account is active, that bank details are required to activate it.",
    kind: "reactive",
    source: "teamInviteHtml",
    render: () => {
      const e = {
        fullName: SAMPLE_NAME,
        workEmail: "amina.benali@workroute.team",
        tempPassword: "Kp7q-M4xR-a9zT",
        portalUrl: teamPortalUrl(),
        startDate: "Monday, 9 November 2026",
        needsActivation: true,
      };
      return { subject: teamInviteSubject(), html: teamInviteHtml(e), text: teamInviteText(e) };
    },
  },
  {
    id: "team-password-changed",
    name: "Password changed",
    stage: "team",
    when: "Sent to a member when they change their own portal password, so they know if it was not them.",
    kind: "reactive",
    source: "teamPasswordChangedHtml",
    render: () => {
      const e = { fullName: SAMPLE_NAME };
      return { subject: teamPasswordChangedSubject(), html: teamPasswordChangedHtml(e), text: teamPasswordChangedText(e) };
    },
  },
  {
    id: "team-ticket",
    name: "New ticket / new reply",
    stage: "team",
    when: "Sent when you send a member a ticket, and when you reply on one (replies at most one email every 10 minutes). The ticket itself is only shown in the portal.",
    kind: "reactive",
    source: "teamTicketHtml",
    render: () => {
      const e = { fullName: SAMPLE_NAME, number: 1042, subject: "Training session on Monday", kind: "new" as const, url: `${teamPortalUrl()}/tickets/EXAMPLE` };
      return { subject: teamTicketSubject(e), html: teamTicketHtml(e), text: teamTicketText(e) };
    },
  },
  {
    id: "team-phone",
    name: "New message on the work number",
    stage: "team",
    when: "Sent when you add a message to a member's Phone inbox (at most one email every 10 minutes). The message itself is only shown in the portal.",
    kind: "reactive",
    source: "teamPhoneHtml",
    render: () => {
      const e = { fullName: SAMPLE_NAME, url: `${teamPortalUrl()}/phone` };
      return { subject: teamPhoneSubject(), html: teamPhoneHtml(e), text: teamPhoneText(e) };
    },
  },
  {
    id: "team-mail",
    name: "New email in the portal mailbox",
    stage: "team",
    when: "Sent to the member's personal email when mail arrives at their @workroute.team address. The mail is in their Mail tab at once; this note is sent at most once every 10 minutes.",
    kind: "reactive",
    source: "teamMailAlertHtml",
    render: () => {
      const e = { fullName: SAMPLE_NAME, workEmail: "amina.diallo@workroute.team", url: `${teamPortalUrl()}/mail` };
      return { subject: teamMailAlertSubject(), html: teamMailAlertHtml(e), text: teamMailAlertText(e) };
    },
  },
  {
    id: "team-payment",
    name: "Payment sent",
    stage: "team",
    when: "Sent when you record a payment on Hours & pay with “Email them that it was sent” ticked.",
    kind: "reactive",
    source: "teamPaymentHtml",
    render: () => {
      const e = { fullName: SAMPLE_NAME, amount: "$520.00", date: "Fri 6 Nov 2026", sentTo: "Wise BE •••• 4821", reference: "Oct 2026", url: teamPortalUrl() };
      return { subject: teamPaymentSubject(e.amount), html: teamPaymentHtml(e), text: teamPaymentText(e) };
    },
  },
  {
    id: "team-bank",
    name: "Bank account approved / not approved",
    stage: "team",
    when: "Sent when you approve or refuse the bank details a member added or changed (Team → member → Bank). Approving a new member's first bank details activates their account, and this email then says so (shown here).",
    kind: "reactive",
    source: "teamBankHtml",
    render: () => {
      const e = { fullName: SAMPLE_NAME, approved: true, bank: "Revolut", masked: "LT •••• 8901", url: `${teamPortalUrl()}/`, activatedFrom: "Monday, 9 November 2026" };
      return { subject: teamBankSubject(true, true), html: teamBankHtml(e), text: teamBankText(e) };
    },
  },
  {
    id: "team-activated",
    name: "Account activated (by hand)",
    stage: "team",
    when: "Sent when you press Activate now on a member's Team page, to activate their account without approved bank details.",
    kind: "reactive",
    source: "teamActivatedHtml",
    render: () => {
      const e = { fullName: SAMPLE_NAME, countedFrom: "Monday, 9 November 2026", needsBank: true, url: `${teamPortalUrl()}/bank` };
      return { subject: teamActivatedSubject(), html: teamActivatedHtml(e), text: teamActivatedText(e) };
    },
  },
  {
    id: "team-dayoff",
    name: "Day off approved / not approved",
    stage: "team",
    when: "Sent when you answer a member's day-off request.",
    kind: "reactive",
    source: "teamDayOffHtml",
    render: () => {
      const e = { fullName: SAMPLE_NAME, approved: true, date: "Mon 16 Nov 2026", url: teamPortalUrl() };
      return { subject: teamDayOffSubject(true, e.date), html: teamDayOffHtml(e), text: teamDayOffText(e) };
    },
  },
];

export function catalogueEntry(id: string | undefined): CatalogueEntry {
  return EMAIL_CATALOGUE.find((e) => e.id === id) ?? EMAIL_CATALOGUE[0];
}

/**
 * Stop links inside the preview doing anything.
 *
 * The frame is sandboxed, which stops scripts and top-level navigation, but a
 * sandboxed frame may still navigate itself — and every link in these emails
 * points at the live site with a fake token, so a stray click would load an
 * "invalid link" page into the middle of the preview. One rule in the head,
 * which changes nothing about how the email looks.
 */
export function previewDocument(html: string): string {
  const guard = "<style>a{pointer-events:none!important}</style>";
  return html.includes("</head>") ? html.replace("</head>", `${guard}</head>`) : guard + html;
}
