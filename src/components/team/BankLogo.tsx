import { BANK_MARKS } from "@/lib/bankMarks";
import { BANKS, type BankId } from "@/lib/teamShared";

/** A bank's logo on its own colour, as a rounded square. */
export function BankLogo({ bank, size = 40, className = "" }: { bank: BankId; size?: number; className?: string }) {
  const m = BANK_MARKS[bank];
  const pad = Math.round(size * 0.2);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl ${className}`}
      style={{ width: size, height: size, background: m.bg }}
      data-bank-logo={bank}
      role="img"
      aria-label={`${BANKS[bank].label} logo`}
    >
      {m.path ? (
        <svg viewBox="0 0 24 24" width={size - pad * 2} height={size - pad * 2} aria-hidden fill={m.fg}>
          <path d={m.path} />
        </svg>
      ) : (
        <span style={{ color: m.fg, fontSize: size * 0.5, lineHeight: 1 }} className="font-display font-extrabold" aria-hidden>
          {m.letter}
        </span>
      )}
    </span>
  );
}
