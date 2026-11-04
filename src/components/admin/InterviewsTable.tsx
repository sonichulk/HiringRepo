"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { InterviewActions } from "@/components/admin/InterviewActions";
import {
  VerificationBadge,
  verificationPatch,
  verificationStateOf,
} from "@/components/admin/VerificationPanel";
import { VerificationQuickView } from "@/components/admin/VerificationQuickView";
import { CandidateInfoButton } from "@/components/admin/CandidateInfoButton";
import { DeleteCandidateButton } from "@/components/admin/DeleteCandidateButton";
import { RefreshButton } from "@/components/admin/RefreshButton";
import { Icon } from "@/components/Icon";
import { CandidateProfileModal, openProfileOn } from "@/components/admin/CandidateProfileModal";
import { FOLLOWUP_FILTERS, matchesFollowupFilter, type FollowupFilter } from "@/lib/chat";
import { FollowupTag } from "@/components/admin/FollowupTag";
import { DocumentViewer } from "@/components/admin/DocumentViewer";
import { useProfileNav } from "@/components/admin/useProfileNav";
import { useBulkCompanyCheck } from "@/components/admin/BulkCompanyCheck";
import { adminPost } from "@/lib/adminClient";
import type { CandidateDocument } from "@/lib/documents";
import { PhoneCountryFlag } from "@/components/admin/PhoneCountryFlag";
import { DetectedCountryFlag } from "@/components/admin/DetectedCountryFlag";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/admin/Pagination";
import { SortHeader } from "@/components/admin/SortHeader";
import { agoInWords, lastActivityAt } from "@/lib/activity";
import { CANDIDATE_STATUSES, type CandidateStatus } from "@/lib/candidateStatus";
import { rowTone, stickyTone, rowEdge } from "@/components/admin/rowTone";
import { VOICE_FILTERS, matchesVoiceFilter, type VoiceFilter } from "@/lib/voice";
import {
  VERIFICATION_FILTERS,
  matchesVerificationFilter,
  type VerificationFilter,
} from "@/lib/verification";
import { offerStatus, OFFER_LABEL, type OfferStatus } from "@/lib/offer";
import { replyOverdue } from "@/lib/offerReminder";
import { PERIODS, dayKey, resolvePeriod, type PeriodId } from "@/lib/analytics";
import { useBulkEmail } from "@/components/admin/BulkEmailBar";
import { useBulkOffer } from "@/components/admin/BulkOfferEditor";
import {
  HideCountryPicker,
  HiddenCountryChips,
  useHiddenCountries,
} from "@/components/admin/HiddenCountries";
import { INTERVIEW_ACTIONS } from "@/lib/bulkEmail";
import type { CandidateView } from "@/lib/candidateView";

/**
 * Completed interviews, filtered and paged.
 *
 * The filtering is client-side over rows the server already sent, like the
 * Candidates table: a filter that reloads the page is a filter nobody uses
 * twice, and the store reads the whole file per request either way, so paging
 * on the server would save the transfer and nothing else.
 *
 * Order matters — filter, then sort, then page. Paging first would make every
 * filter a search of the current page, so "nobody has passed" would really
 * mean "nobody in this twenty-five".
 *
 * The server has already dropped candidates whose ID check has not been
 * requested — that is a separate rule with its own link in the header, and
 * these filters narrow whatever survived it.
 */

export interface InterviewRow {
  view: CandidateView;
}

function fmt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function pct(score: number, total: number) {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

/** This tab's own hidden list — see HiddenCountries for why it is per tab. */
const HIDDEN_COUNTRIES_KEY = "wr.interviews.hiddenCountries";

const OFFER_FILTERS: { value: "all" | OfferStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "none", label: "No offer" },
  { value: "sent", label: "Offer sent" },
  { value: "accepted", label: "Offer accepted" },
  { value: "declined", label: "Offer declined" },
];

type InterviewSortKey = "completed" | "activity" | "name" | "country" | "score";

export function InterviewsTable({ rows }: { rows: InterviewRow[] }) {
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  /** Countries taken out of the table entirely, remembered in the browser. */
  const hiddenCountries = useHiddenCountries(HIDDEN_COUNTRIES_KEY);
  const [voice, setVoice] = useState<VoiceFilter>("all");
  const [verification, setVerification] = useState<VerificationFilter>("all");
  const [status, setStatus] = useState<"all" | CandidateStatus>("all");
  const [offer, setOffer] = useState<"all" | OfferStatus>("all");
  const [followup, setFollowup] = useState<FollowupFilter>("all");
  /**
   * When the interview was completed.
   *
   * The same periods the dashboard uses, so "last month" means one thing in
   * this system rather than two. "Custom" opens a pair of dates, which is also
   * how a single day is asked for: the same date in both boxes.
   */
  const [completed, setCompleted] = useState<"all" | PeriodId>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  /**
   * Most recently finished first.
   *
   * This table had no sort at all, so rows arrived in the order the store
   * returns them — by when each person applied. On a tab whose whole purpose
   * is acting on a finished assessment, that put the candidate who finished
   * ten minutes ago wherever their application date happened to fall, often
   * pages down, and the only way to reach them was to search for a name you
   * had to know already.
   */
  const [sort, setSort] = useState<{ key: InterviewSortKey; dir: "asc" | "desc" }>({
    key: "completed",
    dir: "desc",
  });

  /**
   * Same as the Candidates table, deliberately: a name reads A to Z and a date
   * reads newest first, and two tables side by side must not answer the same
   * press differently.
   */
  const FIRST_DIR: Record<InterviewSortKey, "asc" | "desc"> = {
    name: "asc",
    country: "asc",
    completed: "desc",
    activity: "desc",
    score: "desc",
  };

  function toggleSort(k: InterviewSortKey) {
    setSort((prev) =>
      prev.key === k
        ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: k, dir: FIRST_DIR[k] },
    );
    setPage(1);
  }
  const tableTop = useRef<HTMLDivElement>(null);

  /**
   * Edits made since the page was rendered, by candidate id.
   *
   * Each row has up to three independent client islands describing the same
   * person — the voice assessment controls, the profile dialog, and now the
   * verification quick view. Held separately they drift: marking someone as
   * having passed in one leaves the others still showing what the server
   * sent, which is why the offer form would not appear until a reload. One
   * patch per row, every island reading and writing it, and the filters see
   * the edits too.
   */
  const [patches, setPatches] = useState<Record<string, Partial<CandidateView>>>({});
  const patch = (id: string, p: Partial<CandidateView>) =>
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));

  /** The candidate whose photos are open in the quick view, if any. */
  const [quickView, setQuickView] = useState<CandidateView | null>(null);

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
        .filter((r) => !deleted.includes(r.view.id))
        .map((r) => (patches[r.view.id] ? { ...r, view: { ...r.view, ...patches[r.view.id] } } : r)),
    [rows, patches, deleted],
  );

  /**
   * Offers whose deadline has gone by with no answer.
   *
   * Counted here from the deadline rather than read off the row, so that
   * reminding somebody again clears them from the banner immediately instead
   * of when the page is next loaded.
   */
  const overdue = useMemo(() => live.filter((r) => replyOverdue(r.view)).length, [live]);

  // Only offer countries that actually appear, so the filter never lists
  // options that return nothing.
  const countries = useMemo(
    () => [...new Set(rows.map((r) => r.view.country).filter(Boolean))].sort(),
    [rows],
  );

  /**
   * Today in the site's own timezone, not the browser's.
   *
   * A recruiter in Casablanca and the figures on the dashboard have to agree
   * about which day "today" is, or the same filter gives two answers.
   */
  const today = useMemo(() => dayKey(new Date()), []);
  const range = useMemo(
    () => (completed === "all" ? null : resolvePeriod(completed, today, { from, to })),
    [completed, today, from, to],
  );

  function hideCountry(name: string) {
    if (!name) return;
    hiddenCountries.hide(name);
    // Showing only India while hiding India is a contradiction with an empty
    // table as its answer, so the narrower filter gives way.
    setCountry((prev) => (prev === name ? "all" : prev));
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return live.filter(({ view: c }) => {
      // First, because it is a decision about who belongs in this table at
      // all — the other filters narrow whoever is left.
      if (hiddenCountries.isHidden(c.country)) return false;
      if (q && ![c.fullName, c.email, c.phone, c.country, c.city].some((v) => (v || "").toLowerCase().includes(q))) {
        return false;
      }
      if (country !== "all" && c.country !== country) return false;
      if (!matchesVoiceFilter(voice, c)) return false;
      if (!matchesVerificationFilter(verification, c.verificationStatus, c.verificationRequestedAt)) {
        return false;
      }
      if (status !== "all" && c.status !== status) return false;
      if (offer !== "all" && offerStatus(c) !== offer) return false;
      if (!matchesFollowupFilter(followup, c.followupState)) return false;
      // No completion date at all means the interview happened somewhere else
      // and somebody set the status by hand. There is no day to match, so any
      // dated question excludes them rather than guessing one.
      if (range) {
        if (!c.interviewCompletedAt) return false;
        const day = dayKey(new Date(c.interviewCompletedAt));
        if (day < range.from || day > range.to) return false;
      }
      return true;
    });
  }, [live, search, country, hiddenCountries, voice, verification, status, offer, range, followup]);

  /** How many rows the hidden countries are keeping off the table. */
  const hiddenCount = useMemo(
    () => live.filter((r) => hiddenCountries.isHidden(r.view.country)).length,
    [live, hiddenCountries],
  );

  /**
   * Filter, then sort, then page — the order the comment at the top of this
   * file insists on. Sorting after paging would order twenty-five arbitrary
   * rows and call it a table.
   */
  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...shown].sort((x, y) => {
      const a = x.view;
      const b = y.view;
      switch (sort.key) {
        case "name":
          return a.fullName.localeCompare(b.fullName) * dir;
        case "country":
          return (a.country || "").localeCompare(b.country || "") * dir;
        case "score": {
          // No interview on file is not a score of zero, so those sort last
          // whichever way the arrow points.
          const av = a.interviewCompleted ? (a.score ?? 0) : -1;
          const bv = b.interviewCompleted ? (b.score ?? 0) : -1;
          if (av === -1 && bv === -1) return 0;
          if (av === -1) return 1;
          if (bv === -1) return -1;
          return (av - bv) * dir;
        }
        case "activity":
          return lastActivityAt(a).localeCompare(lastActivityAt(b)) * dir;
        default:
          // An interview done by telephone has no completion date — somebody
          // set the status by hand. Falling back to their last activity keeps
          // them among their contemporaries instead of dumping every one of
          // them at the bottom for ever.
          return (
            (a.interviewCompletedAt || lastActivityAt(a)).localeCompare(
              b.interviewCompletedAt || lastActivityAt(b),
            ) * dir
          );
      }
    });
  }, [shown, sort]);

  const filtering = shown.length !== rows.length;

  // Paged after filtering, never before, so a filter always searches everyone
  // rather than whichever twenty-five happen to be on screen.
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Derived, not corrected afterwards: narrowing to three rows while on page 5
  // must show those three straight away, not a blank table for a frame.
  const current = Math.min(page, pageCount);
  const visible = useMemo(
    () => sorted.slice((current - 1) * pageSize, current * pageSize),
    [sorted, current, pageSize],
  );

  // The dialog steps through the filtered list, so it needs both as plain
  // candidates rather than as rows.
  const everyone = useMemo(() => live.map((r) => r.view), [live]);
  // Follows the displayed order, so "select all" and the batch that follows
  // take people in the order the recruiter is looking at them.
  const ordered = useMemo(() => sorted.map((r) => r.view), [sorted]);

  /**
   * Who is ticked, for the paced batch.
   *
   * Ids rather than rows, and kept across pages: somebody selecting on page
   * one and losing it on page two could never act on a filter larger than a
   * page. Anything the filters drop falls out of the selection, because acting
   * on a row nobody can see is how the wrong person gets emailed.
   */
  const [selected, setSelected] = useState<string[]>([]);
  const selectable = useMemo(() => new Set(ordered.map((c) => c.id)), [ordered]);
  const chosen = useMemo(() => selected.filter((id) => selectable.has(id)), [selected, selectable]);
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const pageIds = visible.map((r) => r.view.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => chosen.includes(id));
  const togglePage = () =>
    setSelected((prev) =>
      allOnPage ? prev.filter((id) => !pageIds.includes(id)) : [...new Set([...prev, ...pageIds])],
    );

  /**
   * The offer editor and the selection bar each need something from the other:
   * the bar shows the editor's button, and the editor has to tell the bar that
   * a batch has begun so the progress panel appears at once rather than on the
   * next poll. A ref rather than a reorder, because the two are genuinely
   * mutual.
   */
  const refreshBatch = useRef<() => void>(() => {});
  const bulkOffer = useBulkOffer(ordered, chosen, () => setSelected([]), () =>
    refreshBatch.current(),
  );
  const bulkEmail = useBulkEmail(
    ordered,
    chosen,
    () => setSelected([]),
    INTERVIEW_ACTIONS,
    bulkOffer.button,
  );
  refreshBatch.current = () => void bulkEmail.refresh();
  const { profile, open: openProfile, close: closeProfile, nav } = useProfileNav(
    everyone,
    ordered,
    pageSize,
    setPage,
  );

  /** The row is gone from the server; drop it here and close it if it is open. */
  function dropRow(id: string) {
    setDeleted((prev) => [...prev, id]);
    if (profile?.id === id) closeProfile();
  }

  /** Which document is open in the reader, from whichever profile is showing. */
  const [viewing, setViewing] = useState<CandidateDocument | null>(null);

  async function changeStatus(id: string, next: CandidateStatus) {
    patch(id, { status: next });
    try {
      await adminPost(`/api/admin/candidates/${id}/status`, { status: next });
    } catch {
      /* optimistic; the table reloads with the truth */
    }
  }

  // Scoped to the current page, not to everyone the filters left.
  const companyCheck = useBulkCompanyCheck(
    useMemo(() => visible.map((r) => r.view), [visible]),
    (id, check) => patch(id, { companyCheck: check }),
    openProfile,
  );

  // A document reader belongs to the candidate it was opened from, so stepping
  // to the next one closes it rather than leaving someone else's CV on screen.
  useEffect(() => {
    setViewing(null);
  }, [profile?.id]);

  useEffect(() => {
    setPage(1);
  }, [search, country, hiddenCountries.hidden, voice, verification, status, offer, range, followup, pageSize]);

  function goToPage(next: number) {
    setPage(next);
    tableTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <div ref={tableTop} className="card mb-5 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="label">Search</span>
            <input
              id="search"
              className="input"
              placeholder="Name, email or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="label">Voice assessment</span>
            <select
              id="voice"
              className="select"
              value={voice}
              onChange={(e) => setVoice(e.target.value as VoiceFilter)}
            >
              {VOICE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          {/* When the interview was completed. The presets answer the question
              people actually ask — "who finished today?" — and Custom covers
              both a stretch of dates and a single one, by putting the same
              date in both boxes. */}
          <label className="block">
            <span className="label">Completed</span>
            <select
              id="completed"
              className="select"
              value={completed}
              onChange={(e) => setCompleted(e.target.value as typeof completed)}
            >
              <option value="all">Any time</option>
              {PERIODS.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
              <option value="custom">Between two dates…</option>
            </select>
          </label>

          {completed === "custom" ? (
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <label className="block">
                <span className="label">From</span>
                <input
                  id="completed-from"
                  type="date"
                  className="input"
                  max={today}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="label">To</span>
                <input
                  id="completed-to"
                  type="date"
                  className="input"
                  max={today}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>
          ) : null}

          <label className="block">
            <span className="label">Offer</span>
            <select id="offer" className="select" value={offer} onChange={(e) => setOffer(e.target.value as typeof offer)}>
              {OFFER_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">ID check</span>
            <select
              id="verification"
              className="select"
              value={verification}
              onChange={(e) => setVerification(e.target.value as VerificationFilter)}
            >
              {VERIFICATION_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
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
            <span className="label">Candidate status</span>
            <select id="status" className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">All</option>
              {CANDIDATE_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
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

        {/* Always on screen while anything is hidden. A filter that quietly
            removes people is the one that has to say so, or the tab looks
            empty for no reason a week later. */}
        <HiddenCountryChips
          hidden={hiddenCountries.hidden}
          count={hiddenCount}
          noun="interview"
          onShow={hiddenCountries.show}
          onShowAll={hiddenCountries.showAll}
        />

        {filtering ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-navy-100 pt-3">
            {/* How many the filters left. The pagination line below the table
                says which of them you are looking at. */}
            <p className="text-sm text-navy-500">
              <strong className="text-navy-800">{shown.length}</strong> of {rows.length} match
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCountry("all");
                setVoice("all");
                setVerification("all");
                setStatus("all");
                setOffer("all");
                setCompleted("all");
                setFrom("");
                setTo("");
              }}
              className="rounded-full px-3 py-1 text-xs font-semibold text-navy-600 transition hover:bg-navy-100"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      {/* The deadline we gave somebody, come and gone. A prompt to look at the
          row, never an instruction: what happens next is a person's decision,
          and the delete button is already on the row when they make it. */}
      {overdue > 0 ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>
              {overdue} {overdue === 1 ? "person was" : "people were"} given a deadline to answer
              their offer and did not.
            </strong>{" "}
            They were told we would close their file and remove what we hold. Nothing has been
            deleted — open <span className="font-semibold">View info</span> to check, then delete
            the row if that is right.
          </span>
        </p>
      ) : null}

      {bulkEmail.bar}
      {bulkEmail.panel}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500">
          <span className="font-semibold text-navy-900">{visible.length}</span> on this page
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <RefreshButton
            onRefreshed={() => {
              setPatches({});
              setDeleted([]);
            }}
          />
          {companyCheck.control}
        </div>
      </div>

      {companyCheck.panel}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1400px] text-left text-sm">
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
              <SortHeader label="Candidate" k="name" sort={sort} onSort={toggleSort} />
              <SortHeader label="Country" k="country" sort={sort} onSort={toggleSort} />
              <SortHeader label="Completed" k="completed" sort={sort} onSort={toggleSort} />
              <SortHeader label="Last activity" k="activity" sort={sort} onSort={toggleSort} />
              <SortHeader label="Score" k="score" sort={sort} onSort={toggleSort} />
              <th className="px-4 py-3 font-semibold">%</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">ID check</th>
              <th className="px-4 py-3 font-semibold">Voice assessment</th>
              {/* Pinned right, as on the Candidates table: the voice-assessment
                  column is wide, and the actions must stay reachable without
                  scrolling sideways to find them. */}
              <th className="sticky right-0 whitespace-nowrap bg-navy-50 px-4 py-3 font-semibold shadow-[-8px_0_8px_-8px_rgba(15,16,53,0.12)]">
                Results
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-50">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-navy-400">
                  {rows.length === 0
                    ? "No completed interviews yet."
                    : "No interviews match your filters."}
                </td>
              </tr>
            ) : (
              visible.map(({ view: c }) => {
                const p = pct(c.score ?? 0, c.total ?? 0);
                // No answers on file: the interview happened somewhere else and
                // somebody set the status by hand. Showing 0% in red for that
                // would be a score this person never got.
                const scored = c.total != null && c.total > 0;
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
                    <td className="px-4 py-3 font-medium text-navy-900">
                      {c.fullName || "—"}
                      <span className="mt-0.5 block text-xs font-normal text-navy-500">
                        {c.phone || "no number"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy-800">{c.country || "—"}</p>
                      {c.city ? <p className="text-xs text-navy-500">{c.city}</p> : null}
                      <PhoneCountryFlag country={c.country} phone={c.phone} />
                      <DetectedCountryFlag
                        country={c.country}
                        detectedCountryName={c.detectedCountryName}
                      />
                    </td>
                    <td className="px-4 py-3 text-navy-500">
                      {scored ? (
                        fmt(c.interviewCompletedAt)
                      ) : (
                        <span className="text-navy-400">Marked by hand</span>
                      )}
                    </td>
                    {/* What the default order reads from for anyone with no
                        completion date, and the quickest way to see who has
                        moved since you last looked. */}
                    <td className="whitespace-nowrap px-4 py-3 text-navy-500">
                      {agoInWords(lastActivityAt(c))}
                    </td>
                    <td className="px-4 py-3 font-semibold text-navy-800">
                      {scored ? `${c.score}/${c.total}` : <span className="text-navy-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {scored ? (
                        <span
                          className={`font-semibold ${p >= 60 ? "text-green-600" : p >= 40 ? "text-amber-600" : "text-red-600"}`}
                        >
                          {p}%
                        </span>
                      ) : (
                        <span className="text-navy-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <VerificationBadge
                          status={c.verificationStatus}
                          requestedAt={c.verificationRequestedAt}
                          onOpenPhotos={() => setQuickView(c)}
                        />
                        <FollowupTag
                          state={c.followupState}
                          onOpen={() => {
                            openProfileOn("assessment");
                            openProfile(c);
                          }}
                        />
                      </div>
                    </td>
                    {/* Bounded, because the Results column is sticky and floats
                        over whatever runs under it. Without a width the voice
                        controls slide beneath it and their labels are cut in
                        half — they need to wrap before they reach it. */}
                    <td className="px-4 py-3 align-top">
                      <InterviewActions
                        id={c.id}
                        fullName={c.fullName}
                        email={c.email}
                        voiceRequestedAt={c.voiceRequestedAt}
                        voiceStatus={c.voiceStatus}
                        voiceOpenedAt={c.voiceOpenedAt}
                        voiceOpenCount={c.voiceOpenCount}
                        voiceReminderSentAt={c.voiceReminderSentAt}
                        voiceReminderCount={c.voiceReminderCount}
                        voiceNeeded={c.voiceNeeded}
                        onVoiceReminder={(p) => patch(c.id, p)}
                        onVoiceStatusChange={(voiceStatus) => patch(c.id, { voiceStatus })}
                      />
                    </td>
                    <td className={`sticky right-0 ${stickyTone(c.status)} px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(15,16,53,0.12)]`}>
                      <div className="flex flex-col items-start gap-2 whitespace-nowrap">
                        {/* There is no answer sheet for an interview this
                            system did not run, and a link to an empty one is a
                            dead end dressed as a page. */}
                        {scored ? (
                          <Link
                            href={`/admin/interviews/${c.id}`}
                            className="text-sm font-medium text-brand-700 hover:text-brand-800"
                          >
                            View answers →
                          </Link>
                        ) : (
                          <span className="text-sm text-navy-400">No answers on file</span>
                        )}
                        <div className="flex items-center gap-2">
                          <CandidateInfoButton onOpen={() => openProfile(c)} />
                          <DeleteCandidateButton candidate={c} onDeleted={dropRow} />
                        </div>
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
        noun="interview"
        onPage={goToPage}
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
            const p = {
              ...verificationPatch(v),
            };
            patch(quickView.id, p);
            // The dialog reads its own snapshot, not the row's patch map, so
            // it has to be told directly or verifying would show the old
            // badge until the dialog is closed and reopened.
            setQuickView((q) => (q ? { ...q, ...p } : q));
          }}
        />
      ) : null}

      {/* Owned by the table, not by each row, so Previous and Next have a list
          to walk. Offers are made from this tab and only this tab. */}
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

export { OFFER_LABEL };
