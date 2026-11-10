/**
 * =============================================================================
 *  WORKROUTE — CENTRAL SITE CONFIGURATION
 * =============================================================================
 *
 *  This file is the single source of truth for all editable company content.
 *  A non-technical website owner should be able to update most of the site by
 *  editing the values in THIS FILE ONLY.
 *
 *  ⚠️  PLACEHOLDER NOTICE
 *  Values marked with `// PLACEHOLDER` MUST be reviewed and replaced with real,
 *  verified company information BEFORE the website is published. This includes
 *  legal/company registration details, contact details, statistics, and
 *  testimonials.
 *
 *  ⚠️  RECRUITMENT EMAIL
 *  Change `recruitmentEmail` below (and, if you use a backend, the matching
 *  server environment variable RECRUITMENT_EMAIL) to control where job
 *  applications are delivered.
 * =============================================================================
 */

export const siteConfig = {
  /** Public site URL — used for canonical URLs, sitemap and Open Graph. */
  url: "https://workroute.co.uk",

  /**
   * The specimen contractor agreement candidates can read before accepting.
   *
   * Set `file` to a PDF placed in `public/` and it appears on the offer page
   * and in the offer email. Leave it empty and nothing is shown anywhere —
   * which is the correct behaviour until there is a document to show, because
   * a link to a missing file reads worse to a candidate than no link at all.
   *
   * `version` is printed beside the link, and is empty on purpose: the
   * document itself carries no version, and a revision date shown next to a
   * link but nowhere in the file it opens is worse than none — it looks like a
   * mistake. The filename still carries the revision, which is what stops a
   * browser serving a cached copy of the old document in place of the new.
   * Change the filename whenever the wording changes.
   *
   * It must be marked as a specimen on its own pages. What is linked here is
   * information, not the agreement — the agreement is issued for signature
   * after acceptance, with their own details in it.
   */
  sampleAgreement: {
    /** e.g. "sample-contractor-agreement-2026-10-02-c.pdf". Empty = not published. */
    file: "sample-contractor-agreement-2026-10-02-c.pdf",
    version: "",
  },

  /**
   * The timezone the business runs on, as an IANA name.
   *
   * Only the dashboard uses it, and only to decide where one day ends and the
   * next begins: counted in UTC, "today" would reset at 1am local and every
   * daily figure would be an hour out of step with the person reading it.
   *
   * An IANA name rather than a fixed offset on purpose — Morocco sits at UTC+1
   * but drops to UTC+0 for Ramadan, so a hardcoded "+1" would be wrong for a
   * month a year, and wrong differently each year.
   */
  timeZone: "Africa/Casablanca",

  company: {
    name: "WorkRoute",
    shortName: "WorkRoute",
    descriptor: "Customer Experience",
    tagline: "Build Your Career. Connect With People. Make a Difference.",
    logoInitials: "WR",
    description:
      "WorkRoute is a customer-experience and business-process outsourcing company committed to helping brands build stronger relationships with their customers. Our teams provide high-quality phone, live chat, email, technical, and sales support across different industries and international markets.",
    descriptionExtended:
      "We believe that excellent customer service begins with excellent people. That is why we invest in training, professional development, teamwork, communication, and a positive working environment. Whether you already have customer-service experience or are beginning your professional career, WorkRoute gives you the tools, support, and opportunities needed to succeed.",
    values: [
      {
        title: "Customer First",
        description:
          "Every decision starts with the people we serve and the experiences we create for them.",
      },
      {
        title: "Respect and Inclusion",
        description:
          "We welcome people of all backgrounds and build teams where everyone belongs.",
      },
      {
        title: "Clear Communication",
        description:
          "We listen carefully and speak clearly, in every language and on every channel.",
      },
      {
        title: "Teamwork",
        description:
          "We achieve more together, supporting one another to deliver our best work.",
      },
      {
        title: "Continuous Improvement",
        description:
          "We learn, measure, and refine so our service keeps getting better.",
      },
      {
        title: "Professional Integrity",
        description:
          "We act honestly, protect customer trust, and do the right thing.",
      },
    ],
  },

  /** ----------------------------------------------------------------------- */
  /** CONTACT — editable placeholders, review before publishing.              */
  /** ----------------------------------------------------------------------- */
  contact: {
    recruitmentEmail: "careers@workroute.co.uk",
    supportEmail: "support@workroute.co.uk",
    privacyEmail: "privacy@workroute.co.uk",
    /**
     * The published contact number.
     *
     * Voice assessments no longer come here. They used to arrive as WhatsApp
     * voice notes, which got the number banned repeatedly — a number that
     * dozens of strangers message, with links going out, is the pattern the
     * platform acts on — and meant matching a voice note to a name by hand.
     * Candidates now record on their own assessment link.
     */
    phone: "+44 7451 272838",
    address: {
      line1: "86-90 Paul Street",
      line2: "3rd Floor",
      city: "London",
      region: "England",
      postalCode: "EC2A 4NE",
      country: "United Kingdom",
    },
    businessHours: "Monday – Friday, 9:00 AM – 6:00 PM (local time)", // PLACEHOLDER
    /** Optional Google Maps embed URL. Leave empty to hide the map. */
    mapEmbedUrl: "", // PLACEHOLDER — paste a Google Maps embed URL if available
  },

  /**
   * The least time a listing is marked open for, in days from its datePosted.
   * The job page keeps it at least 30 days ahead after that, while the role is
   * listed — see jobPostingJsonLd.
   */
  jobValidityDays: 90,

  /** Links shown as icons in the footer and the contact section. Empty: none shown. */
  social: [] as ReadonlyArray<{ label: string; href: string; icon: "facebook" }>,

  /** ----------------------------------------------------------------------- */
  /** LEGAL / COMPANY REGISTRATION — must be completed by the company.        */
  /** ----------------------------------------------------------------------- */
  legal: {
    /**
     * The company that actually contracts, which is not the name on the door.
     *
     * WorkRoute is a trading name; agreements, invoices and anything a
     * candidate could take to a court or a register are in the name of WORK
     * AGENCY LTD. Keeping the two straight is the whole job of a legal
     * notice — somebody checking us at Companies House searches the registered
     * name and finds nothing under the brand.
     */
    registeredName: "WORK AGENCY LTD",
    tradingName: "WorkRoute",
    businessType: "Private Limited Company",
    /** Companies House, England and Wales. */
    registrationNumber: "13485913",
    registeredIn: "England and Wales",
    registeredAddress: "86-90 Paul Street, 3rd Floor, London, England, EC2A 4NE",
    websiteOwner: "WORK AGENCY LTD",
    /**
     * Who runs the servers, in their own legal name.
     *
     * Empty until it is known, and the legal notice leaves the row out rather
     * than printing filler. A legal page carrying "Your Hosting Provider Inc.,
     * 1 Datacenter Road, Country" is worse than one that is silent on the
     * question: it is the first thing anybody checking this company would
     * notice, and it makes every other row on the page look unverified too.
     */
    hostingProvider: "",
    /** How long applicant data is retained, in months. Used across legal pages. */
    applicantDataRetentionMonths: 12, // PLACEHOLDER — confirm with legal counsel
  },

  /** ----------------------------------------------------------------------- */
  /** FINAL AGREEMENT — the terms that are the same for every contractor.     */
  /** ----------------------------------------------------------------------- */
  /**
   * Filled into the schedule of the Independent Contractor Agreement sent to a
   * Full verified candidate (see lib/agreementPdf). Everything personal —
   * name, address, rate, hours, start date, window and days — comes from the
   * candidate's accepted offer and confirmed details instead.
   *
   * Changing a value here changes agreements sent from then on. Ones already
   * sent keep the copy that was emailed.
   */
  agreement: {
    /** "Within N working days of a correct invoice." */
    paymentWorkingDays: 15,
    /** "N days, by either party, in writing." */
    noticeDays: 14,
    governingLaw: "England and Wales",
    /** Who signs for the Company. */
    signatoryName: "Patrick Meyer",
    signatoryTitle: "Director",
  },

  /** ----------------------------------------------------------------------- */
  /** COMPANY STATISTICS — REVIEW & VERIFY before publishing.                 */
  /** These are illustrative placeholders only.                               */
  /** ----------------------------------------------------------------------- */
  stats: [
    { value: "10M+", label: "Customer interactions supported" }, // PLACEHOLDER
    { value: "15+", label: "Languages covered" }, // PLACEHOLDER
    { value: "1,200+", label: "Team members" }, // PLACEHOLDER
    { value: "30+", label: "Markets served" }, // PLACEHOLDER
    { value: "50,000+", label: "Training hours delivered" }, // PLACEHOLDER
  ],

  /**
   * Languages available in the application form's language picker.
   * Edit this list to match the languages your roles require.
   */
  languages: [
    "English",
    "Spanish",
    "French",
    "German",
    "Portuguese",
    "Italian",
    "Dutch",
    "Arabic",
    "Mandarin Chinese",
    "Hindi",
    "Russian",
    "Polish",
    "Turkish",
    "Japanese",
    "Korean",
  ],

  proficiencyLevels: ["Beginner", "Intermediate", "Advanced", "Fluent", "Native"],

  workArrangements: ["Remote"],

  employmentTypes: ["Full-time", "Part-time", "Temporary", "No preference"],

  supportTypes: [
    "Phone",
    "Live chat",
    "Email",
    "Technical support",
    "Sales",
    "Retention",
    "Social media support",
  ],

  educationLevels: [
    "High school / secondary",
    "Vocational / professional certificate",
    "Associate degree",
    "Bachelor's degree",
    "Master's degree",
    "Doctorate",
    "Other",
  ],

  referralSources: [
    "Company website",
    "LinkedIn",
    "Job board",
    "Social media",
    "Referred by an employee",
    "Search engine",
    "Career fair / event",
    "Other",
  ],

  /** File-upload constraints used by the form and the uploader component. */
  upload: {
    maxFileSizeMB: 5,
    acceptedExtensions: [".pdf", ".doc", ".docx"],
    acceptedMimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
} as const;

export type SiteConfig = typeof siteConfig;

/** Convenience: a single-line, human-readable office address. */
export function formatAddress(): string {
  const a = siteConfig.contact.address;
  const regionPostal = [a.region, a.postalCode].filter(Boolean).join(" ");
  const cityLine = [a.city, regionPostal].filter(Boolean).join(", ");
  return [a.line1, a.line2, cityLine, a.country].filter(Boolean).join(", ");
}
