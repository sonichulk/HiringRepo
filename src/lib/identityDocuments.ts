/**
 * Which documents we accept as proof of identity, and what each one needs.
 *
 * Pure module: the upload card, the upload routes and the Admin Panel all read
 * the same three types and the same rule about backs from here.
 *
 * Three types and no "other". A photograph of something we do not recognise is
 * not evidence of anything — it cannot be checked against a face, a name or an
 * expiry date — and accepting one only produces a record that looks verified
 * and is not. Someone holding none of the three is a conversation with a
 * recruiter, not a form field.
 */
import { currentDocument, type CandidateDocument, type DocumentKind } from "@/lib/documents";

export const ID_DOCUMENT_TYPES = ["passport", "national-id", "drivers-licence"] as const;
export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number];

export function isIdDocumentType(v: unknown): v is IdDocumentType {
  return typeof v === "string" && (ID_DOCUMENT_TYPES as readonly string[]).includes(v);
}

export const ID_DOCUMENT_LABEL: Record<IdDocumentType, string> = {
  passport: "Passport",
  "national-id": "National identity card",
  "drivers-licence": "Driver's licence",
};

/** What to look for when choosing, in the candidate's own terms. */
export const ID_DOCUMENT_HINT: Record<IdDocumentType, string> = {
  passport: "The page with your photograph on it",
  "national-id": "Both sides needed",
  "drivers-licence": "Both sides needed",
};

/**
 * Filtering a table by which document somebody sent.
 *
 * Built from the three types rather than written out again, so a fourth kind
 * of document would appear in the filter by existing rather than by somebody
 * remembering this list.
 *
 * "Not recorded" is the row that would otherwise be unreachable, and it covers
 * two different people: somebody who has sent nothing yet, and somebody who
 * uploaded before the picker existed, whose photographs are on file with
 * nothing saying which document they are of. Both show a dash, and asking for
 * the dash has to return them.
 */
/**
 * What an ID photo turned out to be, read from the photo itself
 * (scripts/scan-id-types.mjs). Admin only: candidates choose from
 * ID_DOCUMENT_TYPES and are never offered these extra two — the site does not
 * ask for an Aadhaar card. They exist so a recruiter can see, and filter, who
 * sent one anyway.
 */
export const ID_SCAN_TYPES = ["passport", "national-id", "drivers-licence", "aadhaar", "pan"] as const;
export type IdScanType = (typeof ID_SCAN_TYPES)[number];

export function isIdScanType(v: unknown): v is IdScanType {
  return typeof v === "string" && (ID_SCAN_TYPES as readonly string[]).includes(v);
}

export const ID_SCAN_LABEL: Record<IdScanType, string> = {
  ...ID_DOCUMENT_LABEL,
  aadhaar: "Aadhaar card",
  pan: "PAN card",
};

export type IdTypeFilter = "all" | IdScanType | "none";

export const ID_TYPE_FILTERS: { value: IdTypeFilter; label: string }[] = [
  { value: "all", label: "Any document" },
  ...ID_SCAN_TYPES.map((t) => ({ value: t as IdTypeFilter, label: ID_SCAN_LABEL[t] })),
  { value: "none", label: "Not recorded" },
];

/** By what they said they sent, or by what the photo was read as. */
export function matchesIdTypeFilter(filter: IdTypeFilter, type?: string, readAs?: string): boolean {
  if (filter === "all") return true;
  if (filter === "none") return !type && !readAs;
  return type === filter || readAs === filter;
}

/**
 * Does this document carry information on the reverse?
 *
 * A passport's photo page holds everything. A card does not: the number, the
 * expiry date, the address or the machine-readable strip are as often on the
 * back as the front, and which side they are on differs by country. Asking for
 * both is the only rule that works everywhere without a table of 200
 * exceptions.
 */
export function needsBack(type: IdDocumentType): boolean {
  return type !== "passport";
}

/** The photographs this type of document requires, in the order they are asked. */
export function requiredKinds(type: IdDocumentType): DocumentKind[] {
  return needsBack(type)
    ? ["identity", "identityBack", "selfie"]
    : ["identity", "selfie"];
}

/**
 * Are the photographs for this type all present and usable?
 *
 * `type` is undefined for everyone who uploaded before the picker existed.
 * Their records hold a front and a selfie and nothing says which document it
 * was, so the old rule is the right one to judge them by — re-deriving those
 * as incomplete would send hundreds of already-verified people round again for
 * a photograph we never asked them for.
 */
export function hasIdentityImages(
  documents: CandidateDocument[] | undefined,
  type?: IdDocumentType,
): boolean {
  // The current one only. A superseded photograph is history, not an answer:
  // counting it would leave someone "provided" on the strength of the picture
  // that was replaced.
  const usable = (kind: DocumentKind) => {
    const doc = currentDocument(documents, kind);
    return !!doc && doc.status !== "blocked" && !!doc.key;
  };
  const kinds = type ? requiredKinds(type) : (["identity", "selfie"] as DocumentKind[]);
  return kinds.every(usable);
}
