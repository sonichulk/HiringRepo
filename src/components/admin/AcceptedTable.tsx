"use client";

import { gstinAsked, panExpected } from "@/lib/pan";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { FULL_VERIFIED, REJECTED } from "@/lib/candidateStatus";
import { rowTone, stickyTone, rowEdge } from "@/components/admin/rowTone";
import { CandidateInfoButton } from "@/components/admin/CandidateInfoButton";
import { DeleteCandidateButton } from "@/components/admin/DeleteCandidateButton";
import { RefreshButton } from "@/components/admin/RefreshButton";
import { VerificationBadge } from "@/components/admin/VerificationPanel";
import { CandidateProfileModal, openProfileOn } from "@/components/admin/CandidateProfileModal";
import { DocumentViewer } from "@/components/admin/DocumentViewer";
import { AddressReviewViewer, hasAddressDocument } from "@/components/admin/AddressReviewViewer";
import { useProfileNav } from "@/components/admin/useProfileNav";
import {
  HideCountryPicker,
  HiddenCountryChips,
  useHiddenCountries,
} from "@/components/admin/HiddenCountries";
import { useBulkCompanyCheck } from "@/components/admin/BulkCompanyCheck";
import { useBulkEmail } from "@/components/admin/BulkEmailBar";
import { ACCEPTED_ACTIONS } from "@/lib/bulkEmail";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/admin/Pagination";
import { adminPost } from "@/lib/adminClient";
import { formatRate } from "@/lib/offer";
import type { CandidateDocument } from "@/lib/documents";
import type { CandidateStatus } from "@/lib/candidateStatus";
import type { CandidateView } from "@/lib/candidateView";
import { ADDRESS_STATUS_LABEL, type AddressProofStatus } from "@/lib/addressProof";
import { AGREEMENT_STATUS_LABEL, type AgreementStatus } from "@/lib/agreement";
import { ID_TYPE_FILTERS, matchesIdTypeFilter, type IdTypeFilter } from "@/lib/identityDocuments";
import { FOLLOWUP_FILTERS, matchesFollowupFilter, type FollowupFilter } from "@/lib/chat";
import { FollowupTag } from "@/components/admin/FollowupTag";

/** The proof-of-address tag's colour, by where it stands. */
const ADDRESS_TAG: Record<AddressProofStatus, string> = {
  not_asked: "border-navy-200 bg-navy-50 text-navy-600",
  asked: "border-amber-200 bg-amber-50 text-amber-800",
  received: "border-blue-200 bg-blue-50 text-blue-800",
  approved: "border-green-200 bg-green-50 text-green-800",
};

/** The final-agreement button's look, by where it stands. */
const AGREEMENT_BUTTON: Record<AgreementStatus, { label: string; cls: string; icon: "send" | "clock" | "fileCheck" | "checkCircle" }> = {
  not_sent: { label: "Send agreement", cls: "border-brand-300 bg-brand-500 text-navy-900 hover:bg-brand-400", icon: "send" },
  sent: { label: "Agreement sent", cls: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100", icon: "clock" },
  signed: { label: "Check signed", cls: "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100", icon: "fileCheck" },
  approved: { label: "Agreement", cls: "border-green-200 bg-green-50 text-green-800 hover:bg-green-100", icon: "checkCircle" },
};

/**
 * Everyone who said yes.
 *
 * Both routes to an acceptance land here — the candidate confirming through
 * the link in their offer email, and the recruiter marking it by hand after a
 * call — because "who accepted" is one question, not two.
 *
 * The column that earns its place is "Details confirmed": an offer accepted
 * on a call still has whatever the candidate typed into the application form
 * behind it, and that is exactly the data you cannot write an agreement from.
 */

/** This tab's own hidden list — see HiddenCountries for why it is per tab. */
const HIDDEN_COUNTRIES_KEY = "wr.accepted.hiddenCountries";

function fmt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Where an accepted candidate stands on the GSTIN, for the filter and the row
 * tag: null when it does not apply (outside India, or a GSTIN is on file),
 * otherwise whether any GSTIN email — "Request GSTIN" or "Your place is
 * waiting" — has been sent.
 */
function gstinGroup(c: CandidateView): "asked" | "never" | null {
  if (c.gstin || !panExpected(c.confirmedDetails?.country ?? c.country)) return null;
  return gstinAsked(c).count > 0 ? "asked" : "never";
}

function fmtDay(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

export function AcceptedTable({
  rows,
  teamMembers = {},
  teamAdminUrl = "",
}: {
  rows: CandidateView[];
  /** Candidate id → team member id, for those already on the team. */
  teamMembers?: Record<string, string>;
  /** The team panel lives on its own domain (workroute.team). */
  teamAdminUrl?: string;
}) {
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const hiddenCountries = useHiddenCountries(HIDDEN_COUNTRIES_KEY);
  // Replaces the old "Details confirmed" filter: the question asked of this
  // list now is whether somebody is Full verified.
  const [verified, setVerified] = useState<"all" | "yes" | "no">("all");
  const [engagedAs, setEngagedAs] = useState<"all" | "Individual" | "Company">("all");
  // GSTIN is only asked of people in India, so "empty" means somebody in India
  // without one — the people a Request GSTIN email is for — not everyone else.
  const [gstin, setGstin] = useState<"all" | "yes" | "no" | "asked" | "never">("all");
  // The final interview is the live chat: has its link been emailed yet?
  const [chatSent, setChatSent] = useState<"all" | "yes" | "notStarted" | "no">("all");
  const [addressProof, setAddressProof] = useState<"all" | AddressProofStatus>("all");
  const [agreement, setAgreement] = useState<"all" | AgreementStatus>("all");
  const [idType, setIdType] = useState<IdTypeFilter>("all");
  const [followup, setFollowup] = useState<FollowupFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const tableTop = useRef<HTMLDivElement>(null);

  // Edits made in the profile dialog, so a note or a status change is
  // reflected without a reload — same pattern as the Interviews tab.
  const [patches, setPatches] = useState<Record<string, Partial<CandidateView>>>({});
  /**
   * Rows deleted since this page was rendered.
   *
   * Kept beside the patches rather than by holding a copy of `rows`: the list
   * arrives as a prop from the server, and a second copy of it would go stale
   * against every other reason it changes. A deleted record is gone — a list
   * still showing it is lying.
   */
  const [deleted, setDeleted] = useState<string[]>([]);
  const live = useMemo(
    () =>
      rows
        .filter((r) => !deleted.includes(r.id))
        .map((r) => (patches[r.id] ? { ...r, ...patches[r.id] } : r)),
    [rows, patches, deleted],
  );

  const countries = useMemo(
    () => [...new Set(rows.map((r) => r.country).filter(Boolean))].sort(),
    [rows],
  );

  function hideCountry(name: string) {
    if (!name) return;
    hiddenCountries.hide(name);
    setCountry((prev) => (prev === name ? "all" : prev));
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return live.filter((c) => {
      if (hiddenCountries.isHidden(c.country)) return false;
      if (q && ![c.fullName, c.email, c.phone, c.country, c.city, c.position].some((v) =>
        (v || "").toLowerCase().includes(q),
      )) return false;
      if (country !== "all" && c.country !== country) return false;
      if (verified === "yes" && c.status !== FULL_VERIFIED) return false;
      if (verified === "no" && c.status === FULL_VERIFIED) return false;
      if (engagedAs !== "all" && c.confirmedDetails?.engagedAs !== engagedAs) return false;
      if (gstin === "yes" && !c.gstin) return false;
      if (gstin === "no" && gstinGroup(c) === null) return false;
      if (gstin === "asked" && gstinGroup(c) !== "asked") return false;
      if (gstin === "never" && gstinGroup(c) !== "never") return false;
      if (chatSent === "yes" && !c.chatLinkSentAt) return false;
      if (chatSent === "no" && c.chatLinkSentAt) return false;
      // The people the "start your chat" reminder is for.
      if (chatSent === "notStarted" && (!c.chatLinkSentAt || c.chatStarted)) return false;
      if (addressProof !== "all" && (c.addressProofStatus ?? "not_asked") !== addressProof) return false;
      if (agreement !== "all" && (c.agreementStatus ?? "not_sent") !== agreement) return false;
      if (!matchesIdTypeFilter(idType, c.identityDocumentType)) return false;
      if (!matchesFollowupFilter(followup, c.followupState)) return false;
      return true;
    });
  }, [live, search, country, hiddenCountries, verified, engagedAs, gstin, chatSent, addressProof, agreement, idType, followup]);

  /** How many each GSTIN choice would show, among the people not hidden by country. */
  const gstinCounts = useMemo(() => {
    const visible = live.filter((c) => !hiddenCountries.isHidden(c.country));
    return {
      provided: visible.filter((c) => !!c.gstin).length,
      asked: visible.filter((c) => gstinGroup(c) === "asked").length,
      never: visible.filter((c) => gstinGroup(c) === "never").length,
    };
  }, [live, hiddenCountries]);

  /** How many rows the hidden countries are keeping off the table. */
  const hiddenCount = useMemo(
    () => live.filter((c) => hiddenCountries.isHidden(c.country)).length,
    [live, hiddenCountries],
  );

  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = useMemo(
    () => shown.slice((current - 1) * pageSize, current * pageSize),
    [shown, current, pageSize],
  );

  /**
   * Who is ticked, for a paced batch of chat reminders. Ids, kept across pages;
   * anything the filters drop falls out, so nobody unseen is emailed.
   */
  const [selected, setSelected] = useState<string[]>([]);
  const selectable = useMemo(() => new Set(shown.map((c) => c.id)), [shown]);
  const chosen = useMemo(() => selected.filter((id) => selectable.has(id)), [selected, selectable]);
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const pageIds = visible.map((c) => c.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => chosen.includes(id));
  const togglePage = () =>
    setSelected((prev) =>
      allOnPage ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])],
    );
  const bulkEmail = useBulkEmail(shown, chosen, () => setSelected([]), ACCEPTED_ACTIONS);

  const { profile, open: openProfile, close: closeProfile, nav } = useProfileNav(
    live,
    shown,
    pageSize,
    setPage,
  );
  const [viewing, setViewing] = useState<CandidateDocument | null>(null);
  /** The address review, opened from a row's "Address received" tag. */
  const [addressFrom, setAddressFrom] = useState<string | null>(null);

  function dropRow(id: string) {
    setDeleted((prev) => [...prev, id]);
    if (profile?.id === id) closeProfile();
  }

  const patch = (id: string, p: Partial<CandidateView>) =>
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));

  async function changeStatus(id: string, next: CandidateStatus) {
    patch(id, { status: next });
    try {
      await adminPost(`/api/admin/candidates/${id}/status`, { status: next });
    } catch {
      /* optimistic; the table reloads with the truth */
    }
  }

  // Scoped to the current page, not to everyone the filters left.
  const companyCheck = useBulkCompanyCheck(visible, (id, check) =>
    patch(id, { companyCheck: check }),
    openProfile,
  );

  // A document reader belongs to the candidate it was opened from, so stepping
  // to the next one closes it rather than leaving someone else's CV on screen.
  useEffect(() => {
    setViewing(null);
  }, [profile?.id]);

  useEffect(() => {
    setPage(1);
  }, [search, country, hiddenCountries.hidden, verified, engagedAs, gstin, chatSent, addressProof, agreement, idType, followup, pageSize]);

  function goToPage(next: number) {
    setPage(next);
    tableTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const waiting = live.filter((c) => !c.confirmedDetails).length;
  /**
   * Accepted, and we still cannot draw up their agreement.
   *
   * The group that stalls silently: accepting feels like the finish, so
   * nobody who closed the tab afterwards has anything telling them a step is
   * outstanding — and from their side it looks as though we went quiet.
   */
  const needingId = live.filter((c) => c.identityNeeded).length;
  // The other thing that stops an agreement: somebody contracting through a
  // company we have only been told about.
  const needingCompany = live.filter((c) => c.companyNeeded).length;

  return (
    <>
      <div ref={tableTop} className="card mb-5 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          <label className="block">
            <span className="label">Search</span>
            <input
              id="search"
              className="input"
              placeholder="Name, email or position"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="label">Status</span>
            <select
              id="verified"
              className="select"
              value={verified}
              onChange={(e) => setVerified(e.target.value as typeof verified)}
            >
              <option value="all">All</option>
              <option value="yes">Full verified</option>
              <option value="no">Not full verified</option>
            </select>
          </label>

          {/* Which identity document they sent: a passport, a national ID card
              or a driver's licence ("Not recorded" for those from before). */}
          <label className="block">
            <span className="label">ID document</span>
            <select id="idtype" className="select" value={idType} onChange={(e) => setIdType(e.target.value as IdTypeFilter)}>
              {ID_TYPE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Follow-up chat</span>
            <select id="followup" className="select" value={followup} onChange={(e) => setFollowup(e.target.value as FollowupFilter)}>
              {FOLLOWUP_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Engaged as</span>
            <select
              id="engaged"
              className="select"
              value={engagedAs}
              onChange={(e) => setEngagedAs(e.target.value as typeof engagedAs)}
            >
              <option value="all">All</option>
              <option value="Individual">Individual</option>
              <option value="Company">Company</option>
            </select>
          </label>

          <label className="block">
            <span className="label">GSTIN</span>
            <select
              id="gstin"
              className="select"
              value={gstin}
              onChange={(e) => setGstin(e.target.value as typeof gstin)}
            >
              <option value="all">All</option>
              <option value="yes">Provided ({gstinCounts.provided})</option>
              <option value="no">Empty (India) ({gstinCounts.asked + gstinCounts.never})</option>
              <option value="asked">Empty — already asked ({gstinCounts.asked})</option>
              <option value="never">Empty — never asked ({gstinCounts.never})</option>
            </select>
          </label>

          <label className="block">
            <span className="label">Live interview</span>
            <select
              id="chatSent"
              className="select"
              value={chatSent}
              onChange={(e) => setChatSent(e.target.value as typeof chatSent)}
            >
              <option value="all">All</option>
              <option value="yes">Chat link sent</option>
              <option value="notStarted">Sent — not started</option>
              <option value="no">Not sent</option>
            </select>
          </label>

          <label className="block">
            <span className="label">Proof of address</span>
            <select
              id="addressProof"
              className="select"
              value={addressProof}
              onChange={(e) => setAddressProof(e.target.value as typeof addressProof)}
            >
              <option value="all">All</option>
              <option value="not_asked">Not asked</option>
              <option value="asked">Asked</option>
              <option value="received">Received</option>
              <option value="approved">Approved</option>
            </select>
          </label>

          <label className="block">
            <span className="label">Agreement</span>
            <select
              id="agreement"
              className="select"
              value={agreement}
              onChange={(e) => setAgreement(e.target.value as typeof agreement)}
            >
              <option value="all">All</option>
              <option value="not_sent">Not sent</option>
              <option value="sent">Sent – waiting</option>
              <option value="signed">Signed – to check</option>
              <option value="approved">Accepted</option>
            </select>
          </label>

          <label className="block">
            <span className="label">Country</span>
            <select id="country" className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="all">All countries</option>
              {countries
                .filter((c) => !hiddenCountries.isHidden(c))
                .map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
            </select>
          </label>

          <HideCountryPicker
            countries={countries}
            hidden={hiddenCountries.hidden}
            onHide={hideCountry}
          />
        </div>

        <HiddenCountryChips
          hidden={hiddenCountries.hidden}
          count={hiddenCount}
          noun="person"
          plural="people"
          onShow={hiddenCountries.show}
          onShowAll={hiddenCountries.showAll}
        />

        {shown.length !== rows.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-navy-100 pt-3">
            <p className="text-sm text-navy-500">
              <strong className="text-navy-800">{shown.length}</strong> of {rows.length} match
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCountry("all");
                setVerified("all");
                setEngagedAs("all");
                setGstin("all");
                setChatSent("all");
                setAddressProof("all");
                setAgreement("all");
              }}
              className="rounded-full px-3 py-1 text-xs font-semibold text-navy-600 transition hover:bg-navy-100"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      {needingId > 0 ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>
              {needingId} {needingId === 1 ? "person has" : "people have"} accepted but not sent
              identity documents.
            </strong>{" "}
            No agreement can be issued until they do. Open{" "}
            <span className="font-semibold">View info</span> on their row to see what has been
            sent and to chase them.
          </span>
        </p>
      ) : null}

      {needingCompany > 0 ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Icon name="briefcase" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>
              {needingCompany} {needingCompany === 1 ? "person is" : "people are"} contracting
              through a company that is not confirmed.
            </strong>{" "}
            The agreement is made with the company, so none can be issued until its details and
            paperwork are on file. Open <span className="font-semibold">View info</span> on their
            row to request them.
          </span>
        </p>
      ) : null}

      {waiting > 0 ? (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Icon name="shield" className="h-4 w-4 shrink-0" />
          {waiting} {waiting === 1 ? "person has" : "people have"} accepted without confirming their
          details — their agreement would be drawn from what they typed on the application form.
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500">
          <span className="font-semibold text-navy-900">{visible.length}</span> on this page
        </p>
        <RefreshButton
          onRefreshed={() => {
            setPatches({});
            setDeleted([]);
          }}
        />
        {companyCheck.control}
      </div>

      {companyCheck.panel}
      {bulkEmail.bar}
      {bulkEmail.panel}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1150px] text-left text-sm">
          <thead>
            <tr className="border-b border-navy-100 bg-navy-50/50 text-xs uppercase tracking-wide text-navy-500">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={togglePage}
                  aria-label={allOnPage ? "Unselect this page" : "Select this page"}
                  title={allOnPage ? "Unselect this page" : "Select this page"}
                  className="h-4 w-4 rounded border-navy-300 text-brand-600"
                />
              </th>
              <th className="px-4 py-3 font-semibold">Candidate</th>
              <th className="px-4 py-3 font-semibold">Country</th>
              <th className="px-4 py-3 font-semibold">Position</th>
              <th className="px-4 py-3 font-semibold">Agreed pay</th>
              <th className="px-4 py-3 font-semibold">Start date</th>
              <th className="px-4 py-3 font-semibold">Accepted</th>
              <th className="px-4 py-3 font-semibold">Details</th>
              {/* Whether we may draw up an agreement at all: everyone is asked
                  for identity documents at the offer, whatever their country. */}
              <th className="px-4 py-3 font-semibold">ID check</th>
              <th className="sticky right-0 whitespace-nowrap bg-navy-50 px-4 py-3 font-semibold shadow-[-8px_0_8px_-8px_rgba(15,16,53,0.12)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-50">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-navy-400">
                  {rows.length === 0
                    ? "Nobody has accepted an offer yet."
                    : "No accepted candidates match your filters."}
                </td>
              </tr>
            ) : (
              visible.map((c) => {
                const d = c.confirmedDetails;
                return (
                  <tr
                    key={c.id}
                    data-full-verified={c.status === FULL_VERIFIED ? "true" : undefined}
                    data-rejected={c.status === REJECTED ? "true" : undefined}
                    // Green for Full verified: the final interview is done and
                    // every check passed — the ones ready to go, at a glance.
                    // Red for Rejected.
                    className={`align-top ${
                      rowTone(c.status, { selected: chosen.includes(c.id), greenVerified: true }) || "hover:bg-navy-50/40"
                    }`}
                  >
                    <td className={`px-3 py-3 ${rowEdge(c.status, true)}`}>
                      <input
                        type="checkbox"
                        checked={chosen.includes(c.id)}
                        onChange={() => toggleOne(c.id)}
                        aria-label={`Select ${c.fullName || c.email || c.id}`}
                        className="mt-0.5 h-4 w-4 rounded border-navy-300 text-brand-600"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy-900">
                        {d ? `${d.firstName} ${d.lastName}`.trim() : c.fullName || "—"}
                      </p>
                      <p className="text-xs text-navy-500">{c.email || "—"}</p>
                      {c.status === FULL_VERIFIED ? (
                        <span className="mt-1 mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          <Icon name="checkCircle" className="h-3 w-3" />
                          Full verified
                        </span>
                      ) : null}
                      {d?.engagedAs === "Company" ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
                          <Icon name="briefcase" className="h-3 w-3" />
                          {d.companyName}
                        </span>
                      ) : null}
                      {(() => {
                        const g = gstinGroup(c);
                        if (!g) return null;
                        const asked = gstinAsked(c);
                        return (
                          <span
                            data-gstin-tag={g}
                            title={g === "asked" ? "“Request GSTIN” and “place still waiting” emails sent" : "No GSTIN email sent yet"}
                            className={`mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                              g === "asked" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-navy-200 bg-navy-50 text-navy-600"
                            }`}
                          >
                            <Icon name="mail" className="h-3 w-3" />
                            {g === "asked" ? `GSTIN asked ${asked.count}× · last ${fmtDay(asked.last)}` : "GSTIN never asked"}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy-800">{d?.country || c.country || "—"}</p>
                      {d?.city || c.city ? (
                        <p className="text-xs text-navy-500">{d?.city || c.city}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-navy-700">{c.offer?.position || c.position || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-navy-900">
                      {c.offer ? formatRate(c.offer) : "—"}
                    </td>
                    <td className="px-4 py-3 text-navy-600">{fmtDate(c.agreementStartDate || c.offer?.startDate)}</td>
                    <td className="px-4 py-3 text-navy-500">{fmt(c.offerAcceptedAt)}</td>
                    <td className="px-4 py-3">
                      {d ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                          <Icon name="checkCircle" className="h-3 w-3" />
                          Confirmed
                        </span>
                      ) : (
                        <span
                          title="They accepted, but have not re-confirmed their details through the offer link."
                          className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                        >
                          Still waiting
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                      <VerificationBadge
                        status={c.verificationStatus}
                        requestedAt={c.verificationRequestedAt}
                        onOpenPhotos={() => openProfile(c)}
                      />
                      {c.liveVerificationPassedAt ? (
                        <span
                          data-live-passed-tag
                          title={c.liveVerificationPassedNote || "Marked passed in View info → ID check"}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-800"
                        >
                          <Icon name="checkCircle" className="h-3 w-3" />
                          Live check passed
                        </span>
                      ) : null}
                      {c.addressProofStatus && c.addressProofStatus !== "not_asked" ? (
                        // Received or approved: opens the document itself, with
                        // Next to the following candidate's. Asked: View info → ID check.
                        <button
                          type="button"
                          data-address-tag={c.addressProofStatus}
                          onClick={() => {
                            if (hasAddressDocument(c)) {
                              setAddressFrom(c.id);
                            } else {
                              openProfileOn("id");
                              openProfile(c);
                            }
                          }}
                          title={hasAddressDocument(c) ? "See the proof of address — Next goes to the following candidate's" : "Proof of address — open View info → ID check"}
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold underline-offset-2 transition hover:underline hover:brightness-95 ${ADDRESS_TAG[c.addressProofStatus]}`}
                        >
                          <Icon name="home" className="h-3 w-3" />
                          Address {ADDRESS_STATUS_LABEL[c.addressProofStatus].toLowerCase()}
                        </button>
                      ) : null}
                      <FollowupTag
                        state={c.followupState}
                        onOpen={() => {
                          openProfileOn("assessment");
                          openProfile(c);
                        }}
                      />
                      {c.agreementStatus && c.agreementStatus !== "not_sent" ? (
                        <span
                          data-agreement-tag={c.agreementStatus}
                          title="Final agreement — see View info → Agreement"
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${AGREEMENT_BUTTON[c.agreementStatus].cls}`}
                        >
                          <Icon name="fileCheck" className="h-3 w-3" />
                          Agreement {AGREEMENT_STATUS_LABEL[c.agreementStatus].toLowerCase()}
                        </span>
                      ) : null}
                      </div>
                    </td>
                    <td
                      className={`sticky right-0 px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,16,53,0.12)] ${stickyTone(
                        c.status,
                        true,
                      )}`}
                    >
                      <div className="flex items-center gap-2">
                        <CandidateInfoButton onOpen={() => openProfile(c)} />
                        {c.status === FULL_VERIFIED || (c.agreementStatus && c.agreementStatus !== "not_sent") ? (
                          <button
                            type="button"
                            onClick={() => {
                              openProfileOn("agreement");
                              openProfile(c);
                            }}
                            data-agreement-button={c.agreementStatus ?? "not_sent"}
                            title="Open View info → Agreement"
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${AGREEMENT_BUTTON[c.agreementStatus ?? "not_sent"].cls}`}
                          >
                            <Icon name={AGREEMENT_BUTTON[c.agreementStatus ?? "not_sent"].icon} className="h-3.5 w-3.5" />
                            {AGREEMENT_BUTTON[c.agreementStatus ?? "not_sent"].label}
                          </button>
                        ) : null}
                        {teamMembers[c.id] ? (
                          <a
                            href={`${teamAdminUrl}/admin/team/${teamMembers[c.id]}`}
                            data-team-link
                            title="On the team — open their team page"
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100"
                          >
                            <Icon name="usersGroup" className="h-3.5 w-3.5" />
                            Team
                          </a>
                        ) : (
                          <a
                            href={`${teamAdminUrl}/admin/team/new?candidate=${encodeURIComponent(c.id)}`}
                            data-add-to-team
                            title="Opens the team admin panel on workroute.team"
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-navy-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                          >
                            <Icon name="plus" className="h-3.5 w-3.5" />
                            Add to team
                          </a>
                        )}
                        <DeleteCandidateButton candidate={c} onDeleted={dropRow} />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={current}
        pageCount={pageCount}
        total={shown.length}
        pageSize={pageSize}
        noun="accepted candidate"
        onPage={goToPage}
        onPageSize={setPageSize}
      />

      {profile ? (
        <CandidateProfileModal
          key={profile.id}
          candidate={profile}
          // The row's own checkbox, reachable from inside the dialog.
          selection={{
            selected: chosen.includes(profile.id),
            onToggle: () => toggleOne(profile.id),
            count: chosen.length,
          }}
          showOffer
          nav={nav}
          onClose={closeProfile}
          onOpenDocument={setViewing}
          onStatusChange={changeStatus}
          onChange={(p) => patch(profile.id, p)}
          // The address review steps through the rows on screen, filters and all.
          addressQueue={{ candidates: shown, onChange: patch }}
        />
      ) : null}

      {bulkEmail.dialog}

      {addressFrom ? (
        <AddressReviewViewer queue={shown} startId={addressFrom} onClose={() => setAddressFrom(null)} onChange={patch} />
      ) : null}

      {viewing && profile ? (
        <DocumentViewer
          candidateId={profile.id}
          candidateName={profile.fullName}
          document={viewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  );
}
