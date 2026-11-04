/**
 * SERVER-ONLY HTML email templates.
 *
 * Email clients are not browsers. These templates therefore use table layout,
 * inline styles, and no external assets:
 *   - Outlook renders through Word, which ignores flexbox, grid and float.
 *   - Gmail strips <style> blocks in several contexts, so every rule is inline.
 *   - Remote images are blocked by default, so the logo is drawn with styled
 *     table cells rather than an <img>.
 * Every message also ships a plain-text part, which some corporate filters
 * require and which raises deliverability.
 *
 * The 600-pixel column is `width:100%; max-width:600px`, never the other way
 * round. `width:600px; max-width:100%` reads as responsive and is not: a table
 * inside a cell makes the cell as wide as the table, so "100%" of that cell is
 * 600 pixels plus its padding, and every email came out 632 pixels wide on a
 * 375-pixel phone — shrunk to unreadable on an iPhone, scrolled sideways in
 * Gmail, with the pay and start date cut off the right of the offer. Most
 * candidates read these on a phone.
 *
 * Outlook on Windows ignores max-width, so it would stretch that column to the
 * full reading pane. The `<!--[if mso]>` table around it gives Outlook, and
 * only Outlook, a fixed 600 pixels; every other client skips it as a comment.
 */
import { siteConfig } from "@/config/site";
import {
  LIVE_REASON_SUBJECT,
  type LiveVerificationReason,
} from "@/lib/liveVerification";

const NAVY = "#0f1035";
const AMBER = "#f5a623";
const CREAM = "#faf9f5";
const BORDER = "#eae7db";
const MUTED = "#4f4f80";

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

export interface InterviewInvite {
  fullName: string;
  interviewUrl: string;
  position?: string;
}

/**
 * Subject line for the assessment invitation.
 *
 * Deliberately does not name the role. "Customer Support Representative" is 31
 * characters on its own, which pushed the subject past 55 and got it cut off
 * on a phone — where most candidates read it. The role is named in the first
 * line of the email instead, where there is room for it.
 *
 * Leads with the verb so the inbox line says what to do, and carries the
 * company name so it is recognisable next to every other application they have
 * open.
 */
export function interviewInviteSubject(_position?: string): string {
  return `Complete your ${siteConfig.company.name} online assessment`;
}

/** Plain-text part. Kept readable on its own, not a stripped-tag afterthought. */
export function interviewInviteText({ fullName, interviewUrl, position }: InterviewInvite): string {
  const name = firstNameOf(fullName);
  return [
    `Hi ${name},`,
    ``,
    `Thank you for applying to ${siteConfig.company.name}${position ? ` for the ${position} role` : ""}.`,
    ``,
    `The next step is a short online assessment. It takes about 20-30 minutes and`,
    `covers customer-service scenarios, communication, and a few questions about`,
    `how you approach the work.`,
    ``,
    `Start your assessment:`,
    interviewUrl,
    ``,
    `Before you begin:`,
    `- Set aside a quiet 30 minutes; the assessment cannot be paused.`,
    `- You cannot return to a previous section, so read each question carefully.`,
    `- The link is personal to you. Please do not share it.`,
    `- It can only be used once.`,
    ``,
    `Once you submit, our recruitment team will review your answers and contact`,
    `you about the next steps.`,
    ``,
    `If you have questions, reply to this email or write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

/** HTML part. */
export function interviewInviteHtml({ fullName, interviewUrl, position }: InterviewInvite): string {
  const name = esc(firstNameOf(fullName));
  const url = esc(interviewUrl);
  const company = esc(siteConfig.company.name);
  const role = position ? ` for the <strong>${esc(position)}</strong> role` : "";

  const tip = (text: string) => `
    <tr>
      <td style="padding:0 0 10px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
        <span style="color:${AMBER};font-weight:700;">&bull;</span>&nbsp; ${text}
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(interviewInviteSubject(position))}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<!-- Preheader: shown in the inbox preview, hidden in the body. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your assessment link is inside — it takes about 20-30 minutes.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">

  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <!-- Header -->
    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
              ${company}
            </td>
          </tr>
          <tr>
            <td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">
              ${esc(siteConfig.company.descriptor)}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Card -->
    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          You're invited to complete your assessment
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Thank you for applying to ${company}${role}. We've received your application, and
          the next step is a short online assessment.
        </p>

        <p style="margin:0 0 26px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          It takes about <strong style="color:${NAVY};">20&ndash;30 minutes</strong> and covers
          customer-service scenarios, communication, and how you approach the work.
        </p>

        <!-- Button -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}"
                 style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Start your assessment
              </a>
            </td>
          </tr>
        </table>

        <!-- Before you begin -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 12px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                Before you begin
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${tip("Set aside a quiet 30 minutes &mdash; the assessment cannot be paused.")}
                ${tip("You cannot return to a previous section, so read each question carefully.")}
                ${tip("This link is personal to you. Please do not share it.")}
                ${tip("It can only be used once.")}
              </table>
            </td>
          </tr>
        </table>

        <p style="margin:24px 0 0 0;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Once you submit, our recruitment team will review your answers and contact you
          about the next steps.
        </p>

        <p style="margin:20px 0 0 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
        <br><br>
        You received this because you applied for a role at ${company}.
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Subject for the reminder chasing an unfinished assessment.
 *
 * Deliberately echoes the invitation — same verb, same company, prefixed with
 * "Reminder" — so the two read as one thread rather than two unrelated emails.
 * The role is left out for the same reason as the invitation: it does not fit.
 */
export function reminderSubject(_position?: string): string {
  return `Reminder: complete your ${siteConfig.company.name} assessment`;
}

/** Plain-text part of the reminder. */
export function reminderText({ fullName, interviewUrl, position }: InterviewInvite): string {
  const name = firstNameOf(fullName);
  return [
    `Hi ${name},`,
    ``,
    `We noticed you haven't completed your online assessment${position ? ` for the ${position} role` : ""} yet.`,
    ``,
    `Your place is still open and your link still works:`,
    interviewUrl,
    ``,
    `It takes about 20-30 minutes. Once you submit, our recruitment team will`,
    `review your answers and get back to you about next steps.`,
    ``,
    `If you would rather not continue, that is completely fine — just reply to`,
    `this email and let us know, and we will close your application.`,
    ``,
    `Any questions, write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

/**
 * HTML part of the reminder.
 *
 * Shorter and lighter than the invitation on purpose. The candidate has
 * already had the full explanation; repeating it makes the second message feel
 * like the first one failed to land. The offer to withdraw is deliberate too —
 * it gives a disengaged candidate an easy exit instead of silence, which keeps
 * the pipeline honest and stops the recruiter chasing someone who is gone.
 */
export function reminderHtml({ fullName, interviewUrl, position }: InterviewInvite): string {
  const name = esc(firstNameOf(fullName));
  const url = esc(interviewUrl);
  const company = esc(siteConfig.company.name);
  const role = position ? ` for the <strong>${esc(position)}</strong> role` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(reminderSubject(position))}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your assessment link is still active — it takes about 20-30 minutes.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Your assessment is still waiting
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          We noticed you haven't completed your online assessment${role} yet. Your place is
          still open, and your link still works.
        </p>

        <p style="margin:0 0 26px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          It takes about <strong style="color:${NAVY};">20&ndash;30 minutes</strong>. Once you
          submit, our recruitment team will review your answers and get back to you.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Complete your assessment
              </a>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:18px 22px;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
              Changed your mind? That's completely fine &mdash; just reply to this email and
              we'll close your application, no hard feelings.
            </td>
          </tr>
        </table>

        <p style="margin:20px 0 0 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Asking a candidate to verify their identity.
 *
 * Sent only when a recruiter presses Request verification on someone whose
 * country is not on the list — everyone on the list is asked in the browser,
 * straight after their assessment, and never needs an email.
 *
 * The tone matters more here than in any other message we send. Being asked
 * for a passport out of the blue, by email, is exactly what a recruitment scam
 * looks like, so this says plainly what is wanted, why, and what happens to
 * the pictures — and sends them to the same link they already used, rather
 * than to a new address they have no reason to trust.
 */
export function verificationRequestSubject(): string {
  return `Confirm your identity to continue with ${siteConfig.company.name}`;
}

/** Plain-text part of the verification request. */
export function verificationRequestText({ fullName, interviewUrl, position }: InterviewInvite): string {
  const name = firstNameOf(fullName);
  return [
    `Hi ${name},`,
    ``,
    `Thank you for completing your assessment${position ? ` for the ${position} role` : ""}.`,
    ``,
    `Before we take your application further, we need to confirm you are who`,
    `you say you are. Please open your link below and upload two photographs:`,
    ``,
    `  1. Your passport, national ID card or driver's licence`,
    `  2. A photo of you holding it, with your face and the document both visible`,
    ``,
    interviewUrl,
    ``,
    `It takes about a minute from a phone.`,
    ``,
    `Your photographs are stored privately, seen only by our recruitment team,`,
    `and used only to confirm your identity. We never share them with anyone`,
    `else, and we will never ask you for a payment, a bank card, or a password.`,
    ``,
    `Any questions, write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

/** HTML part of the verification request. */
export function verificationRequestHtml({ fullName, interviewUrl, position }: InterviewInvite): string {
  const name = esc(firstNameOf(fullName));
  const url = esc(interviewUrl);
  const company = esc(siteConfig.company.name);
  const role = position ? ` for the <strong>${esc(position)}</strong> role` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(verificationRequestSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Two photographs, about a minute from your phone.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          One last step: confirm your identity
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Thank you for completing your assessment${role}. Before we take your application
          further, we need to confirm your identity.
        </p>

        <p style="margin:0 0 12px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Open your link and upload two photographs:
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px 0;">
          <tr>
            <td style="padding:0 0 10px 0;font:400 16px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
              <strong style="color:${NAVY};">1.</strong>&nbsp; Your passport, national ID card or driver's licence
            </td>
          </tr>
          <tr>
            <td style="font:400 16px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
              <strong style="color:${NAVY};">2.</strong>&nbsp; A photo of you holding it, with your face and the document both visible
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Confirm my identity
              </a>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:18px 22px;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
              Your photographs are stored privately, seen only by our recruitment team, and used
              only to confirm your identity. We will <strong style="color:${NAVY};">never</strong>
              ask you for a payment, a bank card, or a password.
            </td>
          </tr>
        </table>

        <p style="margin:20px 0 0 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export interface IdentityReuploadEmail {
  fullName: string;
  /** Where the upload step is — their offer link, or their assessment link. */
  url: string;
  /** What was wrong, in the recruiter's words. Shown verbatim. */
  reason: string;
}

/**
 * Asking someone to send their identity photographs again.
 *
 * A separate message from the first request, because the first one opens by
 * thanking them for finishing their assessment — which to someone who has
 * already accepted an offer reads as though we have lost track of them.
 *
 * The reason is the whole message. "Your documents were not accepted, please
 * try again" produces the same photograph a second time and a reply asking
 * what was wrong; saying it was too dark to read produces a better photograph.
 * It also says plainly that nothing else has changed about their offer —
 * being asked for a passport twice is unsettling enough without wondering
 * whether the job is still there.
 */
export function identityReuploadSubject(): string {
  return `Identity Verification Unsuccessful – ${siteConfig.company.name}`;
}

export function identityReuploadText({ fullName, url, reason }: IdentityReuploadEmail): string {
  const name = firstNameOf(fullName);
  return [
    `Hi ${name},`,
    ``,
    `We were not able to use the identity photographs you sent us, so we need`,
    `to ask you for them one more time.`,
    ``,
    `What we need you to fix:`,
    ``,
    reason,
    ``,
    `Please open your link and send them again:`,
    ``,
    url,
    ``,
    `We accept a passport, a national identity card or a driver's licence. For`,
    `an identity card or a driver's licence we need both sides, as two separate`,
    `photos. You will also be asked for a photo of you holding the document.`,
    ``,
    `Nothing else has changed and there is nothing wrong with your application.`,
    `It takes about a minute from a phone.`,
    ``,
    `Your photographs are stored privately, seen only by our recruitment team,`,
    `and used only to confirm your identity. We will never ask you for a`,
    `payment, a bank card, or a password.`,
    ``,
    `Any questions, write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function identityReuploadHtml({ fullName, url, reason }: IdentityReuploadEmail): string {
  const name = esc(firstNameOf(fullName));
  const href = esc(url);
  const company = esc(siteConfig.company.name);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(identityReuploadSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  One more minute from your phone — nothing else has changed.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Identity verification unsuccessful
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 20px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          We were not able to use the identity photographs you sent us, so we need to ask you
          for them one more time.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;margin:0 0 24px 0;">
          <tr>
            <td style="padding:18px 22px;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${NAVY};">
              ${esc(reason)}
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${href}" style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Send my photos again
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 12px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          We accept a <strong style="color:${NAVY};">passport</strong>, a
          <strong style="color:${NAVY};">national identity card</strong> or a
          <strong style="color:${NAVY};">driver's licence</strong>. For a card or a licence we
          need both sides, as two separate photos. You will also be asked for a photo of you
          holding the document.
        </p>

        <p style="margin:0 0 22px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Nothing else has changed and there is nothing wrong with your application.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:18px 22px;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
              Your photographs are stored privately, seen only by our recruitment team, and used
              only to confirm your identity. We will <strong style="color:${NAVY};">never</strong>
              ask you for a payment, a bank card, or a password.
            </td>
          </tr>
        </table>

        <p style="margin:20px 0 0 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${href}" style="color:#b06e0c;word-break:break-all;">${href}</a>
        </p>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Proof of residence                                                          */
/* -------------------------------------------------------------------------- */

export interface ResidenceRequestEmail {
  fullName: string;
  /** Where the upload step is — their offer link, or their assessment link. */
  url: string;
  /** Why we are asking, in the recruiter's words. Shown verbatim. */
  reason: string;
  /** The country they are being asked to prove they live in. */
  country?: string;
}

/** "China residence permit", … — or plain names when the country is unknown. */
function residenceDocNames(country?: string): string[] {
  return ["residence permit", "national ID card", "driving licence"].map((d) =>
    country ? `${country} ${d}` : d.charAt(0).toUpperCase() + d.slice(1),
  );
}

/**
 * Asking somebody to prove they live where they say they live.
 *
 * The hardest email in the set to write, because the honest version of the
 * subject is "we cannot tell whether you really live there" and nobody
 * receiving that feels well treated. So it leads with the reason it is being
 * asked — the agreement carries their address — which is true, is the actual
 * motivation, and is a thing a person can agree is reasonable.
 *
 * It is careful to say the situation is normal. Someone with an Indian
 * passport living in China has done nothing unusual and nothing wrong, and by
 * this point they have been offered a job; an email that reads as an
 * accusation at that moment loses people who would have been fine.
 *
 * What it asks for: the front and back of a residence permit, national ID or
 * driving licence issued by the country they live in. It does not have to
 * show an address — it only has to show they live in that country.
 *
 * Required — there is no "I have none" route any more — and each document is
 * named with their country ("China residence permit"), so nobody sends one
 * from the wrong country.
 */
export function residenceRequestSubject(): string {
  return `One more document before your agreement – ${siteConfig.company.name}`;
}

export function residenceRequestText({
  fullName,
  url,
  reason,
  country,
}: ResidenceRequestEmail): string {
  const name = firstNameOf(fullName);
  const docs = residenceDocNames(country);
  return [
    `Hi ${name},`,
    ``,
    `Before we can prepare your written agreement we need to confirm the`,
    `country you live in.`,
    ``,
    reason,
    ``,
    `What we need — the front and the back of one of these${country ? "" : ", issued by the country you live in"}:`,
    ``,
    ...docs.map((d) => `  - ${d}`),
    ``,
    `Please open your link and send them:`,
    ``,
    url,
    ``,
    `This is a normal step and nothing has gone wrong with your application.`,
    `Your documents are stored privately, seen only by our recruitment team,`,
    `and used only to confirm where you live. We will never ask you for a`,
    `payment, a bank card, or a password.`,
    ``,
    `Any questions, write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function residenceRequestHtml({
  fullName,
  url,
  reason,
  country,
}: ResidenceRequestEmail): string {
  const name = esc(firstNameOf(fullName));
  const href = esc(url);
  const company = esc(siteConfig.company.name);
  const docs = residenceDocNames(country).map(esc);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(residenceRequestSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Two photos from your phone — the front and back of your ID — to confirm the country you live in.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          One more document before your agreement
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 20px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Before we can prepare your written agreement we need to confirm the country you
          live in.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;margin:0 0 24px 0;">
          <tr>
            <td style="padding:18px 22px;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${NAVY};">
              ${esc(reason)}
            </td>
          </tr>
        </table>

        <p style="margin:0 0 8px 0;font:700 16px/1.6 Arial,Helvetica,sans-serif;color:${NAVY};">
          What we need
        </p>
        <p style="margin:0 0 10px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          A photo of the <strong style="color:${NAVY};">front</strong> and the
          <strong style="color:${NAVY};">back</strong> of one of these${country ? "" : ", issued by the country you live in"}:
        </p>
        <p style="margin:0 0 22px 0;font:400 16px/1.8 Arial,Helvetica,sans-serif;color:${MUTED};">
          ${docs.map((d) => `<span style="color:${AMBER};font-weight:700;">&bull;</span>&nbsp; ${d}`).join("<br>\n          ")}
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${href}" style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Send my documents
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 22px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          This is a normal step and nothing has gone wrong with your application.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:18px 22px;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
              Your documents are stored privately, seen only by our recruitment team, and used
              only to confirm where you live. We will <strong style="color:${NAVY};">never</strong>
              ask you for a payment, a bank card, or a password.
            </td>
          </tr>
        </table>

        <p style="margin:20px 0 0 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${href}" style="color:#b06e0c;word-break:break-all;">${href}</a>
        </p>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Final interview — live chat                                                 */
/* -------------------------------------------------------------------------- */

export interface FinalChatEmail {
  fullName: string;
  /** The candidate's personal chat link. */
  chatUrl: string;
  position?: string;
  /** The hours line from the chat settings, e.g. "We reply Monday–Friday, …". */
  hours?: string;
  /** How long the link lasts, in days. */
  validDays: number;
}

/** The hours line as a sentence: one full stop, however it was typed in Settings. */
function hoursSentence(hours: string): string {
  const trimmed = hours.trim().replace(/[.\s]+$/, "");
  return trimmed ? `${trimmed}.` : "";
}

/**
 * The invitation to the final interview, held as a live text chat.
 *
 * Says what it is before asking anybody to click: a chat, in writing, with a
 * person, at a time they choose within the hours. A "final interview" link from
 * a remote employer is a well-worn scam opening, so the email says plainly what
 * will and will not happen in it — no video, no downloads, no payment — and the
 * button comes after that.
 */
export function finalChatSubject(): string {
  return `Your final interview — live chat with ${siteConfig.company.name}`;
}

export function finalChatText(e: FinalChatEmail): string {
  const name = firstNameOf(e.fullName);
  return [
    `Hi ${name},`,
    ``,
    `Good news — you have reached the final stage of our hiring process${e.position ? ` for the ${e.position} role` : ""}.`,
    ``,
    `Your final interview is a short live text chat with our recruitment team.`,
    `There is no video or phone call: you answer our questions in writing, in`,
    `your own words.`,
    ``,
    `HOW IT WORKS`,
    `1. Open your chat link below when you are ready.`,
    `2. Press "Start chat" — a recruiter will join you shortly.`,
    `3. Answer a few questions. It usually takes 15–20 minutes.`,
    ...(e.hours && hoursSentence(e.hours) ? [``, hoursSentence(e.hours)] : []),
    ``,
    `Start your final interview chat:`,
    e.chatUrl,
    ``,
    `This link is personal to you and stays valid for ${e.validDays} days.`,
    ``,
    `Tips: find a quiet place with a stable internet connection, and answer`,
    `honestly in your own words.`,
    ``,
    `WE WILL NEVER ASK YOU FOR a payment of any kind, your bank card details or a`,
    `password — not in this chat and not anywhere else. If anybody does in our`,
    `name, it did not come from us.`,
    ``,
    `Any questions, reply to this email or write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function finalChatHtml(e: FinalChatEmail): string {
  const name = esc(firstNameOf(e.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(e.chatUrl);
  const role = e.position ? ` for the <strong style="color:${NAVY};">${esc(e.position)}</strong> role` : "";

  const step = (n: number, text: string) => `
    <tr>
      <td width="34" valign="top" style="padding:0 0 12px 0;">
        <span style="display:inline-block;width:24px;height:24px;border-radius:12px;background:${AMBER};color:${NAVY};font:700 13px/24px Arial,Helvetica,sans-serif;text-align:center;">${n}</span>
      </td>
      <td valign="top" style="padding:2px 0 12px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">${text}</td>
    </tr>`;

  const bullet = (text: string) => `
    <tr>
      <td style="padding:0 0 8px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
        <span style="color:${AMBER};font-weight:700;">&bull;</span>&nbsp; ${text}
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(finalChatSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  You have reached the final stage — start your live chat interview whenever you are ready.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Your final interview
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Good news &mdash; you have reached the <strong style="color:${NAVY};">final stage</strong>
          of our hiring process${role}.
        </p>

        <p style="margin:0 0 24px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Your final interview is a short <strong style="color:${NAVY};">live text chat</strong>
          with our recruitment team. There is no video or phone call &mdash; you answer our
          questions in writing, in your own words.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:0 0 24px 0;">
          <tr>
            <td style="padding:20px 22px 8px 22px;">
              <p style="margin:0 0 14px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                How it works
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${step(1, "Open your chat link below when you are ready.")}
                ${step(2, "Press <strong style=\"color:" + NAVY + ";\">Start chat</strong> &mdash; a recruiter will join you shortly.")}
                ${step(3, "Answer a few questions. It usually takes 15&ndash;20 minutes.")}
              </table>
            </td>
          </tr>
        </table>

        ${
          e.hours && hoursSentence(e.hours)
            ? `<p style="margin:0 0 22px 0;font:700 15px/1.55 Arial,Helvetica,sans-serif;color:${NAVY};">
          &#128339;&nbsp; ${esc(hoursSentence(e.hours))}
        </p>`
            : ""
        }

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 36px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Start my final interview chat
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          This link is personal to you and stays valid for ${e.validDays} days.
        </p>
        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
          Before you start
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
          ${bullet("Find a quiet place with a stable internet connection.")}
          ${bullet("Answer honestly and in your own words &mdash; there are no trick questions.")}
          ${bullet("Keep the page open during the chat. If you close it, the same link brings you back.")}
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;">
          <tr>
            <td style="padding:18px 22px;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
              <strong style="color:${NAVY};">We will never ask you for</strong> a payment of any kind,
              your bank card details or a password &mdash; not in this chat and not anywhere else.
              If anybody does in our name, it did not come from us.
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Onboarding — live chat after the signed agreement                           */
/* -------------------------------------------------------------------------- */

export interface OnboardingChatEmail {
  fullName: string;
  chatUrl: string;
  position?: string;
  hours?: string;
  validDays: number;
}

/**
 * After the signed agreement is accepted: an invitation to a live chat in
 * which the team emails the portal login and shows them round. Says first
 * that the password comes by email, never in the chat — a "send us your
 * password" chat is the scam this must not look like.
 */
export function onboardingChatSubject(): string {
  return `Welcome to ${siteConfig.company.name} — let's get you started`;
}

export function onboardingChatText(e: OnboardingChatEmail): string {
  const name = firstNameOf(e.fullName);
  return [
    `Hi ${name},`,
    ``,
    `Welcome to ${siteConfig.company.name}! Thank you for signing your agreement${e.position ? ` for the ${e.position} role` : ""}.`,
    ``,
    `The next step is a short live text chat with our team. In the chat we:`,
    `1. email you the login for your WorkRoute team portal`,
    `   (your professional email and a temporary password),`,
    `2. help you sign in and choose your own password,`,
    `3. show you round the portal: Mail, Tickets, Phone, Bank details and Profile.`,
    `It takes about 10 minutes.`,
    ...(e.hours && hoursSentence(e.hours) ? [``, hoursSentence(e.hours)] : []),
    ``,
    `Start your onboarding chat:`,
    e.chatUrl,
    ``,
    `This link is personal to you and stays valid for ${e.validDays} days.`,
    `Keep this inbox open during the chat — your login details arrive here.`,
    ``,
    `Your password is sent by email only. We will never ask you for it in the chat,`,
    `and we will never ask you for a payment or your bank card details.`,
    ``,
    `Any questions, reply to this email or write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function onboardingChatHtml(e: OnboardingChatEmail): string {
  const name = esc(firstNameOf(e.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(e.chatUrl);
  const role = e.position ? ` for the <strong style="color:${NAVY};">${esc(e.position)}</strong> role` : "";

  const step = (n: number, text: string) => `
    <tr>
      <td width="34" valign="top" style="padding:0 0 12px 0;">
        <span style="display:inline-block;width:24px;height:24px;border-radius:12px;background:${AMBER};color:${NAVY};font:700 13px/24px Arial,Helvetica,sans-serif;text-align:center;">${n}</span>
      </td>
      <td valign="top" style="padding:2px 0 12px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">${text}</td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(onboardingChatSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your onboarding chat: we send your team portal login and show you how everything works.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <p style="margin:0 0 14px 0;">
          <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:#e8f7ee;color:#166534;font:700 12px/1 Arial,Helvetica,sans-serif;letter-spacing:0.5px;">
            &#10003;&nbsp; Agreement accepted
          </span>
        </p>

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Welcome to ${company}
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Thank you for signing your agreement${role}. We are happy to have you on the team.
        </p>

        <p style="margin:0 0 24px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          The next step is a short <strong style="color:${NAVY};">live text chat</strong> with our team
          to set up your <strong style="color:${NAVY};">WorkRoute team portal</strong>.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:0 0 24px 0;">
          <tr>
            <td style="padding:20px 22px 8px 22px;">
              <p style="margin:0 0 14px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                In the chat we
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${step(1, "Email you your portal login: your <strong style=\"color:" + NAVY + ";\">professional email</strong> and a temporary password.")}
                ${step(2, "Help you sign in and choose your own password.")}
                ${step(3, "Show you round the portal: Mail, Tickets, Phone, Bank details and Profile. About 10 minutes.")}
              </table>
            </td>
          </tr>
        </table>

        ${
          e.hours && hoursSentence(e.hours)
            ? `<p style="margin:0 0 22px 0;font:700 15px/1.55 Arial,Helvetica,sans-serif;color:${NAVY};">
          &#128339;&nbsp; ${esc(hoursSentence(e.hours))}
        </p>`
            : ""
        }

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 36px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Start my onboarding chat
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          This link is personal to you and stays valid for ${e.validDays} days. Keep this inbox open
          during the chat &mdash; your login details arrive here.
        </p>
        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;">
          <tr>
            <td style="padding:18px 22px;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
              <strong style="color:${NAVY};">Your password is sent by email only.</strong> We will never
              ask you for it in the chat, and we will never ask you for a payment or your bank card details.
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Follow-up chat — after the interview                                         */
/* -------------------------------------------------------------------------- */

export interface FollowupChatEmail {
  fullName: string;
  chatUrl: string;
  /** Why we ask, in one or two sentences. */
  reason: string;
  hours?: string;
  validDays: number;
}

/**
 * For somebody whose interview chat has ended, when we need a little more
 * from them. Says why before asking them to click, and what will not happen.
 */
export function followupChatSubject(): string {
  return `A quick follow-up chat with ${siteConfig.company.name}`;
}

export function followupChatText(e: FollowupChatEmail): string {
  const name = firstNameOf(e.fullName);
  return [
    `Hi ${name},`,
    ``,
    `Thank you again for your interview chat with us. We need a little more`,
    `information from you before we continue:`,
    ``,
    `  ${e.reason}`,
    ``,
    `It is a short live text chat with our recruitment team — no video and no phone`,
    `call. It only takes a few minutes.`,
    ...(e.hours && hoursSentence(e.hours) ? [``, hoursSentence(e.hours)] : []),
    ``,
    `Start your follow-up chat:`,
    e.chatUrl,
    ``,
    `This link is personal to you and stays valid for ${e.validDays} days.`,
    ``,
    `WE WILL NEVER ASK YOU FOR a payment of any kind, your bank card details or a`,
    `password — not in this chat and not anywhere else.`,
    ``,
    `Any questions, reply to this email or write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function followupChatHtml(e: FollowupChatEmail): string {
  const name = esc(firstNameOf(e.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(e.chatUrl);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(followupChatSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  We need a little more information from you — a short live chat, a few minutes.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          A quick follow-up chat
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Thank you again for your interview chat with us. We need a little more information from
          you before we continue:
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-left:4px solid ${AMBER};border-radius:10px;margin:0 0 20px 0;">
          <tr>
            <td style="padding:16px 20px;font:700 15px/1.55 Arial,Helvetica,sans-serif;color:${NAVY};">
              ${esc(e.reason)}
            </td>
          </tr>
        </table>

        <p style="margin:0 0 24px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          It is a short <strong style="color:${NAVY};">live text chat</strong> with our recruitment
          team &mdash; no video and no phone call. It only takes a few minutes.
        </p>

        ${
          e.hours && hoursSentence(e.hours)
            ? `<p style="margin:0 0 22px 0;font:700 15px/1.55 Arial,Helvetica,sans-serif;color:${NAVY};">
          &#128339;&nbsp; ${esc(hoursSentence(e.hours))}
        </p>`
            : ""
        }

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 36px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Start my follow-up chat
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          This link is personal to you and stays valid for ${e.validDays} days.
        </p>
        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;">
          <tr>
            <td style="padding:18px 22px;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
              <strong style="color:${NAVY};">We will never ask you for</strong> a payment of any kind,
              your bank card details or a password &mdash; not in this chat and not anywhere else.
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Final interview — "our team is live now"                                    */
/* -------------------------------------------------------------------------- */

export interface ChatLiveNowEmail {
  fullName: string;
  /** Their chat link, marked so the page can tell the recruiter they came. */
  chatUrl: string;
  /** A fresh link replacing an expired one: say so, and how long it lasts. */
  newLink?: boolean;
  validDays: number;
  /** For an onboarding chat: "your onboarding chat", not "your final interview". */
  onboarding?: boolean;
  /** For a follow-up chat. */
  followup?: boolean;
}

/** Which chat a reminder is about — onboarding, follow-up, or the interview. */
type ChatEmailKind = "interview" | "onboarding" | "followup";
function chatEmailKind(e: { onboarding?: boolean; followup?: boolean }): ChatEmailKind {
  return e.onboarding ? "onboarding" : e.followup ? "followup" : "interview";
}
function kindArg(k: boolean | ChatEmailKind): ChatEmailKind {
  return k === true ? "onboarding" : k === false ? "interview" : k;
}

/**
 * Sent by hand from the Live chat tab or View info, when the recruiter is there
 * and the candidate is not. Short on purpose: they already had the invitation,
 * and this only has to say "now" and give them the button.
 */
export function chatLiveNowSubject(kind: boolean | ChatEmailKind = "interview"): string {
  const k = kindArg(kind);
  return k === "onboarding"
    ? "Our team is live now — join your onboarding chat"
    : k === "followup"
      ? "Our recruitment team is live now — join your follow-up chat"
      : "Our recruitment team is live now — join your final interview chat";
}

export function chatLiveNowText(e: ChatLiveNowEmail): string {
  const name = firstNameOf(e.fullName);
  return [
    `Hi ${name},`,
    ``,
    ...(e.onboarding
      ? [
          `Our team is online right now and ready for your onboarding chat. Click the`,
          `link below to join — we send your portal login and show you round (about 10 minutes).`,
        ]
      : e.followup
        ? [
            `Our recruitment team is online right now and ready for your follow-up chat.`,
            `Click the link below to join — it only takes a few minutes.`,
          ]
        : [
          `Our recruitment team is online right now and ready for your final interview`,
          `chat. Click the link below to join — it takes about 15–20 minutes.`,
        ]),
    ``,
    `Join the chat now:`,
    e.chatUrl,
    ``,
    e.newLink
      ? `This is a new personal link, valid for ${e.validDays} days. Your earlier chat link no longer works.`
      : `This is your same personal chat link as before.`,
    ``,
    `If now is not a good moment, you can use the same link later.`,
    ``,
    `We will never ask you for a payment of any kind, your bank card details or a password.`,
    ``,
    `Any questions, reply to this email or write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function chatLiveNowHtml(e: ChatLiveNowEmail): string {
  const name = esc(firstNameOf(e.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(e.chatUrl);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(chatLiveNowSubject(chatEmailKind(e)))}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${e.onboarding ? "Our team is online right now — join your onboarding chat." : e.followup ? "A recruiter is online right now — join your follow-up chat." : "A recruiter is online right now — join your final interview chat."}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <p style="margin:0 0 14px 0;">
          <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:#e8f7ee;color:#166534;font:700 12px/1 Arial,Helvetica,sans-serif;letter-spacing:0.5px;">
            &#9679;&nbsp; Live now
          </span>
        </p>

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          ${e.onboarding ? "Our team is live now" : "Our recruitment team is live now"}
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 26px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          ${
            e.onboarding
              ? `Our team is <strong style="color:${NAVY};">online right now</strong> and ready for your
          onboarding chat. Click the button below to join &mdash; we send your portal login and show
          you round (about 10 minutes).`
              : e.followup
                ? `Our recruitment team is <strong style="color:${NAVY};">online right now</strong> and ready
          for your follow-up chat. Click the button below to join &mdash; it only takes a few minutes.`
                : `Our recruitment team is <strong style="color:${NAVY};">online right now</strong> and ready
          for your final interview chat. Click the button below to join &mdash; it takes about
          15&ndash;20 minutes.`
          }
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 36px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Join the chat now
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          ${
            e.newLink
              ? `This is a new personal link, valid for ${e.validDays} days. Your earlier chat link no longer works.`
              : "This is your same personal chat link as before. If now is not a good moment, you can use it later."
          }
        </p>
        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
              <strong style="color:${NAVY};">We will never ask you for</strong> a payment of any kind,
              your bank card details or a password.
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Final interview — "you have not started yet" reminder                       */
/* -------------------------------------------------------------------------- */

export interface ChatReminderEmail {
  fullName: string;
  /** Their chat link, marked so the page can tell the recruiter they came. */
  chatUrl: string;
  /** The hours line from the chat settings. */
  hours?: string;
  /** "7 October" — the last day the link works. */
  validUntil: string;
  /** A fresh link replacing an expired one. */
  newLink?: boolean;
  /** For an onboarding chat. */
  onboarding?: boolean;
  /** For a follow-up chat. */
  followup?: boolean;
}

/**
 * For somebody who was sent the chat link and never started. Not "we're live":
 * nobody is promised a recruiter this minute — they are told the chat is still
 * waiting for them, and when the team answers.
 */
export function chatReminderSubject(kind: boolean | ChatEmailKind = "interview"): string {
  const k = kindArg(kind);
  return k === "onboarding"
    ? "Reminder: your onboarding chat is waiting"
    : k === "followup"
      ? "Reminder: your follow-up chat is waiting"
      : "Reminder: your final interview chat is waiting";
}

export function chatReminderText(e: ChatReminderEmail): string {
  const name = firstNameOf(e.fullName);
  const hours = e.hours ? hoursSentence(e.hours) : "";
  return [
    `Hi ${name},`,
    ``,
    ...(e.onboarding
      ? [
          `We sent you a link to your onboarding chat, but you haven't started it yet.`,
          `In the chat we send your team portal login and show you how it works (about`,
          `10 minutes). Open it whenever you're ready${hours ? ` during our hours. ${hours}` : "."}`,
          ``,
          `Start my onboarding chat:`,
        ]
      : e.followup
        ? [
            `We sent you a link to a short follow-up chat with our recruitment team, but you`,
            `haven't started it yet. It only takes a few minutes. Open it whenever you're ready${hours ? ` during our hours. ${hours}` : "."}`,
            ``,
            `Start my follow-up chat:`,
          ]
        : [
          `We sent you a link to your final interview chat, but you haven't started it yet.`,
          `It's a short written chat with our team (about 15–20 minutes) — no video and no`,
          `phone call. Open it whenever you're ready${hours ? ` during our hours. ${hours}` : "."}`,
          ``,
          `Start my final interview chat:`,
        ]),
    e.chatUrl,
    ``,
    e.newLink
      ? `This is a new personal link, valid until ${e.validUntil}. Your earlier chat link no longer works.`
      : `This is your same personal chat link, valid until ${e.validUntil}.`,
    ``,
    `We will never ask you for a payment of any kind, your bank card details or a password.`,
    ``,
    `Any questions, reply to this email or write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function chatReminderHtml(e: ChatReminderEmail): string {
  const name = esc(firstNameOf(e.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(e.chatUrl);
  const hours = e.hours ? hoursSentence(e.hours) : "";
  const chat = e.onboarding ? "onboarding chat" : e.followup ? "follow-up chat" : "final interview chat";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(chatReminderSubject(chatEmailKind(e)))}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your ${chat} is still waiting — start it whenever you are ready.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Your ${chat} is waiting
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          We sent you a link to your ${chat}, but you haven&rsquo;t started it yet.
        </p>

        <p style="margin:0 0 ${hours ? "16" : "26"}px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          ${
            e.onboarding
              ? `In the chat we send your <strong style="color:${NAVY};">team portal login</strong> and show
          you how it works (about 10 minutes). Open it whenever you&rsquo;re ready${hours ? " during our hours:" : "."}`
              : e.followup
                ? `It&rsquo;s a short <strong style="color:${NAVY};">written chat</strong> with our recruitment
          team &mdash; it only takes a few minutes. Open it whenever you&rsquo;re ready${hours ? " during our hours:" : "."}`
                : `It&rsquo;s a short <strong style="color:${NAVY};">written chat</strong> with our team
          (about 15&ndash;20 minutes) &mdash; no video and no phone call. Open it whenever you&rsquo;re
          ready${hours ? " during our hours:" : "."}`
          }
        </p>

        ${
          hours
            ? `<p style="margin:0 0 26px 0;font:700 15px/1.55 Arial,Helvetica,sans-serif;color:${NAVY};">
          &#128339;&nbsp; ${esc(hours)}
        </p>`
            : ""
        }

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 36px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Start my ${chat}
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          ${
            e.newLink
              ? `This is a new personal link, valid until <strong>${esc(e.validUntil)}</strong>. Your earlier chat link no longer works.`
              : `This is your same personal chat link, valid until <strong>${esc(e.validUntil)}</strong>.`
          }
        </p>
        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
              <strong style="color:${NAVY};">We will never ask you for</strong> a payment of any kind,
              your bank card details or a password.
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* PAN card re-upload                                                          */
/* -------------------------------------------------------------------------- */

export interface PanReuploadEmail {
  fullName: string;
  /** Their personal re-upload link. */
  url: string;
  /** Why, in the recruiter's words or a preset — one sentence. */
  reason: string;
  /** How long the link lasts, in days. */
  validDays: number;
}

/**
 * Asking somebody who already accepted to send their PAN card again: the back
 * was missing, a scan or an e-PAN was sent, or the photo cannot be read. Sent
 * by hand from View info.
 */
export function panReuploadSubject(): string {
  return "Action required: please re-upload your PAN card";
}

export function panReuploadText(e: PanReuploadEmail): string {
  const name = firstNameOf(e.fullName);
  return [
    `Hi ${name},`,
    ``,
    `To prepare your final agreement we need a clear photo of your physical`,
    `PAN card, front and back.`,
    ``,
    e.reason,
    ``,
    `A scan, a screenshot or an e-PAN is not accepted — please take a photo of`,
    `the card itself. It takes about a minute.`,
    ``,
    `Upload my PAN card:`,
    e.url,
    ``,
    `This link is personal to you and stays valid for ${e.validDays} days.`,
    ``,
    `We will never ask you for your Aadhaar, a payment of any kind, your bank`,
    `card details or a password.`,
    ``,
    `Any questions, reply to this email or write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function panReuploadHtml(e: PanReuploadEmail): string {
  const name = esc(firstNameOf(e.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(e.url);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(panReuploadSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  A clear photo of your physical PAN card, front and back — about a minute from your phone.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Please re-upload your PAN card
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 20px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          To prepare your final agreement we need a clear photo of your
          <strong style="color:${NAVY};">physical PAN card, front and back</strong>.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;margin:0 0 20px 0;">
          <tr>
            <td style="padding:16px 20px;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${NAVY};">
              ${esc(e.reason)}
            </td>
          </tr>
        </table>

        <p style="margin:0 0 24px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          A scan, a screenshot or an e-PAN is not accepted &mdash; please take a photo of the card
          itself. It takes about a minute.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 36px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Upload my PAN card
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          This link is personal to you and stays valid for ${e.validDays} days.
        </p>
        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
              <strong style="color:${NAVY};">We will never ask you for</strong> your Aadhaar, a payment
              of any kind, your bank card details or a password.
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Proof of address                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The three proof-of-address emails — the request, a reminder, and a request
 * for a new document — sent by hand from View info or the Accepted tab. They
 * share one layout and one list of what to send; only the opening differs.
 * The link never expires, so none of them gives a deadline. See lib/addressProof.
 */
export interface AddressProofEmail {
  fullName: string;
  /** Their personal proof-of-address link. */
  url: string;
}

export interface AddressProofReaskEmail extends AddressProofEmail {
  /** Why the document was sent back — a preset or the recruiter's words. */
  reason: string;
}

export function addressProofRequestSubject(): string {
  return "Your agreement is ready — please confirm your address";
}

export function addressProofReminderSubject(): string {
  return "Reminder: your proof of address is the last step";
}

export function addressProofReaskSubject(): string {
  return "Please send a new proof of address";
}

/** Their first name, or nothing — "Good news, there!" reads worse than "Good news!". */
function firstNameOrEmpty(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

const ADDRESS_WHAT_TEXT = [
  `What to upload — one of these, dated within the last 3 months:`,
  `  • Service or utility bill (internet or TV service, gas, water,`,
  `    electricity or city tax)`,
  `  • Bank/credit card statement or account confirmation letter`,
  ``,
  `It must show your full name and your home address. It does not have to be`,
  `in English. PDF only.`,
];

function addressProofText(opening: string[], buttonLabel: string, url: string): string {
  return [
    ...opening,
    ``,
    ...ADDRESS_WHAT_TEXT,
    ``,
    `${buttonLabel}:`,
    url,
    ``,
    `This link is personal to you.`,
    ``,
    `We will never ask you for a payment of any kind, your card details or a password.`,
    ``,
    `Any questions, reply to this email or write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

function addressProofHtml(o: {
  subject: string;
  preheader: string;
  heading: string;
  /** Already-escaped HTML paragraphs, shown above the list. */
  intro: string[];
  /** Plain text, shown in the highlighted box under the intro. */
  reason?: string;
  /** Already-escaped HTML paragraph, shown under the highlighted box. */
  afterReason?: string;
  buttonLabel: string;
  url: string;
}): string {
  const company = esc(siteConfig.company.name);
  const url = esc(o.url);
  const p = (html: string, bottom = 16) =>
    `<p style="margin:0 0 ${bottom}px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">${html}</p>`;
  const li = (html: string) =>
    `<tr><td valign="top" style="padding:0 10px 8px 0;font:700 15px/1.55 Arial,Helvetica,sans-serif;color:${AMBER};">&#10003;</td><td style="padding:0 0 8px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${NAVY};">${html}</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${esc(o.preheader)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          ${esc(o.heading)}
        </h1>

        ${o.intro.map((h, i) => p(h, i === o.intro.length - 1 ? 22 : 16)).join("\n        ")}
${
  o.reason
    ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;margin:0 0 22px 0;">
          <tr>
            <td style="padding:16px 20px;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${NAVY};">
              ${esc(o.reason)}
            </td>
          </tr>
        </table>
`
    : ""
}${o.afterReason ? `        ${p(o.afterReason, 22)}\n` : ""}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:0 0 26px 0;">
          <tr>
            <td style="padding:18px 20px 12px 20px;">
              <p style="margin:0 0 12px 0;font:700 15px/1.5 Arial,Helvetica,sans-serif;color:${NAVY};">
                What to upload &mdash; one of these, dated within the last 3 months:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                ${li(`<strong>Service or utility bill</strong> &mdash; internet or TV service, gas, water, electricity or city tax`)}
                ${li(`<strong>Bank/credit card statement</strong> or account confirmation letter`)}
              </table>
              <p style="margin:6px 0 6px 0;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
                It must show your full name and your home address. It does not have to be in English.
                <strong style="color:${NAVY};">PDF only.</strong>
              </p>
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 36px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                ${esc(o.buttonLabel)}
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          This link is personal to you.
        </p>
        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
              <strong style="color:${NAVY};">We will never ask you for</strong> a payment of any kind,
              your card details or a password.
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

const ADDRESS_REQUEST_INTRO =
  "Your information is verified and your agreement is ready. Before we send you the final agreement, there is one last step: we need a proof of address.";

export function addressProofRequestText(e: AddressProofEmail): string {
  const first = firstNameOrEmpty(e.fullName);
  return addressProofText(
    [first ? `Good news, ${first}!` : "Good news!", ``, ADDRESS_REQUEST_INTRO],
    "Upload proof of address",
    e.url,
  );
}

export function addressProofRequestHtml(e: AddressProofEmail): string {
  const first = firstNameOrEmpty(e.fullName);
  return addressProofHtml({
    subject: addressProofRequestSubject(),
    preheader: "One last step before your final agreement: a recent bill or bank statement showing your address.",
    heading: first ? `Good news, ${first}!` : "Good news!",
    intro: [
      `Your information is verified and your agreement is ready. Before we send you the final agreement, there is <strong style="color:${NAVY};">one last step: we need a proof of address</strong>.`,
    ],
    buttonLabel: "Upload proof of address",
    url: e.url,
  });
}

const ADDRESS_REMINDER_INTRO =
  "Your agreement is ready — we are only waiting for your proof of address before we send you the final agreement. It takes a minute.";

export function addressProofReminderText(e: AddressProofEmail): string {
  return addressProofText(
    [`Hi ${firstNameOf(e.fullName)},`, ``, ADDRESS_REMINDER_INTRO],
    "Upload proof of address",
    e.url,
  );
}

export function addressProofReminderHtml(e: AddressProofEmail): string {
  return addressProofHtml({
    subject: addressProofReminderSubject(),
    preheader: "Your agreement is ready — we are only waiting for your proof of address.",
    heading: "Just one step left",
    intro: [
      `Hi ${esc(firstNameOf(e.fullName))},`,
      `Your agreement is ready &mdash; we are only waiting for your <strong style="color:${NAVY};">proof of address</strong> before we send you the final agreement. It takes a minute.`,
    ],
    buttonLabel: "Upload proof of address",
    url: e.url,
  });
}

export function addressProofReaskText(e: AddressProofReaskEmail): string {
  return addressProofText(
    [
      `Hi ${firstNameOf(e.fullName)},`,
      ``,
      `Thank you for sending your proof of address. Unfortunately we could not accept the document you sent:`,
      ``,
      e.reason,
      ``,
      `Please upload a new document using the link below. Everything else is ready.`,
    ],
    "Upload a new document",
    e.url,
  );
}

export function addressProofReaskHtml(e: AddressProofReaskEmail): string {
  return addressProofHtml({
    subject: addressProofReaskSubject(),
    preheader: "We could not accept the document you sent — please upload a new one.",
    heading: "Please send a new proof of address",
    intro: [
      `Hi ${esc(firstNameOf(e.fullName))},`,
      `Thank you for sending your proof of address. Unfortunately we could not accept the document you sent:`,
    ],
    reason: e.reason,
    afterReason: "Please upload a new document using the link below. Everything else is ready.",
    buttonLabel: "Upload a new document",
    url: e.url,
  });
}

/* -------------------------------------------------------------------------- */
/* GSTIN request                                                               */
/* -------------------------------------------------------------------------- */

export interface GstinRequestEmail {
  fullName: string;
}

/**
 * Asking a candidate in India for their GSTIN before the final agreement.
 *
 * Sent by hand from View info, to somebody who accepted without giving one.
 * The wording is the recruitment team's own. The answer comes back by reply —
 * there is no link — and the recruiter adds it to the profile.
 */
export function gstinRequestSubject(): string {
  return "Action Required: GSTIN Needed to Finalize Your Agreement";
}

export function gstinRequestText({ fullName }: GstinRequestEmail): string {
  const name = firstNameOf(fullName);
  return [
    `Dear ${name},`,
    ``,
    `Thank you for completing the previous stages of our recruitment process.`,
    ``,
    `Before we can issue your final agreement, we require your GSTIN (Goods and`,
    `Services Tax Identification Number) as part of our contractor onboarding and`,
    `tax reporting process.`,
    ``,
    `Your GSTIN includes the PAN associated with your GST registration, which allows`,
    `us to complete the required taxpayer information for your contractor profile.`,
    ``,
    `Please provide your GSTIN and ensure that the details are accurate and`,
    `correspond to you or the applicable business entity.`,
    ``,
    `If you do not have a GSTIN yet, please proceed with the GST registration`,
    `process and send us your GSTIN once it has been issued. After verification, we`,
    `will be able to finalise your agreement and send it to you.`,
    ``,
    `Your application will remain pending until the GSTIN information has been`,
    `provided and verified. Please note that providing your GSTIN is required to`,
    `complete your final agreement.`,
    ``,
    `To send it, simply reply to this email with your 15-character GSTIN.`,
    ``,
    `Kind regards,`,
    `${siteConfig.company.name} Recruitment Team`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function gstinRequestHtml({ fullName }: GstinRequestEmail): string {
  const name = esc(firstNameOf(fullName));
  const company = esc(siteConfig.company.name);
  const p = (html: string, bottom = 16) =>
    `<p style="margin:0 0 ${bottom}px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">${html}</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(gstinRequestSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  We need your GSTIN before we can issue your final agreement.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Your GSTIN is needed
        </h1>

        ${p(`Dear ${name},`)}
        ${p("Thank you for completing the previous stages of our recruitment process.")}
        ${p(`Before we can issue your final agreement, we require your
          <strong style="color:${NAVY};">GSTIN (Goods and Services Tax Identification Number)</strong>
          as part of our contractor onboarding and tax reporting process.`)}
        ${p(`Your GSTIN includes the PAN associated with your GST registration, which allows us to
          complete the required taxpayer information for your contractor profile.`)}
        ${p(`Please provide your GSTIN and ensure that the details are accurate and correspond to you
          or the applicable business entity.`, 22)}

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;margin:0 0 22px 0;">
          <tr>
            <td style="padding:18px 22px;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${NAVY};">
              <strong>If you do not have a GSTIN yet,</strong> please proceed with the GST registration
              process and send us your GSTIN once it has been issued. After verification, we will be
              able to finalise your agreement and send it to you.
            </td>
          </tr>
        </table>

        ${p(`Your application will remain pending until the GSTIN information has been provided and
          verified. Please note that providing your GSTIN is required to complete your final agreement.`)}
        ${p(`<strong style="color:${NAVY};">To send it, simply reply to this email with your
          15-character GSTIN.</strong>`, 24)}

        <p style="margin:0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Kind regards,<br>
          <strong style="color:${NAVY};">${company} Recruitment Team</strong>
        </p>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Waiting for the GSTIN — your place is held                                  */
/* -------------------------------------------------------------------------- */

export interface GstinWaitingEmail {
  fullName: string;
}

/**
 * The gentle follow-up to the GSTIN request, for a candidate in India who has
 * accepted but has no GSTIN yet: the agreement is ready, their place stays
 * available and pending, and we will wait until they have one. Sent by hand
 * from View info or in bulk from the Accepted tab. The answer comes back by
 * reply, like the request — there is no link.
 */
export function gstinWaitingSubject(): string {
  return "Your place is waiting for you — send us your GSTIN when ready";
}

export function gstinWaitingText({ fullName }: GstinWaitingEmail): string {
  const name = firstNameOf(fullName);
  return [
    `Your agreement is ready, ${name}`,
    ``,
    `Your final agreement is ready and waiting for you. The only thing we still`,
    `need is your GSTIN.`,
    ``,
    `Don't worry — your place is still available and pending. We are just waiting`,
    `for your GSTIN to complete your application and send you the final agreement.`,
    ``,
    `Your place will always stay available and pending, so there is no rush. If`,
    `you don't have your GSTIN yet, we will wait until you get it.`,
    ``,
    `When you get your GSTIN, simply reply to this email with your 15-character`,
    `GSTIN. We will then complete your application and send you your final`,
    `agreement.`,
    ``,
    `We will never ask you for your Aadhaar, a payment of any kind, your bank card`,
    `details or a password.`,
    ``,
    `Kind regards,`,
    `${siteConfig.company.name} Recruitment Team`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function gstinWaitingHtml({ fullName }: GstinWaitingEmail): string {
  const name = esc(firstNameOf(fullName));
  const company = esc(siteConfig.company.name);
  const p = (html: string, bottom = 16) =>
    `<p style="margin:0 0 ${bottom}px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">${html}</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(gstinWaitingSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your agreement is ready and your place is still available — we are just waiting for your GSTIN.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Your agreement is ready, ${name}
        </h1>

        ${p(`Your final agreement is ready and waiting for you. The only thing we still need is your
          <strong style="color:${NAVY};">GSTIN</strong>.`, 22)}

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;margin:0 0 22px 0;">
          <tr>
            <td style="padding:18px 22px;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${NAVY};">
              <strong>Don&rsquo;t worry &mdash; your place is still available and pending.</strong>
              We are just waiting for your GSTIN to complete your application and send you the final
              agreement.
            </td>
          </tr>
        </table>

        ${p(`Your place will always stay available and pending, so there is no rush. If you don&rsquo;t
          have your GSTIN yet, we will wait until you get it.`)}
        ${p(`<strong style="color:${NAVY};">When you get your GSTIN, simply reply to this email with your
          15-character GSTIN.</strong> We will then complete your application and send you your final
          agreement.`, 24)}

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:0 0 24px 0;">
          <tr>
            <td style="padding:16px 20px;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
              <strong style="color:${NAVY};">We will never ask you for</strong> your Aadhaar, a payment
              of any kind, your bank card details or a password.
            </td>
          </tr>
        </table>

        <p style="margin:0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Kind regards,<br>
          <strong style="color:${NAVY};">${company} Recruitment Team</strong>
        </p>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Your own email (the Send email tab)                                         */
/* -------------------------------------------------------------------------- */

export interface ComposedEmail {
  subject: string;
  /**
   * The message as written in the editor, ALREADY CLEANED by
   * lib/composeEmail — it is placed in the email as it is.
   */
  bodyHtml: string;
  /** "workroute": logo, white card and footer. "plain": just the message. */
  design: "workroute" | "plain";
}

/**
 * A message written by hand in the Admin Panel, in the site's email design or
 * as a plain letter. The words are entirely the recruiter's; this only frames
 * them.
 */
export function composedEmailHtml(e: ComposedEmail): string {
  const company = esc(siteConfig.company.name);
  const base = `font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${MUTED}`;
  const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(e.subject)}</title>
</head>`;

  if (e.design === "plain") {
    return `${head}
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:24px 16px;">
  <div style="${base};max-width:640px;word-wrap:break-word;">
${e.bodyHtml}
  </div>
</td></tr>
</table>
</body>
</html>`;
  }

  return `${head}
<body style="margin:0;padding:0;background:${CREAM};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:34px 32px;${base};word-wrap:break-word;">
${e.bodyHtml}
      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* Submission received                                                         */
/* -------------------------------------------------------------------------- */

export interface SubmissionReceivedEmail {
  fullName: string;
}

/**
 * "We have what you sent, and here is how long it takes."
 *
 * Sent by hand once a candidate has submitted documents that are now waiting
 * on a person. The silence between uploading a passport and hearing anything
 * back is where candidates start to wonder whether they have been scammed —
 * they have just handed a stranger their identity documents and heard nothing
 * — and a message that names a timescale turns that silence into a wait with
 * an end.
 *
 * It promises exactly two things and no more: a review of one to three
 * business days, and an email when it is done. Nothing about the outcome,
 * because the outcome is not known yet, and nothing to click, because there is
 * nothing for them to do.
 */
export function submissionReceivedSubject(): string {
  return `We've received your information – ${siteConfig.company.name}`;
}

export function submissionReceivedText({ fullName }: SubmissionReceivedEmail): string {
  const name = firstNameOf(fullName);
  return [
    `Hi ${name},`,
    ``,
    `Thank you — we have successfully received the information you submitted,`,
    `and it is now with our team for review.`,
    ``,
    `Verification usually takes 3–5 business days to complete.`,
    ``,
    `What happens next`,
    ``,
    `As soon as the review is complete, we will email you to confirm that your`,
    `information has been verified. There is nothing more you need to do in the`,
    `meantime.`,
    ``,
    `Your documents are stored privately, seen only by our recruitment team, and`,
    `used only to confirm your identity. We will never ask you for a payment, a`,
    `bank card, or a password.`,
    ``,
    `Any questions, write to ${siteConfig.contact.recruitmentEmail}.`,
    ``,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function submissionReceivedHtml({ fullName }: SubmissionReceivedEmail): string {
  const name = esc(firstNameOf(fullName));
  const company = esc(siteConfig.company.name);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(submissionReceivedSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your information is under review — usually 3–5 business days.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          We&rsquo;ve received your information
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 22px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Thank you &mdash; we have successfully received the information you submitted, and it is
          now with our team for review.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;margin:0 0 24px 0;">
          <tr>
            <td style="padding:18px 22px;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${NAVY};">
              Verification usually takes
              <strong style="color:${NAVY};">3&ndash;5 business days</strong> to complete.
            </td>
          </tr>
        </table>

        <p style="margin:0 0 8px 0;font:700 16px/1.6 Arial,Helvetica,sans-serif;color:${NAVY};">
          What happens next
        </p>
        <p style="margin:0 0 24px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          As soon as the review is complete, we will email you to confirm that your information has
          been verified. There is nothing more you need to do in the meantime.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:18px 22px;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
              Your documents are stored privately, seen only by our recruitment team, and used only
              to confirm your identity. We will <strong style="color:${NAVY};">never</strong> ask you
              for a payment, a bank card, or a password.
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Chasing a voice assessment that has been asked for and not sent.
 *
 * Deliberately not the assessment reminder reworded. That one chases a
 * 30-minute test somebody has to sit down for; this one chases a minute of
 * talking, and saying so is the whole persuasion. It also has to carry the
 * fact that they have already passed the interview — a bare "you have not
 * completed this" weeks later reads like a rejection notice, and the people
 * most likely to give up are the ones who most need reminding they are nearly
 * through.
 */
export function voiceReminderSubject(): string {
  return `A minute of your time — your ${siteConfig.company.name} voice assessment`;
}

export function voiceReminderText(invite: VoiceAssessmentInvite): string {
  const name = firstNameOf(invite.fullName);
  return [
    `Dear ${name},`,
    ``,
    `You passed our online interview${invite.position ? ` for the ${invite.position} role` : ""}, and your`,
    `application is still open. The one thing outstanding is your voice assessment.`,
    ``,
    `It takes about a minute. Open your personal link and follow the steps on the page:`,
    ``,
    invite.recordUrl,
    ``,
    `A short passage is shown for you to read aloud. Record it on the page, or attach a`,
    `recording made with your phone — whichever is easier. You can listen back and record`,
    `again before you send it.`,
    ``,
    `If you would rather not continue, simply reply and let us know.`,
    `We will close your application. Either answer is helpful to us.`,
    ``,
    `Kind regards,`,
    `Recruitment Team`,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function voiceReminderHtml(invite: VoiceAssessmentInvite): string {
  const name = esc(firstNameOf(invite.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(invite.recordUrl);
  const role = invite.position ? ` for the <strong style="color:${NAVY};">${esc(invite.position)}</strong> role` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(voiceReminderSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  One minute of reading aloud, and your application is complete.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          You are one step from finishing
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hello ${name}, you passed our online interview${role} and your application is still
          open. The one thing outstanding is your <strong style="color:${NAVY};">voice
          assessment</strong>.
        </p>

        <p style="margin:0 0 26px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          It takes about a minute. A short passage is shown for you to read aloud &mdash; record
          it on the page, or attach a recording made with your phone, whichever is easier.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Record it now
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:18px 22px;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
              Changed your mind? Reply to this email and we will close your application. Either
              answer is helpful to us.
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export interface IdentityReminderEmail {
  fullName: string;
  /** Their offer link, which resumes the identity step. */
  uploadUrl: string;
  position?: string;
}

/**
 * Chasing identity documents from somebody who has already accepted.
 *
 * The most delicate message this system sends. Being asked to photograph a
 * passport, by email, after accepting a remote job offer is precisely the
 * shape of a recruitment scam — a cautious person is right to hesitate, and
 * the ones who hesitate hardest are usually the ones worth hiring. So this
 * spends most of its length earning the request rather than making it: it
 * confirms their acceptance is already recorded, says plainly what the check
 * is for and who sees the photographs, and states the things we will never ask
 * for. Anything less and the careful candidates are the ones who drop out.
 *
 * It does not threaten a deadline. A withdrawal warning would push exactly the
 * people who are being careful, and we would rather answer their question.
 */
export function identityReminderSubject(): string {
  return `Identity verification required to issue your ${siteConfig.company.name} agreement`;
}

export function identityReminderText(invite: IdentityReminderEmail): string {
  const name = firstNameOf(invite.fullName);
  return [
    `Dear ${name},`,
    ``,
    `Thank you for accepting our offer${invite.position ? ` for the ${invite.position} role` : ""}.`,
    `Your acceptance is recorded and your place is held.`,
    ``,
    `One step remains before we can issue your written agreement: a short identity`,
    `check. We ask this of everyone we engage, and we cannot prepare a contract`,
    `without it.`,
    ``,
    `You will be asked for a photo of your passport, national identity card or`,
    `driver's licence, and a photo of you holding it. It takes about a minute from`,
    `a phone.`,
    ``,
    `WHY WE ASK`,
    ``,
    `An agreement has to be made with a real, identified person. The check confirms`,
    `that the person we are contracting with is you, and it protects you as much as`,
    `us: it is what stops somebody else using your name and your details.`,
    ``,
    `YOUR PHOTOGRAPHS`,
    ``,
    `- Stored privately. Nobody can open them without signing in.`,
    `- Seen only by our recruitment team.`,
    `- Used only to confirm who you are, and never shared with anyone else.`,
    ``,
    `Open your personal link and follow the steps on the page:`,
    ``,
    invite.uploadUrl,
    ``,
    `WE WILL NEVER ASK YOU FOR`,
    ``,
    `- A payment of any kind, for anything, at any stage.`,
    `- Your bank card details or a password.`,
    `- Money to release your first payment.`,
    ``,
    `If a message ever asks you for any of those in our name,`,
    `it did not come from us. Please do not pay it, and tell us so we can warn others.`,
    ``,
    `If anything here is unclear, simply reply to this email and a person will`,
    `answer you.`,
    ``,
    `Kind regards,`,
    `Recruitment Team`,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function identityReminderHtml(invite: IdentityReminderEmail): string {
  const name = esc(firstNameOf(invite.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(invite.uploadUrl);
  const role = invite.position ? ` for the <strong style="color:${NAVY};">${esc(invite.position)}</strong> role` : "";

  const bullet = (text: string) => `
    <tr>
      <td style="padding:0 0 8px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
        <span style="color:${AMBER};font-weight:700;">&bull;</span>&nbsp; ${text}
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(identityReminderSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your acceptance is recorded. One identity check and your agreement follows.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          One step left before your agreement
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Dear ${name}, thank you for accepting our offer${role}.
          <strong style="color:${NAVY};">Your acceptance is recorded and your place is held.</strong>
        </p>

        <p style="margin:0 0 26px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          One step remains before we can issue your written agreement: a short
          <strong style="color:${NAVY};">identity check</strong>. We ask this of everyone we
          engage, and we cannot prepare a contract without it. It takes about a minute from a
          phone &mdash; a photo of your passport, national identity card or driver&rsquo;s
          licence, and a photo of you holding it.
        </p>

        <!-- Being asked for a passport by email after accepting a remote offer
             is exactly what a scam looks like. Earning the request matters more
             here than making it, so what happens to the photographs and what we
             will never ask for are both stated plainly — and the button comes
             after that reassurance, not before it, so nobody is asked to click
             before they have been given a reason to. -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:0 0 26px 0;">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                Why we ask
              </p>
              <p style="margin:0 0 16px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
                An agreement has to be made with a real, identified person. This confirms that the
                person we are contracting with is you &mdash; which protects you as much as us,
                because it is what stops somebody else using your name and your details.
              </p>
              <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                Your photographs
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${bullet("Stored privately &mdash; nobody can open them without signing in.")}
                ${bullet("Seen only by our recruitment team.")}
                ${bullet("Used only to confirm who you are, never shared onward.")}
              </table>
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Complete my identity check
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                We will never ask you for
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${bullet("A payment of any kind, for anything, at any stage.")}
                ${bullet("Your bank card details, or a password.")}
                ${bullet("Money to release your first payment.")}
              </table>
              <p style="margin:8px 0 0 0;font:400 14px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
                If a message ever asks you for any of those in our name, it did not come from us.
                Please do not pay it, and tell us so we can warn others.
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:22px 0 0 0;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          If anything here is unclear, simply reply to this email and a person will answer you.
        </p>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export interface LiveVerificationEmail {
  fullName: string;
  /** Our own page, which records the open and then hands over to the provider. */
  startUrl: string;
  /**
   * Which story to tell. Defaults to "retry" for the same reason the record
   * does: it is the only one that existed before, so anything that does not
   * say otherwise means the check that follows failed photographs.
   */
  reason?: LiveVerificationReason;
}

/**
 * Asking somebody to finish their identity check on their phone.
 *
 * Written for the moment it is actually sent: their photographs did not settle
 * the question, and we are asking a person who has done as they were told to
 * do it again, differently. So it does not say we could not verify them —
 * that is an accusation, and the people it stings hardest are the honest ones
 * who took the picture in bad light. It says the photographs were not clear
 * enough for the check, and that this way is quicker.
 *
 * The button leads to our own page rather than straight to the provider. A
 * message asking somebody to photograph their passport, whose only link goes
 * to a domain they have never heard of, is indistinguishable from the scam it
 * is not.
 */
export function liveVerificationSubject(reason: LiveVerificationReason = "retry"): string {
  return LIVE_REASON_SUBJECT[reason];
}

/**
 * The opening, which is the only part that differs between the two.
 *
 * Everything after it — the phone instruction, the button, what happens, the
 * warning about payments — is the same check described the same way, and
 * forking the whole template to change two paragraphs is how the copy in one
 * of them quietly stops matching the other.
 */
function liveOpeningText(reason: LiveVerificationReason): string[] {
  if (reason === "agreement") {
    return [
      `Good news — your application is at its final stage.`,
      ``,
      `Before we can send your agreement to sign, we need to confirm your identity.`,
      `This is a standard check and everyone we contract with completes it. It takes`,
      `about two minutes.`,
    ];
  }
  return [
    `Thank you for sending your identity documents. Unfortunately we were not able`,
    `to complete the check from the photographs, so we cannot verify your identity`,
    `that way.`,
    ``,
    `There is a quicker way to finish it, and it takes about two minutes.`,
  ];
}

export function liveVerificationText(invite: LiveVerificationEmail): string {
  const name = firstNameOf(invite.fullName);
  return [
    `Dear ${name},`,
    ``,
    ...liveOpeningText(invite.reason ?? "retry"),
    ``,
    `OPEN THIS ON YOUR PHONE`,
    ``,
    invite.startUrl,
    ``,
    `Your phone camera is what makes this work, so please open the link on a`,
    `phone. If you are reading this on a computer, the page will show you a code`,
    `you can scan with your phone camera to continue there.`,
    ``,
    `WHAT HAPPENS`,
    ``,
    `- You photograph your identity document, guided step by step.`,
    `- You take a short live selfie so we can see it is really you.`,
    `- That is all. There is nothing to install and nothing to fill in.`,
    ``,
    `The check is carried out by our verification provider. Your photographs are`,
    `used only to confirm who you are.`,
    ``,
    `WE WILL NEVER ASK YOU FOR`,
    ``,
    `- A payment of any kind, for anything, at any stage.`,
    `- Your bank card details or a password.`,
    `- Money to release your first payment.`,
    ``,
    `This link is personal to you. Please do not forward it to anyone.`,
    ``,
    `If anything here is unclear, simply reply to this email and a person will`,
    `answer you.`,
    ``,
    `Kind regards,`,
    `Recruitment Team`,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function liveVerificationHtml(invite: LiveVerificationEmail): string {
  const name = esc(firstNameOf(invite.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(invite.startUrl);
  const reason: LiveVerificationReason = invite.reason ?? "retry";

  // The headline, the opening, and the line in the preview pane. Chosen
  // together because a subject about an agreement above a heading about failed
  // photographs is the contradiction this whole change exists to remove.
  const heading =
    reason === "agreement"
      ? "One last step before your agreement"
      : "One quick step to finish your identity check";

  const preheader =
    reason === "agreement"
      ? "Two minutes on your phone and your agreement is on its way."
      : "Two minutes on your phone finishes your identity check.";

  const opening =
    reason === "agreement"
      ? `
        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Dear ${name}, good news &mdash; your application is at its final stage.
        </p>

        <p style="margin:0 0 8px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Before we can send your agreement to sign, we need to
          <strong style="color:${NAVY};">confirm your identity</strong>. This is a standard check
          that everyone we contract with completes, and it takes about
          <strong style="color:${NAVY};">two minutes</strong>.
        </p>`
      : `
        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Dear ${name}, thank you for sending your identity documents. Unfortunately we were not
          able to complete the check from the photographs, so
          <strong style="color:${NAVY};">we were unable to verify your identity</strong> that way.
        </p>

        <p style="margin:0 0 8px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          There is a quicker way to finish it, and it takes about
          <strong style="color:${NAVY};">two minutes</strong>.
        </p>`;

  const bullet = (text: string) => `
    <tr>
      <td style="padding:0 0 8px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
        <span style="color:${AMBER};font-weight:700;">&bull;</span>&nbsp; ${text}
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(liveVerificationSubject(reason))}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${esc(preheader)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          ${esc(heading)}
        </h1>
${opening}

        <!-- Said immediately above the button, not in the small print. The
             whole thing needs a phone camera, and somebody who starts it on a
             laptop has to begin again. -->
        <p style="margin:0 0 18px 0;font:700 15px/1.5 Arial,Helvetica,sans-serif;color:#b06e0c;">
          Please open this on your phone.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Start verification
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Reading this on a computer? Open the page anyway and it will show you a code to scan with
          your phone camera. Or copy this link:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:0 0 18px 0;">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                What happens
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${bullet("You photograph your identity document, guided step by step.")}
                ${bullet("You take a short live selfie, so we can see it is really you.")}
                ${bullet("That is all &mdash; nothing to install, nothing to fill in.")}
              </table>
              <p style="margin:10px 0 0 0;font:400 14px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
                The check is carried out by our verification provider, and your photographs are used
                only to confirm who you are.
              </p>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                We will never ask you for
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${bullet("A payment of any kind, for anything, at any stage.")}
                ${bullet("Your bank card details, or a password.")}
                ${bullet("Money to release your first payment.")}
              </table>
              <p style="margin:8px 0 0 0;font:400 14px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
                This link is personal to you &mdash; please do not forward it. If a message ever
                asks you for any of those in our name, it did not come from us.
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:22px 0 0 0;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          If anything here is unclear, simply reply to this email and a person will answer you.
        </p>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export interface CompanyDetailsEmail {
  fullName: string;
  companyName?: string;
  /** Their own page, pre-filled with what they told us when accepting. */
  url: string;
}

/**
 * Asking a candidate who accepted through a company to confirm the company.
 *
 * The reason has to be given, because from their side this looks like a
 * fourth hoop after an assessment, a recording, an offer and a passport. It is
 * not: the agreement is with the company rather than with them, and everything
 * we hold about that company is two boxes they typed while accepting. The
 * paperwork is what turns those into something a contract can be built on.
 */
export interface VoiceAckEmail {
  fullName: string;
  position?: string;
  /** When the recording actually landed, so the receipt names a moment. */
  receivedAt?: string;
}

/**
 * The receipt for a voice recording, and the promise of an answer.
 *
 * This closes the worst silence in the process. A candidate records the
 * assessment, sends it, and then hears nothing while the file is read — which
 * from their side is indistinguishable from having been turned down without
 * being told. The good ones take the next offer they are given.
 *
 * Three things, in this order, and nothing else:
 *
 *   1. it arrived. That is the question they actually have;
 *   2. what happens to it now, and who does it;
 *   3. that places are limited, so a strong application sometimes waits —
 *      said plainly, because implying an offer and then going quiet is how a
 *      company earns the reputation this email exists to avoid.
 *
 * It promises a reply, never a job. And it asks for nothing: no link, no
 * button, no next step. A receipt with a call to action is not a receipt.
 */
export function voiceAckSubject(): string {
  return `We have your voice recording — ${siteConfig.company.name}`;
}

function ackDate(iso?: string): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function voiceAckText(invite: VoiceAckEmail): string {
  const name = firstNameOf(invite.fullName);
  const when = ackDate(invite.receivedAt);
  return [
    `Dear ${name},`,
    ``,
    `Thank you — your voice recording${when ? ` reached us on ${when}` : ` has reached us`}.`,
    `Nothing further is needed from you today.`,
    ``,
    `WHAT HAPPENS NOW`,
    ``,
    `Our team listens to your recording and reads it alongside your application`,
    `and your assessment${invite.position ? ` for the ${invite.position} role` : ""}. That is done by a person, not a`,
    `machine, which is why it takes a little time.`,
    ``,
    `ABOUT TIMING`,
    ``,
    `We would rather be straight with you: places open as our clients take on`,
    `more support, so there is not always one free at the moment a good`,
    `application arrives. If that is the case for you, it is about timing and`,
    `nothing else.`,
    ``,
    `Either way, we will email you. You will not be left wondering.`,
    ``,
    `WE WILL NEVER ASK YOU FOR`,
    ``,
    `- A payment of any kind, for anything, at any stage.`,
    `- Your bank card details or a password.`,
    `- Money to secure a place or to start work.`,
    ``,
    `If anything is unclear, or your circumstances change, simply reply to this`,
    `email and a person will read it.`,
    ``,
    `Thank you for the time you have given this so far.`,
    ``,
    `Kind regards,`,
    `Recruitment Team`,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function voiceAckHtml(invite: VoiceAckEmail): string {
  const name = esc(firstNameOf(invite.fullName));
  const company = esc(siteConfig.company.name);
  const when = esc(ackDate(invite.receivedAt));
  const role = invite.position
    ? ` for the <strong style="color:${NAVY};">${esc(invite.position)}</strong> role`
    : "";

  const bullet = (text: string) => `
    <tr>
      <td style="padding:0 0 8px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
        <span style="color:${AMBER};font-weight:700;">&bull;</span>&nbsp; ${text}
      </td>
    </tr>`;

  /** A numbered step, for "what happens now". */
  const step = (n: number, title: string, body: string) => `
    <tr>
      <td width="34" valign="top" style="padding:0 12px 14px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="26" height="26" align="center" valign="middle" bgcolor="${NAVY}"
                style="border-radius:13px;font:700 13px/1 Arial,Helvetica,sans-serif;color:#ffffff;">
              ${n}
            </td>
          </tr>
        </table>
      </td>
      <td valign="top" style="padding:0 0 14px 0;">
        <p style="margin:0 0 2px 0;font:700 15px/1.4 Arial,Helvetica,sans-serif;color:${NAVY};">${title}</p>
        <p style="margin:0;font:400 14px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">${body}</p>
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(voiceAckSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your recording arrived safely. Our team is reviewing it, and we will email you either way.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:0 0 38px 0;">

        <!-- The receipt, as a banner. The one fact they opened the email for,
             above everything else and impossible to miss on a phone. -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#f0f9f2;border-bottom:1px solid #cdebd6;border-radius:14px 14px 0 0;">
          <tr>
            <td align="center" style="padding:28px 34px 24px 34px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" height="44" align="center" valign="middle" bgcolor="#1f9d55"
                      style="border-radius:22px;font:700 22px/1 Arial,Helvetica,sans-serif;color:#ffffff;">
                    &#10003;
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0 0;font:800 20px/1.3 Arial,Helvetica,sans-serif;color:#14532d;">
                Your recording arrived safely
              </p>
              ${when ? `<p style="margin:6px 0 0 0;font:400 14px/1.5 Arial,Helvetica,sans-serif;color:#2f6b47;">Received ${when}</p>` : ""}
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:30px 34px 0 34px;">

              <p style="margin:0 0 22px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
                Dear ${name}, thank you for recording that and sending it in${role}.
                <strong style="color:${NAVY};">Nothing further is needed from you today.</strong>
              </p>

              <p style="margin:0 0 14px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                What happens now
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${step(1, "A person listens to it", "Your recording is reviewed by our recruitment team &mdash; not by a machine.")}
                ${step(2, "It is read with the rest of your file", "Alongside your application and your written assessment, so the picture is a whole one.")}
                ${step(3, "We write to you", "With our decision, and what the next step would be.")}
              </table>

              <!-- The honest part. In its own box because it is the thing most
                   companies leave out, and leaving it out is what turns a wait
                   into a grievance. -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:22px 0 0 0;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                      About timing
                    </p>
                    <p style="margin:0 0 12px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
                      We would rather be straight with you. Places open as our clients take on more
                      support, so there is not always one free at the moment a good application
                      arrives. If that turns out to be the case for you, it is about timing and
                      nothing else.
                    </p>
                    <p style="margin:0;font:700 15px/1.55 Arial,Helvetica,sans-serif;color:${NAVY};">
                      Either way, we will email you. You will not be left wondering.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;margin:22px 0 0 0;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                      We will never ask you for
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      ${bullet("A payment of any kind, for anything, at any stage.")}
                      ${bullet("Your bank card details, or a password.")}
                      ${bullet("Money to secure a place or to start work.")}
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:22px 0 0 0;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
                If anything is unclear, or your circumstances change, simply reply to this email and
                a person will read it. Thank you for the time you have given this so far.
              </p>

            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* "Your information is verified" — no voice recording                         */
/* -------------------------------------------------------------------------- */

export interface VerifiedAckEmail {
  fullName: string;
  position?: string;
}

/**
 * For a candidate whose identity is verified and who has not sent the voice
 * assessment. It confirms the application is complete, says what happens next
 * — a final video interview when a place opens — and that their place is kept
 * while they wait. It does not mention the recording, and it asks for nothing.
 */
export function verifiedAckSubject(): string {
  return "Your information is verified — we'll be in touch";
}

export function verifiedAckText(e: VerifiedAckEmail): string {
  const name = firstNameOf(e.fullName);
  return [
    `Hi ${name},`,
    ``,
    `Thank you for completing every step of your application${e.position ? ` for the ${e.position} role` : ""}.`,
    `We are pleased to confirm that your identity documents have been verified and`,
    `your profile is now complete.`,
    ``,
    `WHAT HAPPENS NEXT`,
    `- Your application is with our recruitment team and stays active. There is`,
    `  nothing more you need to do right now.`,
    `- New places open as our clients grow their customer support teams. When a`,
    `  place that suits your profile becomes available, we will invite you to a`,
    `  final video interview.`,
    `- We will write to you at this email address, so please keep an eye on your`,
    `  inbox — and your spam folder, just in case.`,
    ``,
    `We know waiting is not always easy, and we truly appreciate your patience.`,
    `Your place is kept while you wait — nothing is lost.`,
    ``,
    `If your contact details or availability change in the meantime, simply reply`,
    `to this email and let us know.`,
    ``,
    `We will never ask you for a payment of any kind, your bank card details or a password.`,
    ``,
    `Kind regards,`,
    `${siteConfig.company.name} Recruitment Team`,
    siteConfig.contact.recruitmentEmail,
    siteConfig.url,
  ].join("\n");
}

export function verifiedAckHtml(e: VerifiedAckEmail): string {
  const name = esc(firstNameOf(e.fullName));
  const company = esc(siteConfig.company.name);
  const role = e.position ? ` for the <strong style="color:${NAVY};">${esc(e.position)}</strong> role` : "";

  const step = (text: string) => `
    <tr>
      <td width="26" valign="top" style="padding:0 0 12px 0;">
        <span style="display:inline-block;width:18px;height:18px;border-radius:9px;background:${AMBER};color:${NAVY};font:700 12px/18px Arial,Helvetica,sans-serif;text-align:center;">&#10003;</span>
      </td>
      <td valign="top" style="padding:0 0 12px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">${text}</td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(verifiedAckSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your profile is complete and your place is kept — here is what happens next.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <p style="margin:0 0 14px 0;">
          <span style="display:inline-block;padding:6px 12px;border-radius:999px;background:#e8f7ee;color:#166534;font:700 12px/1 Arial,Helvetica,sans-serif;letter-spacing:0.5px;">
            &#10003;&nbsp; Verified
          </span>
        </p>

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Your application is complete
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Hi ${name},
        </p>

        <p style="margin:0 0 24px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Thank you for completing every step of your application${role}. We are pleased to
          confirm that your <strong style="color:${NAVY};">identity documents have been verified</strong>
          and your profile is now complete.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:0 0 24px 0;">
          <tr>
            <td style="padding:20px 22px 8px 22px;">
              <p style="margin:0 0 14px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                What happens next
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${step("Your application is with our recruitment team and <strong style=\"color:" + NAVY + ";\">stays active</strong>. There is nothing more you need to do right now.")}
                ${step("New places open as our clients grow their customer support teams. When a place that suits your profile becomes available, we will invite you to a <strong style=\"color:" + NAVY + ";\">final video interview</strong>.")}
                ${step("We will write to you at this email address, so please keep an eye on your inbox &mdash; and your spam folder, just in case.")}
              </table>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          We know waiting is not always easy, and we truly appreciate your patience.
          <strong style="color:${NAVY};">Your place is kept while you wait</strong> &mdash; nothing is lost.
        </p>

        <p style="margin:0 0 24px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          If your contact details or availability change in the meantime, simply reply to this
          email and let us know.
        </p>

        <p style="margin:0 0 24px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Kind regards,<br>
          <strong style="color:${NAVY};">${company} Recruitment Team</strong>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
              <strong style="color:${NAVY};">We will never ask you for</strong> a payment of any kind,
              your bank card details or a password.
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export interface OfferReminderEmail {
  fullName: string;
  position?: string;
  /** Already formatted, e.g. "$17 per hour". Omitted if the offer is unreadable. */
  rate?: string;
  /** Their own offer link, which still opens the accept and decline buttons. */
  offerUrl: string;
  /** The deadline in words: "Saturday 13 September at 14:30 UK time". */
  deadline: string;
}

/**
 * Chasing an answer to an offer, with a deadline attached.
 *
 * The hardest thing to get right here is tone. The message has to carry a
 * consequence — after this we close the file and erase what we hold — while
 * not reading as a threat to somebody who has simply been busy, or ill, or
 * waiting to hear from another employer. So the consequence is stated once,
 * plainly, as what happens rather than as a punishment, and "no" is offered as
 * a real answer beside "yes": declining takes one click and costs them
 * nothing, which is the outcome we would much rather have than silence.
 *
 * The deadline is a date and a time, never "within 48 hours". Emails are read
 * whenever they are read, and by then "48 hours" names no moment at all.
 */
export function offerReminderSubject(position?: string): string {
  return position
    ? `Your ${position} offer is waiting for your answer`
    : `Your ${siteConfig.company.name} offer is waiting for your answer`;
}

export function offerReminderText(invite: OfferReminderEmail): string {
  const name = firstNameOf(invite.fullName);
  const role = invite.position ? ` for the ${invite.position} role` : "";
  return [
    `Dear ${name},`,
    ``,
    `We wrote to you recently with an offer${role}${invite.rate ? ` at ${invite.rate}` : ""},`,
    `and we have not heard back yet.`,
    ``,
    `We are still holding the place for you. Could you let us know either way by`,
    ``,
    `${invite.deadline}`,
    ``,
    `Both answers are useful to us, and neither needs an explanation. If it is no,`,
    `saying so takes one click and there is no awkwardness in it — plans change,`,
    `and other offers come along.`,
    ``,
    `Open your offer to accept or decline:`,
    ``,
    invite.offerUrl,
    ``,
    `IF WE DO NOT HEAR FROM YOU`,
    ``,
    `We will assume you are no longer interested, close your file, and remove your`,
    `application and any documents you sent us from our system. Nothing further`,
    `will be asked of you, and you would be welcome to apply again another time.`,
    ``,
    `WE WILL NEVER ASK YOU FOR`,
    ``,
    `- A payment of any kind, for anything, at any stage.`,
    `- Your bank card details or a password.`,
    `- Money to release your first payment.`,
    ``,
    `If you need more time, simply reply to this email and say so. A person will`,
    `read it, and we would rather give you longer than lose you to a deadline.`,
    ``,
    `Kind regards,`,
    `Recruitment Team`,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function offerReminderHtml(invite: OfferReminderEmail): string {
  const name = esc(firstNameOf(invite.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(invite.offerUrl);
  const deadline = esc(invite.deadline);
  const role = invite.position
    ? ` for the <strong style="color:${NAVY};">${esc(invite.position)}</strong> role`
    : "";
  const rate = invite.rate ? ` at <strong style="color:${NAVY};">${esc(invite.rate)}</strong>` : "";

  const bullet = (text: string) => `
    <tr>
      <td style="padding:0 0 8px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
        <span style="color:${AMBER};font-weight:700;">&bull;</span>&nbsp; ${text}
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(offerReminderSubject(invite.position))}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  We are still holding your place. Please let us know either way by ${deadline}.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Your offer is still open
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Dear ${name}, we wrote to you recently with an offer${role}${rate}, and we have not
          heard back yet. <strong style="color:${NAVY};">We are still holding the place for
          you.</strong>
        </p>

        <!-- The deadline, given as a moment rather than a duration, and set
             apart so it survives being skim-read on a phone. -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:0 0 24px 0;">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 6px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                Please answer by
              </p>
              <p style="margin:0;font:800 19px/1.35 Arial,Helvetica,sans-serif;color:${NAVY};">
                ${deadline}
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 26px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Both answers are useful to us, and neither needs an explanation. If it is no, saying so
          takes one click and there is no awkwardness in it &mdash; plans change, and other offers
          come along.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Accept or decline my offer
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <!-- What happens next if nothing does. Said once, as a consequence
             rather than a threat: the reader may have been ill, or waiting on
             another employer, and neither deserves to be leaned on. -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:0 0 24px 0;">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                If we do not hear from you
              </p>
              <p style="margin:0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
                We will assume you are no longer interested, close your file, and remove your
                application and any documents you sent us from our system. Nothing further will be
                asked of you, and you would be welcome to apply again another time.
              </p>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                We will never ask you for
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${bullet("A payment of any kind, for anything, at any stage.")}
                ${bullet("Your bank card details, or a password.")}
                ${bullet("Money to release your first payment.")}
              </table>
            </td>
          </tr>
        </table>

        <p style="margin:22px 0 0 0;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          If you need more time, simply reply to this email and say so. A person will read it, and
          we would rather give you longer than lose you to a deadline.
        </p>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export function companyDetailsSubject(): string {
  return `Confirm your company details before we issue your ${siteConfig.company.name} agreement`;
}

export function companyDetailsText(invite: CompanyDetailsEmail): string {
  const name = firstNameOf(invite.fullName);
  return [
    `Dear ${name},`,
    ``,
    `Thank you for accepting our offer. You told us you are contracting through`,
    invite.companyName ? `${invite.companyName}, so your agreement and your` : `a company, so your agreement and your`,
    `invoices will be in the company's name rather than your own.`,
    ``,
    `Before we can draw the agreement up, we need the company's details`,
    `confirmed. Open your personal link:`,
    ``,
    invite.url,
    ``,
    `WHAT WE NEED`,
    ``,
    `- The company name and number, which we have pre-filled for you to check.`,
    `- The EIN.`,
    `- The registered address.`,
    `- The company website, or a sentence on what it does if it has none.`,
    `- A signed Form W-9.`,
    `- The Certificate of Formation, or Articles of Organization.`,
    `- The IRS EIN confirmation letter, if you have it. This one is optional.`,
    ``,
    `It takes a few minutes if the documents are to hand.`,
    ``,
    `WE WILL NEVER ASK YOU FOR`,
    ``,
    `- A payment of any kind, for anything, at any stage.`,
    `- Your bank card details or a password.`,
    `- Money to release your first payment.`,
    ``,
    `If your company is registered outside the United States, the form will ask`,
    `for details it does not have. Reply to this email instead and we will take`,
    `them another way.`,
    ``,
    `If anything here is unclear, simply reply to this email and a person will`,
    `answer you.`,
    ``,
    `Kind regards,`,
    `Recruitment Team`,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

export function companyDetailsHtml(invite: CompanyDetailsEmail): string {
  const name = esc(firstNameOf(invite.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(invite.url);
  const theirs = invite.companyName ? esc(invite.companyName) : "";

  const bullet = (text: string) => `
    <tr>
      <td style="padding:0 0 8px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
        <span style="color:${AMBER};font-weight:700;">&bull;</span>&nbsp; ${text}
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(companyDetailsSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your agreement is with your company, so we need its details confirmed.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Confirm your company details
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Dear ${name}, thank you for accepting our offer. You told us you are contracting through
          ${theirs ? `<strong style="color:${NAVY};">${theirs}</strong>` : "a company"}, so your
          agreement and your invoices will be in the company&rsquo;s name rather than your own.
        </p>

        <p style="margin:0 0 26px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Before we can draw the agreement up, we need the company&rsquo;s details confirmed. Your
          link below is pre-filled with what you told us, for you to check.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:0 0 26px 0;">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                What we need
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${bullet("The company name and number, pre-filled for you to check.")}
                ${bullet("The EIN and the registered address.")}
                ${bullet("The company website &mdash; or, if it has none, a sentence on what it does.")}
                ${bullet("A signed <strong style=\"color:" + NAVY + ";\">Form W-9</strong>.")}
                ${bullet("The <strong style=\"color:" + NAVY + ";\">Certificate of Formation</strong>, or Articles of Organization.")}
                ${bullet("The IRS EIN confirmation letter &mdash; optional, if you have it.")}
              </table>
              <p style="margin:10px 0 0 0;font:400 14px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
                A few minutes, if the documents are to hand.
              </p>
            </td>
          </tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Confirm company details
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#fffaf0;border:2px solid ${AMBER};border-radius:10px;">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                We will never ask you for
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${bullet("A payment of any kind, for anything, at any stage.")}
                ${bullet("Your bank card details, or a password.")}
                ${bullet("Money to release your first payment.")}
              </table>
            </td>
          </tr>
        </table>

        <p style="margin:22px 0 0 0;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          If your company is registered outside the United States, the form will ask for details it
          does not have &mdash; reply to this email instead and we will take them another way. And
          if anything else is unclear, reply and a person will answer you.
        </p>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export interface OfferEmail {
  fullName: string;
  position: string;
  /** Already formatted, e.g. "$22 per hour". */
  rate: string;
  engagement: string;
  hoursPerWeek?: number;
  startDate?: string;
  probation?: string;
  note?: string;
  /** Where "Accept this offer" leads. Absent only when a link cannot be built. */
  acceptUrl?: string;
  /** Same page, opened on the decline path. */
  declineUrl?: string;
  /**
   * The specimen agreement, when one is published. Linked rather than
   * attached: a PDF attachment from a young sending domain is a well-known
   * spam signal, and an offer that lands in junk is worse than one without a
   * sample.
   */
  sampleUrl?: string;
  sampleVersion?: string;
}

/**
 * The written job offer.
 *
 * Written, and by email, on purpose. An offer agreed only on a call is a
 * disagreement waiting to happen about what the rate was, and a candidate
 * about to leave another job deserves something they can re-read.
 *
 * It is an offer, not a contract. It says so, because a candidate who treats
 * this as the final word and resigns on the strength of it is a problem for
 * both sides.
 *
 * The subject leads with the good news rather than the paperwork, in sentence
 * case: a capital on every word reads as a newsletter and leans towards the
 * Promotions tab, and "!", prize or money wording in a subject is what scam
 * filters look for. The role is in the body, where the terms are.
 */
export function offerSubject(): string {
  return `Good news | A place is available for you at ${siteConfig.company.name}`;
}

function offerRows(o: OfferEmail): [string, string][] {
  const rows: [string, string][] = [
    ["Position", o.position],
    ["Pay", o.rate],
    ["Engagement", o.engagement],
  ];
  if (o.hoursPerWeek) rows.push(["Hours", `${o.hoursPerWeek} per week`]);
  if (o.startDate) {
    rows.push([
      "Start date",
      new Date(`${o.startDate}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
      }),
    ]);
  }
  if (o.probation) rows.push(["Probation", o.probation]);
  return rows;
}

/** Plain-text part of the offer. */
export function offerText(o: OfferEmail): string {
  const name = firstNameOf(o.fullName);
  return [
    `Congratulations, ${name}`,
    ``,
    `Dear ${name},`,
    ``,
    `We're delighted to let you know that, following your interview, a place is`,
    `available for you on our team, and we would like to offer you the position`,
    `of ${o.position} at ${siteConfig.company.name}.`,
    ``,
    `Your application stood out, and the team is looking forward to welcoming`,
    `you. The terms of your offer are set out below.`,
    ``,
    `TERMS OF THE OFFER`,
    ...offerRows(o).map(([k, v]) => `  ${k}: ${v}`),
    ...(o.note ? [``, o.note] : []),
    ``,
    ...(o.acceptUrl
      ? [
          `HOW TO ACCEPT`,
          ``,
          `Please confirm your acceptance using the link below. You will be asked to`,
          `check the personal details we hold for you and correct anything that is`,
          `out of date, so that your agreement can be drawn up accurately. It takes`,
          `two or three minutes.`,
          ``,
          o.acceptUrl,
          ``,
          `This link is personal to you.`,
          ``,
          ...(o.declineUrl
            ? [
                `If you have decided not to take up this offer, please let us know here:`,
                o.declineUrl,
                ``,
              ]
            : []),
        ]
      : [
          `To accept, simply reply to this email and let us know.`,
          ``,
        ]),
    ...(o.sampleUrl
      ? [
          `THE TERMS IN FULL`,
          ``,
          `Before you decide, you can read the agreement an engagement with us is`,
          `made on:`,
          ``,
          o.sampleUrl,
          ``,
          `That is a specimen for your information${o.sampleVersion ? ` (version ${o.sampleVersion})` : ""}. Your own agreement is`,
          `drawn up after you accept, with your details in it, and is sent to you`,
          `for signature.`,
          ``,
        ]
      : []),
    `WHAT HAPPENS NEXT`,
    ``,
    `When you accept, you will be asked to confirm your details and — unless you`,
    `have already sent them — a photo of your ID document and one of you holding`,
    `it. We ask this of everyone before an agreement is drawn up. It takes about`,
    `a minute.`,
    ``,
    `Once that is done, we will prepare your written agreement and send it for`,
    `signature, together with everything you need for your first day.`,
    ``,
    `Please note that this is an offer of engagement and not a contract of`,
    `employment; the written agreement follows once you accept.`,
    ``,
    `For your security: we will never ask you for a payment, a bank card, or a`,
    `password at any stage of this process. Your bank details are needed only`,
    `after the written agreement has been signed.`,
    ``,
    `If you have any questions about the offer, please reply to this email or`,
    `write to ${siteConfig.contact.recruitmentEmail} and we will be glad to help.`,
    ``,
    `We very much hope you will join us.`,
    ``,
    `Kind regards,`,
    `Recruitment Team`,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

/** HTML part of the offer. */
export function offerHtml(o: OfferEmail): string {
  const name = esc(firstNameOf(o.fullName));
  const company = esc(siteConfig.company.name);

  /**
   * The acceptance block.
   *
   * It says what the page will ask for before they click. A button that leads
   * to an unexpected form asking for identity details is exactly what a
   * cautious candidate should refuse to click — so the email sets the
   * expectation, and the anti-fraud note below reinforces what will never be
   * asked. Falls back to "reply to this email" if no link could be built,
   * because an offer with no way to accept it is worse than an old-fashioned
   * one.
   */
  /**
   * The terms in full, before the button rather than after it.
   *
   * Candidates have asked for this repeatedly, and one declined to give an
   * identity number until she had seen it. Rendered only when a document is
   * published — a link to a file that is not there is evidence against you to
   * someone deciding whether a remote offer is real.
   */
  const sample = o.sampleUrl
    ? `
        <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
          The terms in full
        </p>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Before you decide, you are welcome to read the agreement an engagement with us is made
          on: <a href="${esc(o.sampleUrl)}" style="color:#b06e0c;font-weight:bold;">the sample
          contractor agreement</a>${o.sampleVersion ? ` (version ${esc(o.sampleVersion)})` : ""}. It is a specimen for your
          information — your own agreement is drawn up after you accept, with your details in it,
          and sent to you for signature.
        </p>
`
    : "";

  const accept = o.acceptUrl
    ? `
        <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
          How to accept
        </p>

        <p style="margin:0 0 20px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Please confirm your acceptance below. You will be asked to check the personal details we
          hold for you and correct anything out of date, so your agreement can be drawn up
          accurately. It takes two or three minutes.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${esc(o.acceptUrl)}" style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Accept this offer
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 6px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          This link is personal to you.
        </p>
        ${
          o.declineUrl
            ? `<p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Decided not to take up this offer?
          <a href="${esc(o.declineUrl)}" style="color:#b06e0c;">Let us know here</a>.
        </p>`
            : `<div style="height:20px;line-height:20px;">&nbsp;</div>`
        }
`
    : `
        <p style="margin:0 0 26px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          To accept, simply <strong style="color:${NAVY};">reply to this email</strong> and let us
          know.
        </p>
`;

  const rows = offerRows(o)
    .map(
      ([k, v]) => `
          <tr>
            <td style="padding:9px 0;border-bottom:1px solid ${BORDER};font:400 15px/1.5 Arial,Helvetica,sans-serif;color:${MUTED};width:40%;">${esc(k)}</td>
            <td style="padding:9px 0;border-bottom:1px solid ${BORDER};font:700 15px/1.5 Arial,Helvetica,sans-serif;color:${NAVY};">${esc(v)}</td>
          </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(offerSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your offer is ready — pay, hours and how to accept are inside.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Congratulations, ${name}
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Dear ${name},
        </p>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          We&rsquo;re delighted to let you know that, following your interview,
          <strong style="color:${NAVY};">a place is available for you on our team</strong>, and we
          would like to offer you the position of
          <strong style="color:${NAVY};">${esc(o.position)}</strong> at ${company}.
        </p>

        <p style="margin:0 0 26px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Your application stood out, and the team is looking forward to welcoming you. The
          terms of your offer are set out below.
        </p>

        <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
          Terms of the offer
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px 0;">
          ${rows}
        </table>

        ${
          o.note
            ? `<p style="margin:0 0 26px 0;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">${esc(o.note)}</p>`
            : ""
        }

        ${accept}

        ${sample}

        <p style="margin:0 0 10px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
          What happens next
        </p>

        <p style="margin:0 0 24px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          When you accept, you will be asked to confirm your details and &mdash; unless you have
          already sent them &mdash; a photo of your ID document and one of you holding it. We ask
          this of everyone before an agreement is drawn up. It takes about a minute.
        </p>

        <p style="margin:0 0 24px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Once that is done, we will prepare your written agreement and send it for signature,
          together with everything you need for your first day.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:18px 22px;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
              Please note this is an offer of engagement, not a contract &mdash; the written
              agreement follows once you accept. For your security, we will
              <strong style="color:${NAVY};">never</strong> ask you for a payment, a bank card, or
              a password at any stage, and your bank details are needed only after the agreement
              has been signed.
            </td>
          </tr>
        </table>

        <p style="margin:24px 0 0 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          If you have any questions about the offer, simply reply to this email and we will be
          glad to help. We very much hope you will join us.
        </p>

        <p style="margin:20px 0 0 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          Kind regards,<br>
          <strong style="color:${NAVY};">Recruitment Team</strong><br>
          ${company}
        </p>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export interface VoiceAssessmentInvite {
  fullName: string;
  email: string;
  position?: string;
  /**
   * Where the recording is made — their own assessment link.
   *
   * Recordings used to be asked for on WhatsApp. A number that dozens of
   * strangers message, sending links out, is the pattern the platform bans,
   * and it did, repeatedly. It also meant matching a voice note to a name by
   * hand. Sending them to their own link solves both: nothing to match, and no
   * personal number in front of a stranger.
   */
  recordUrl: string;
}

/**
 * Subject for the merged interview-success + voice-assessment email.
 *
 * This single email now carries what used to be two separate WhatsApp
 * messages: the congratulations, and the request itself.
 *
 * It does not carry the script. The script belongs on the page where the
 * recording is made, in front of them while they read it — in the email it
 * only invited people to read from a phone they were also recording on, and
 * it made a short, clear message into a wall of text that buries the one
 * thing they have to do.
 */
export function voiceAssessmentSubject(): string {
  return `Congratulations — next step: your voice assessment`;
}

/** Plain-text part. */
export function voiceAssessmentText(invite: VoiceAssessmentInvite): string {
  const name = firstNameOf(invite.fullName);
  return [
    `Dear ${name},`,
    ``,
    // Two sentences, one line each. The role is interpolated and can be long,
    // so it ends a sentence rather than sitting mid-clause across a hand-made
    // line break, which read as three fragments.
    `Congratulations. You have passed the online interview${invite.position ? ` for the ${invite.position} role` : ""}.`,
    `We are pleased to invite you to the next stage.`,
    ``,
    `The next step is a short voice assessment. It helps us hear your pronunciation,`,
    `fluency and clarity — the things a written interview cannot show us.`,
    ``,
    `Open your personal link and follow the steps on the page:`,
    ``,
    invite.recordUrl,
    ``,
    `You will find a short passage to read aloud, and you can record it directly on the`,
    `page or attach a recording made with your phone. Please do it somewhere quiet. It`,
    `takes about a minute, and you can listen back and record again before you send it.`,
    ``,
    `The link is personal to you, so there is nothing you need to write and nothing for`,
    `us to match up.`,
    ``,
    `If you have any questions, simply reply to this email.`,
    ``,
    `Kind regards,`,
    `Recruitment Team`,
    `${siteConfig.company.name} — ${siteConfig.company.descriptor}`,
    siteConfig.url,
  ].join("\n");
}

/** HTML part. */
export function voiceAssessmentHtml(invite: VoiceAssessmentInvite): string {
  const name = esc(firstNameOf(invite.fullName));
  const company = esc(siteConfig.company.name);
  const url = esc(invite.recordUrl);
  const role = invite.position ? ` for the <strong style="color:${NAVY};">${esc(invite.position)}</strong> role` : "";

  /** One numbered line of "what happens on the page". */
  const step = (n: number, text: string) => `
    <tr>
      <td width="26" valign="top" style="padding:0 0 12px 0;font:700 15px/1.55 Arial,Helvetica,sans-serif;color:#b06e0c;">
        ${n}.
      </td>
      <td style="padding:0 0 12px 0;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
        ${text}
      </td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(voiceAssessmentSubject())}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  You have passed the interview. Your voice assessment takes about a minute.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">

    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font:800 21px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">${company}</td></tr>
          <tr><td style="padding-top:4px;font:700 10px/1 Arial,Helvetica,sans-serif;color:#b06e0c;letter-spacing:2px;text-transform:uppercase;">${esc(siteConfig.company.descriptor)}</td></tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;padding:38px 34px;">

        <h1 style="margin:0 0 20px 0;font:800 25px/1.25 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:-0.5px;">
          Congratulations, ${name}
        </h1>

        <p style="margin:0 0 16px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          You have passed the online interview${role}, and we are pleased to invite you to the
          next stage.
        </p>

        <p style="margin:0 0 26px 0;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          The next step is a short <strong style="color:${NAVY};">voice assessment</strong>. It
          helps us hear your pronunciation, fluency and clarity &mdash; the things a written
          interview cannot show us. It takes about a minute.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px 0;">
          <tr>
            <td align="center" bgcolor="${AMBER}" style="border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:15px 40px;font:700 16px/1 Arial,Helvetica,sans-serif;color:${NAVY};text-decoration:none;border-radius:999px;">
                Start your voice assessment
              </a>
            </td>
          </tr>
        </table>

        <!-- What is behind the button, so pressing it is not a leap of faith.
             The passage itself stays on the page: in an email it invited
             people to read from the phone they were recording on, and it
             buried the one thing they actually have to do. -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;margin:0 0 26px 0;">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 14px 0;font:700 12px/1 Arial,Helvetica,sans-serif;color:${NAVY};letter-spacing:1.4px;text-transform:uppercase;">
                What happens on the page
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${step(1, "A short passage is shown for you to read aloud.")}
                ${step(2, "Record it there and then, or attach a recording made with your phone.")}
                ${step(3, "Listen back, and record again if you would like to.")}
                ${step(4, "Send it. Nothing to write, nothing to attach to an email.")}
              </table>
              <p style="margin:6px 0 0 0;font:400 14px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
                Please record somewhere quiet, at your normal speaking pace.
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 26px 0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#7373a0;">
          Button not working? Copy this link into your browser:<br>
          <a href="${url}" style="color:#b06e0c;word-break:break-all;">${url}</a>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:${CREAM};border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:18px 22px;font:400 15px/1.55 Arial,Helvetica,sans-serif;color:${MUTED};">
              This link is personal to you. Please do not share it &mdash; it is how we know the
              recording is yours.
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding:22px 8px 0 8px;font:400 13px/1.65 Arial,Helvetica,sans-serif;color:#7373a0;">
        Questions? Reply to this email or write to
        <a href="mailto:${esc(siteConfig.contact.recruitmentEmail)}" style="color:#b06e0c;">${esc(siteConfig.contact.recruitmentEmail)}</a>.
        <br><br>
        ${company} &mdash; ${esc(siteConfig.company.descriptor)}<br>
        <a href="${esc(siteConfig.url)}" style="color:#7373a0;">${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</a>
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}
