import { useCopy } from "../lib/hooks";
import type { Status, StatusTone } from "../lib/resources";

const TONES: Record<StatusTone, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  idle: "text-ink-soft",
};

/** Always shows the word, so colour never carries the meaning alone. */
export function StatusLabel({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 whitespace-nowrap ${TONES[status.tone]}`}>
      <span aria-hidden="true" className="size-2.25 flex-none rounded-full bg-current" />
      {status.label}
    </span>
  );
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function TimeAgo({ date }: { date: Date }) {
  const seconds = (date.getTime() - Date.now()) / 1000;
  const unit = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  const text = unit
    ? relative.format(Math.round(seconds / unit[1]), unit[0])
    : "just now";
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString()} className="whitespace-nowrap">
      {text}
    </time>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      className="flex-none cursor-pointer rounded-[3px] border border-ink-soft/50 px-2 py-px text-label hover:border-ink-soft hover:bg-sheet"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
