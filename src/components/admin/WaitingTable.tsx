"use client";

import { rowTone, rowEdge } from "@/components/admin/rowTone";
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  VerificationBadge,
  verificationPatch,
  verificationStateOf,
} from "@/components/admin/VerificationPanel";
import { VerificationQuickView } from "@/components/admin/VerificationQuickView";
import { CandidateProfileModal } from "@/components/admin/CandidateProfileModal";
import { DocumentViewer } from "@/components/admin/DocumentViewer";
import { DeleteCandidateButton } from "@/components/admin/DeleteCandidateButton";
import { RefreshButton } from "@/components/admin/RefreshButton";
import { useProfileNav } from "@/components/admin/useProfileNav";
import { PhoneCountryFlag } from "@/components/admin/PhoneCountryFlag";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/admin/Pagination";
import {
  HideCountryPicker,
  HiddenCountryChips,
  useHiddenCountries,
} from "@/components/admin/HiddenCountries";
import { useBulkEmail } from "@/components/admin/BulkEmailBar";
import { useBulkOffer } from "@/components/admin/BulkOfferEditor";
import { useBulkCompanyCheck } from "@/components/admin/BulkCompanyCheck";
import { adminPost } from "@/lib/adminClient";
import { daysWaiting, WAITING_TOO_LONG_DAYS, waitingSince } from "@/lib/voiceAck";
import {
  ID_DOCUMENT_LABEL,
  ID_SCAN_LABEL,
  ID_TYPE_FILTERS,
  matchesIdTypeFilter,
  type IdTypeFilter,
} from "@/lib/identityDocuments";
import type { CandidateDocument } from "@/lib/documents";
import type { CandidateStatus } from "@/lib/candidateStatus";
import type { CandidateView } from "@/lib/candidateView";

/**
 * People who were told we would be in touch, and have not been.
 *
 * The queue this tab exists to make visible. Everything else in the panel
 * answers "what is outstanding from the candidate"; this one answers the
 * opposite question, and it is the only list where the person holding things
 * up is us.
 *
 * So it is ordered by how long somebody has been waiting, longest first, and
 * anybody past a fortnight is marked. Nothing is enforced and nothing is sent
 * automatically — the point is only that the wait is impossible to overlook.
 */

const HIDDEN_COUNTRIES_KEY = "wr.waiting.hiddenCountries";

function fmt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function WaitingTable({ rows }: { rows: CandidateView[] }) {
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const hiddenCountries = useHiddenCountries(HIDDEN_COUNTRIES_KEY);
  /** Which identity document they sent — passport, card, licence, or none yet. */
  const [idType, setIdType] = useState<IdTypeFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const tableTop = useRef<HTMLDivElement>(null);

  const [patches, setPatches] = useState<Record<string, Partial<CandidateView>>>({});
  const [deleted, setDeleted] = useState<string[]>([]);
  const [viewing, setViewing] = useState<CandidateDocument | null>(null);
  /** The candidate whose identity photos are open in the quick view, if any. */
  const [quickView, setQuickView] = useState<CandidateView | null>(null);

  const patch = (id: string, p: Partial<CandidateView>) =>
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));

  const live = useMemo(
    () =>
      rows
        .filter((c) => !deleted.includes(c.id))
        .map((c) => (patches[c.id] ? { ...c, ...patches[c.id] } : c))
        // Somebody who has since been offered or turned down has stopped
        // waiting, and leaving their row here would be the tab lying about its
        // own subject.
        .filter((c) => c.awaitingDecision),
    [rows, patches, deleted],
  );

  const countries = useMemo(
    () => [...new Set(rows.map((c) => c.country).filter(Boolean))].sort(),
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
      if (
        q &&
        ![c.fullName, c.email, c.phone, c.country, c.city, c.position].some((v) =>
          (v || "").toLowerCase().includes(q),
        )
      ) {
        return false;
      }
      if (country !== "all" && c.country !== country) return false;
      if (!matchesIdTypeFilter(idType, c.identityDocumentType, c.identityDetectedType)) return false;
      return true;
    });
  }, [live, search, country, hiddenCountries, idType]);

  const hiddenCount = useMemo(
    () => live.filter((c) => hiddenCountries.isHidden(c.country)).length,
    [live, hiddenCountries],
  );

  /** Longest wait first: the row most likely to have been forgotten. */
  const sorted = useMemo(
    () => [...shown].sort((a, b) => (waitingSince(a) || "").localeCompare(waitingSince(b) || "")),
    [shown],
  );

  const overdue = useMemo(
    () => sorted.filter((c) => daysWaiting(c) >= WAITING_TOO_LONG_DAYS).length,
    [sorted],
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount);
  const visible = useMemo(
    () => sorted.slice((current - 1) * pageSize, current * pageSize),
    [sorted, current, pageSize],
  );

  /**
   * Who is ticked, for a batch of offers.
   *
   * This is the queue where the company owes somebody an answer, so writing
   * that answer to twenty of them at once is the whole point of ticking boxes
   * here. Ids, kept across pages, and anything the filters drop falls out of
   * the selection — acting on a row nobody can see is how the wrong person
   * gets emailed.
   */
  const [selected, setSelected] = useState<string[]>([]);
  const selectable = useMemo(() => new Set(sorted.map((c) => c.id)), [sorted]);
  const chosen = useMemo(() => selected.filter((id) => selectable.has(id)), [selected, selectable]);
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const pageIds = visible.map((c) => c.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => chosen.includes(id));
  const togglePage = () =>
    setSelected((prev) =>
      allOnPage ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])],
    );

  // The bar carries no fixed-message action on this tab — everybody here has
  // already been written to, and an offer is the only thing left to send.
  const refreshBatch = useRef<() => void>(() => {});
  const bulkOffer = useBulkOffer(sorted, chosen, () => setSelected([]), () =>
    refreshBatch.current(),
  );
  const bulkEmail = useBulkEmail(sorted, chosen, () => setSelected([]), [], bulkOffer.button);
  refreshBatch.current = () => void bulkEmail.refresh();

  /**
   * The UK register, for the rows on screen.
   *
   * The same scan the other three tables carry, and this is the tab where the
   * answer changes what happens next: an offer from here is about to ask
   * whether they contract through a company, and knowing beforehand that one
   * is already on the register saves asking somebody a question we can answer
   * ourselves. Scoped to this page, never the whole list — see BulkCompanyCheck.
   */
  const companyCheck = useBulkCompanyCheck(visible, (id, check) =>
    patch(id, { companyCheck: check }),
    (c) => openProfile(c),
  );

  // Stepping through the list follows the same order the table shows, and
  // turns the page when it reaches the end of this one.
  const { profile, open: openProfile, close: closeProfile, nav } = useProfileNav(
    live,
    sorted,
    pageSize,
    setPage,
  );

  async function changeStatus(id: string, status: CandidateStatus) {
    patch(id, { status });
    try {
      await adminPost(`/api/admin/candidates/${id}/status`, { status });
    } catch {
      /* the next load will tell the truth */
    }
  }

  return (
    <>
      <div ref={tableTop} className="card mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <span className="label">Country</span>
          <select
            id="country"
            className="select"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="all">All countries</option>
            {countries
              .filter((c) => !hiddenCountries.isHidden(c))
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
        </label>

        {/* Which document they sent. Worth asking for on its own: a passport
            is one photograph and a card is three, so "who is still missing a
            back" is a question about the document, not about the person. */}
        <label className="block">
          <span className="label">ID document</span>
          <select
            id="idtype"
            className="select"
            value={idType}
            onChange={(e) => setIdType(e.target.value as IdTypeFilter)}
          >
            {ID_TYPE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <HideCountryPicker
          countries={countries}
          hidden={hiddenCountries.hidden}
          onHide={hideCountry}
        />

        <div className="sm:col-span-2 lg:col-span-3">
          <HiddenCountryChips
            hidden={hiddenCountries.hidden}
            count={hiddenCount}
            noun="person"
            plural="people"
            onShow={hiddenCountries.show}
            onShowAll={hiddenCountries.showAll}
          />
        </div>
      </div>

      {/* The only number on this tab worth acting on. */}
      {overdue > 0 ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>
              {overdue} {overdue === 1 ? "person has" : "people have"} been waiting more than{" "}
              {WAITING_TOO_LONG_DAYS} days.
            </strong>{" "}
            They were told we would write either way. Open{" "}
            <span className="font-semibold">View info</span> to make the offer, or tell them no.
          </span>
        </p>
      ) : null}

      {bulkEmail.bar}
      {bulkEmail.panel}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500">
          <span className="font-semibold text-navy-900">{sorted.length}</span> waiting
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <RefreshButton
            onRefreshed={() => {
              setPatches({});
              setDeleted([]);
            }}
          />
          {/* Only the rows on screen, the same as everywhere else it appears. */}
          {companyCheck.control}
        </div>
      </div>

      {companyCheck.panel}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-left text-sm">
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
              <th className="px-4 py-3 font-semibold">Told</th>
              <th className="px-4 py-3 font-semibold">Waiting</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">ID check</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-50">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-navy-400">
                  {live.length === 0
                    ? "Nobody is waiting. Tell somebody their recording arrived, or that their information is verified, and they appear here."
                    : "Nobody matches your filters."}
                </td>
              </tr>
            ) : (
              visible.map((c) => {
                const days = daysWaiting(c);
                const late = days >= WAITING_TOO_LONG_DAYS;
                return (
                  <tr
                    key={c.id}
                    data-rejected={c.status === "Rejected" ? "true" : undefined}
                    className={`align-top ${c.status === "Rejected" ? "" : "hover:bg-navy-50/40"} ${rowTone(c.status, {
                      selected: chosen.includes(c.id),
                    })}`}
                  >
                    <td className={`px-3 py-3 ${rowEdge(c.status)}`}>
                      <input
                        type="checkbox"
                        checked={chosen.includes(c.id)}
                        onChange={() => toggleOne(c.id)}
                        aria-label={`Select ${c.fullName || c.email || c.id}`}
                        className="mt-0.5 h-4 w-4 rounded border-navy-300 text-brand-600"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy-900">{c.fullName || "—"}</p>
                      <p className="text-xs text-navy-500">{c.email || "no email"}</p>
                      {/* Told they are verified, with no recording: the final
                          video interview is their next step, not a decision on
                          a recording. */}
                      {c.verifiedAckSentAt && !c.voiceAckSentAt ? (
                        <span
                          data-waiting-novoice
                          className="mt-1 inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700"
                        >
                          Verified — no voice (final video interview)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy-800">{c.country || "—"}</p>
                      <PhoneCountryFlag country={c.country} phone={c.phone} />
                    </td>
                    <td className="px-4 py-3 text-navy-600">{c.position || "—"}</td>
                    <td className="px-4 py-3 text-navy-500">{fmt(waitingSince(c))}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          late
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-navy-200 bg-navy-50 text-navy-600"
                        }`}
                      >
                        {days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    {/* The document is named under the badge, not only
                        filterable: a filter for something the table never
                        shows is one nobody can check the answer of. */}
                    <td className="px-4 py-3">
                      <VerificationBadge
                        status={c.verificationStatus}
                        requestedAt={c.verificationRequestedAt}
                        onOpenPhotos={() => setQuickView(c)}
                      />
                      {c.identityDocumentType ? (
                        <p className="mt-0.5 text-xs text-navy-500">
                          {ID_DOCUMENT_LABEL[c.identityDocumentType]}
                        </p>
                      ) : c.identityDetectedType ? (
                        <p className="mt-0.5 text-xs text-navy-500" title="Read from the photo">
                          {ID_SCAN_LABEL[c.identityDetectedType]} (read from photo)
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openProfile(c)}
                          className="rounded-lg border border-navy-200 px-3 py-1.5 text-xs font-bold text-navy-700 transition hover:bg-navy-50"
                        >
                          View info
                        </button>
                        <DeleteCandidateButton
                          candidate={c}
                          onDeleted={(id) => setDeleted((prev) => [...prev, id])}
                        />
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
        total={sorted.length}
        pageSize={pageSize}
        noun="person"
        plural="people"
        onPage={(next) => {
          setPage(next);
          tableTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        onPageSize={setPageSize}
      />

      {quickView ? (
        <VerificationQuickView
          id={quickView.id}
          fullName={quickView.fullName}
          documents={quickView.documents}
          initial={verificationStateOf(quickView)}
          onClose={() => setQuickView(null)}
          onChange={(v) => {
            const p = verificationPatch(v);
            patch(quickView.id, p);
            // The dialog reads its own snapshot rather than the row's patch
            // map, so it has to be told directly or verifying would show the
            // old badge until it is closed and reopened.
            setQuickView((q) => (q ? { ...q, ...p } : q));
          }}
        />
      ) : null}

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
          /* Offers are made from here as well as the Interviews tab: this list
             is a subset of the same people, and a queue you cannot act on
             without navigating away is a queue that gets worked somewhere
             else. */
          showOffer
          nav={nav}
          onClose={closeProfile}
          onOpenDocument={setViewing}
          onStatusChange={changeStatus}
          onChange={(p) => patch(profile.id, p)}
        />
      ) : null}

      {viewing && profile ? (
        <DocumentViewer
          candidateId={profile.id}
          candidateName={profile.fullName}
          document={viewing}
          onClose={() => setViewing(null)}
        />
      ) : null}

      {bulkEmail.dialog}
      {bulkOffer.dialog}
    </>
  );
}
