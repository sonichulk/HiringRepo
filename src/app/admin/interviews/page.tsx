import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/adminAuth";
import { listCandidates } from "@/lib/store";
import { listSessions } from "@/lib/chatStore";
import { followupStateOf } from "@/lib/chat";
import { requiredCountries } from "@/lib/verificationStore";
import { toCandidateView } from "@/lib/candidateView";
import { notAskedYet, verificationStatus } from "@/lib/verification";
import { reachedInterviewStage } from "@/lib/candidateStatus";
import { AdminShell } from "@/components/admin/AdminShell";
import { InterviewsTable, type InterviewRow } from "@/components/admin/InterviewsTable";

export const metadata: Metadata = { title: "Interviews", robots: { index: false, follow: false } };

async function baseUrl(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function AdminInterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requireAdmin();
  const [params, all, required, base] = await Promise.all([
    searchParams,
    listCandidates(),
    requiredCountries(),
    baseUrl(),
  ]);
  /**
   * Everybody past the interview, whether or not this system ran it.
   *
   * A recorded set of answers is one way to get here; the other is somebody
   * setting the status by hand, which is what happens when the interview was a
   * phone call, or happened before this site did. Both belong on the tab that
   * requests ID checks, voice assessments and offers — those steps come after
   * the interview regardless of where the interview took place.
   */
  const finished = all.filter((c) => c.interview || reachedInterviewStage(c.status));

  /**
   * Nobody has told this candidate they need to verify: verification is due
   * and no request has gone out. Same condition the red "Not asked yet" badge
   * uses.
   */
  const notAsked = (c: (typeof finished)[number]) =>
    notAskedYet(verificationStatus(c, required), c.verificationRequestedAt);

  /**
   * Everybody is listed, including them.
   *
   * They were hidden by default once, on the reasoning that this tab is for
   * following up and there is nothing to follow up on until somebody has been
   * asked. That was backwards: an interview finished ten minutes ago has no ID
   * check requested *because it finished ten minutes ago*, so the rule hid the
   * newest arrivals — the very rows somebody opens this tab to act on — and
   * "the candidate who just finished is not on the tab" reads as a broken
   * table, not as a filter doing its job.
   *
   * Hiding them stays available for anyone working through the asked pile, one
   * link away, and their rows carry the red badge either way. The filters in
   * the table narrow whatever survives this.
   */
  const onlyAsked = params.show === "asked";
  const unasked = finished.filter(notAsked);
  const listed = onlyAsked ? finished.filter((c) => !notAsked(c)) : finished;

  const sessions = await listSessions();
  const rows: InterviewRow[] = listed.map((c) => ({
    view: { ...toCandidateView(c, base, required), followupState: followupStateOf(c, sessions) },
  }));

  return (
    <AdminShell>
      <header className="mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">Interviews</h1>
          <p className="mt-1 text-sm text-navy-500">
            {rows.length} completed interview{rows.length === 1 ? "" : "s"}
            {unasked.length > 0 ? (
              onlyAsked ? (
                <>
                  . {unasked.length} hidden — ID check not requested yet.{" "}
                  <Link href="/admin/interviews" className="font-semibold text-brand-700 underline">
                    Show {unasked.length === 1 ? "it" : "them"}
                  </Link>
                </>
              ) : (
                <>
                  , {unasked.length} of them with no ID check requested yet.{" "}
                  <Link
                    href="/admin/interviews?show=asked"
                    className="font-semibold text-brand-700 underline"
                  >
                    Hide {unasked.length === 1 ? "it" : "them"}
                  </Link>
                </>
              )
            ) : (
              "."
            )}
          </p>
        </div>
      </header>

      <InterviewsTable rows={rows} />
    </AdminShell>
  );
}
