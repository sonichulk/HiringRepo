import { Icon } from "@/components/Icon";
import { FOLLOWUP_STATE_LABEL, type FollowupState } from "@/lib/chat";

const TONE: Record<FollowupState, string> = {
  sent: "border-amber-200 bg-amber-50 text-amber-800",
  started: "border-blue-200 bg-blue-50 text-blue-800",
  done: "border-green-200 bg-green-50 text-green-800",
};

/** "Follow-up sent / started / done" on a table row. Clicking opens View info → Assessment. */
export function FollowupTag({ state, onOpen }: { state?: FollowupState; onOpen: () => void }) {
  if (!state) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-followup-tag={state}
      title="Follow-up chat — open View info → Assessment"
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold hover:underline ${TONE[state]}`}
    >
      <Icon name="chatDots" className="h-3 w-3" />
      {FOLLOWUP_STATE_LABEL[state]}
    </button>
  );
}
