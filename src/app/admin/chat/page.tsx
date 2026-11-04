import type { Metadata } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { AdminShell } from "@/components/admin/AdminShell";
import { LiveChatInbox } from "@/components/admin/chat/LiveChatInbox";
import { getChatSettings } from "@/lib/chatStore";

export const metadata: Metadata = { title: "Live chat", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Final interviews, held as live text chats with candidates who were sent a
 * link. Several at once: the list on the left, the open one on the right.
 */
export default async function AdminChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const s = sp.s;
  const settings = await getChatSettings();

  return (
    <AdminShell>
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">Live chat</h1>
        <p className="mt-1 text-sm text-navy-500">
          Interview, onboarding and follow-up chats, each in its own tab. Candidates appear when they
          press Start chat on the link you sent them — you also get a Telegram message.
        </p>
      </header>
      <LiveChatInbox
        questions={settings.questions}
        onboarding={settings.onboarding}
        followupQuestions={settings.followupQuestions}
        initialId={typeof s === "string" ? s : undefined}
        initialTab={sp.tab === "onboarding" || sp.tab === "followup" ? sp.tab : "interview"}
      />
    </AdminShell>
  );
}
