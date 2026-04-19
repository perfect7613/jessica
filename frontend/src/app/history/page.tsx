"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { listRuns, type Run } from "@/lib/api";

function pickRunId(run: Run): string {
  return (run.id || run.run_id || "") as string;
}

function shortId(id: string) {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function flagCounts(run: Run) {
  if (run.flag_counts) return run.flag_counts;
  const counts = { red: 0, yellow: 0, green: 0 };
  for (const f of run.flags ?? []) {
    const s = String(f.severity || "").toLowerCase();
    if (s === "red" || s === "danger") counts.red++;
    else if (s === "yellow" || s === "warning") counts.yellow++;
    else if (s === "green" || s === "safe") counts.green++;
  }
  return counts;
}

function formatTime(run: Run) {
  const ts = run.created_at || run.timestamp;
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

export default function HistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    listRuns()
      .then((r) => setRuns(r || []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const canCompare = selected.length === 2;

  const ordered = useMemo(() => {
    if (!runs) return [];
    return [...runs].sort((a, b) => {
      const ta = new Date(a.created_at || a.timestamp || 0).getTime();
      const tb = new Date(b.created_at || b.timestamp || 0).getTime();
      return tb - ta;
    });
  }, [runs]);

  function toggle(id: string) {
    setSelected((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      if (s.length >= 2) return [s[1], id]; // keep last two
      return [...s, id];
    });
  }

  function handleCompare() {
    if (!canCompare) return;
    router.push(`/compare?a=${selected[0]}&b=${selected[1]}`);
  }

  return (
    <div className="flex flex-col gap-12 pb-32">
      {/* Header */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-[rgb(160_160_170)]">
          <span className="inline-block h-px w-8 bg-[rgb(217_172_95)]/60" />
          Archive · All Reviews
        </div>
        <h1 className="mt-6 font-serif text-5xl sm:text-7xl leading-[0.95] tracking-tight">
          <span className="italic">Case</span>{" "}
          <span>Archive</span>
          <span className="text-[rgb(217_172_95)]">.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[rgb(160_160_170)] leading-relaxed">
          Every NDA reviewed by counsel, filed chronologically. Select any two
          dockets to compare clause-by-clause.
        </p>
      </motion.section>

      <div className="hairline" />

      {/* Body */}
      {error && (
        <div className="text-xs text-danger uppercase tracking-[0.24em]">{error}</div>
      )}

      {!runs && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-48 border border-[rgb(40_40_45)] bg-[rgb(22_22_26)]/40 animate-pulse"
            />
          ))}
        </div>
      )}

      {runs && runs.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-dashed border-[rgb(60_60_68)] py-24 text-center"
        >
          <div className="text-[10px] uppercase tracking-[0.32em] text-[rgb(160_160_170)]">
            Docket is empty
          </div>
          <div className="mt-4 font-serif text-3xl italic">
            No analyses yet.
          </div>
          <div className="mt-2 text-sm text-[rgb(160_160_170)]">
            Upload your first NDA to begin the archive.
          </div>
          <Link
            href="/"
            className="inline-flex mt-8 items-center gap-2 px-6 py-3 bg-[rgb(217_172_95)] text-[rgb(15_15_18)] text-[11px] uppercase tracking-[0.28em] hover:bg-[rgb(230_188_115)] transition-colors"
          >
            Upload a Document →
          </Link>
        </motion.div>
      )}

      {runs && runs.length > 0 && (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.05 } },
          }}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
        >
          {ordered.map((run, i) => {
            const id = pickRunId(run);
            const counts = flagCounts(run);
            const isSelected = selected.includes(id);
            return (
              <motion.div
                key={id || i}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  show: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] },
                  },
                }}
                className={[
                  "relative group border bg-[rgb(22_22_26)]/60 backdrop-blur-sm",
                  "transition-all duration-300",
                  isSelected
                    ? "border-[rgb(217_172_95)] glow-gold"
                    : "border-[rgb(40_40_45)] hover:border-[rgb(217_172_95)]/60",
                ].join(" ")}
              >
                {/* Corner ticks */}
                <span className="pointer-events-none absolute top-2 left-2 h-2 w-2 border-l border-t border-[rgb(217_172_95)]/40" />
                <span className="pointer-events-none absolute top-2 right-2 h-2 w-2 border-r border-t border-[rgb(217_172_95)]/40" />
                <span className="pointer-events-none absolute bottom-2 left-2 h-2 w-2 border-l border-b border-[rgb(217_172_95)]/40" />
                <span className="pointer-events-none absolute bottom-2 right-2 h-2 w-2 border-r border-b border-[rgb(217_172_95)]/40" />

                {/* Checkbox (top-right, inside corner ticks area) */}
                <label
                  className="absolute top-4 right-4 z-10 flex items-center gap-2 cursor-pointer select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(id)}
                    className="peer sr-only"
                  />
                  <span
                    className={[
                      "inline-flex h-4 w-4 items-center justify-center border text-[10px]",
                      "transition-colors duration-200",
                      isSelected
                        ? "bg-[rgb(217_172_95)] border-[rgb(217_172_95)] text-[rgb(15_15_18)]"
                        : "border-[rgb(60_60_68)] bg-transparent text-transparent hover:border-[rgb(217_172_95)]/60",
                    ].join(" ")}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.24em] text-[rgb(160_160_170)]">
                    Compare
                  </span>
                </label>

                <Link href={`/analysis/${id}`} className="block p-6 pt-10">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)]">
                    <span className="font-mono text-[rgb(217_172_95)]/80">
                      {shortId(id)}
                    </span>
                  </div>

                  <div className="mt-3 text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)]">
                    Filed {formatTime(run) || "—"}
                  </div>

                  <div className="mt-5 font-serif text-xl italic leading-snug line-clamp-2 text-foreground group-hover:text-[rgb(245_241_232)]">
                    {run.summary || run.filename || "Unnamed document"}
                  </div>

                  <div className="mt-6 pt-4 border-t border-[rgb(40_40_45)] flex items-center gap-3 text-[11px] text-[rgb(160_160_170)]">
                    <Badge tone="danger" count={counts.red ?? 0} label="Red" />
                    <Badge tone="warning" count={counts.yellow ?? 0} label="Yellow" />
                    <Badge tone="safe" count={counts.green ?? 0} label="Green" />
                    <span className="ml-auto text-[10px] uppercase tracking-[0.24em] transition-colors group-hover:text-[rgb(217_172_95)]">
                      Open →
                    </span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Compare action bar */}
      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-5 px-6 py-3 border border-[rgb(217_172_95)]/60 bg-[rgb(22_22_26)]/95 backdrop-blur-md glow-gold">
              <div className="text-[10px] uppercase tracking-[0.28em] text-[rgb(160_160_170)]">
                {selected.length} of 2 selected
              </div>
              <div className="h-4 w-px bg-[rgb(40_40_45)]" />
              <button
                onClick={() => setSelected([])}
                className="text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)] hover:text-foreground transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleCompare}
                disabled={!canCompare}
                className={[
                  "inline-flex items-center gap-2 px-5 py-2 text-[11px] uppercase tracking-[0.28em] border transition-colors",
                  canCompare
                    ? "bg-[rgb(217_172_95)] text-[rgb(15_15_18)] border-[rgb(217_172_95)] hover:bg-[rgb(230_188_115)]"
                    : "bg-transparent text-[rgb(120_120_130)] border-[rgb(40_40_45)] cursor-not-allowed",
                ].join(" ")}
              >
                Compare →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Badge({
  tone,
  count,
  label,
}: {
  tone: "danger" | "warning" | "safe";
  count: number;
  label: string;
}) {
  const dot =
    tone === "danger"
      ? "bg-danger"
      : tone === "warning"
        ? "bg-warning"
        : "bg-safe";
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono tabular-nums"
      title={`${label}: ${count}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      {count}
    </span>
  );
}
