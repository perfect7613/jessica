"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { analyzeNDA, listRuns, getStats, type Run, type Stats } from "@/lib/api";

const ACCEPTED = ".md,.markdown,.txt";

function pickRunId(run: Run): string {
  return (run.id || run.run_id || "") as string;
}

function shortId(id: string) {
  if (!id) return "—";
  return id.length > 10 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
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

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Run[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRuns()
      .then((runs) => {
        if (!cancelled) setRecent((runs || []).slice(0, 3));
      })
      .catch(() => {});
    getStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function onPick(f: File | null) {
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith(".md") && !name.endsWith(".markdown") && !name.endsWith(".txt")) {
      setError("Unsupported file type. Use .md, .markdown, or .txt");
      return;
    }
    setError(null);
    setFile(f);
  }

  async function handleAnalyze() {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeNDA(file);
      const id = result?.id || result?.run_id;
      if (!id) throw new Error("No run id returned from server");
      router.push(`/analysis/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-24">
      {/* Hero */}
      <motion.section
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
        }}
        className="pt-8 sm:pt-16"
      >
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 8 },
            show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] } },
          }}
          className="flex items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-[rgb(160_160_170)]"
        >
          <span className="inline-block h-px w-8 bg-[rgb(217_172_95)]/60" />
          Confidential · NDA Review
        </motion.div>

        <motion.h1
          variants={{
            hidden: { opacity: 0, y: 20 },
            show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.2, 0.8, 0.2, 1] } },
          }}
          className="mt-6 font-serif text-6xl sm:text-8xl leading-[0.95] tracking-tight"
        >
          <span className="italic">Jessica</span>
          <span className="text-[rgb(217_172_95)]">.</span>
        </motion.h1>

        <motion.p
          variants={{
            hidden: { opacity: 0, y: 20 },
            show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.2, 0.8, 0.2, 1] } },
          }}
          className="mt-6 max-w-xl text-lg text-[rgb(160_160_170)] leading-relaxed"
        >
          An AI legal team that reads your non-disclosure agreement with the patience
          of an associate and the eye of a partner. Upload a draft; receive a risk
          brief in minutes.
        </motion.p>

        {/* Meta row — live stats */}
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 16 },
            show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.2, 0.8, 0.2, 1] } },
          }}
          className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-8 max-w-2xl text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)]"
        >
          <div>
            <div className="text-[rgb(217_172_95)] font-serif text-3xl normal-case tracking-normal">
              {stats ? String(stats.total_runs).padStart(2, "0") : "—"}
            </div>
            <div className="mt-2">Contracts Reviewed</div>
          </div>
          <div>
            <div className="text-[rgb(217_172_95)] font-serif text-3xl normal-case tracking-normal">
              {stats ? stats.total_clauses_reviewed : "—"}
            </div>
            <div className="mt-2">Clauses Analyzed</div>
          </div>
          <div>
            <div className="text-[rgb(217_172_95)] font-serif text-3xl normal-case tracking-normal">
              04
            </div>
            <div className="mt-2">Specialist Agents</div>
          </div>
          <div>
            <div className="text-[rgb(217_172_95)] font-serif text-3xl normal-case tracking-normal">
              {stats?.avg_rating ? `${stats.avg_rating}/5` : "3-Tier"}
            </div>
            <div className="mt-2">{stats?.avg_rating ? "Avg. Rating" : "Risk Flagging"}</div>
          </div>
        </motion.div>
      </motion.section>

      {/* Upload */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        className="grid grid-cols-12 gap-6"
      >
        <div className="col-span-12 lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.32em] text-[rgb(160_160_170)]">
              § 01 · Intake
            </div>
            <h2 className="mt-4 font-serif text-4xl italic leading-tight">
              Submit a draft.
            </h2>
            <p className="mt-4 text-sm text-[rgb(160_160_170)] leading-relaxed max-w-xs">
              Markdown or plain text. We parse every clause, cross-reference against our
              precedent library, and return a risk-coded brief.
            </p>
          </div>
          <div className="mt-10 space-y-2 text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)]">
            <div className="flex items-center gap-3">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-danger" />
              Red — material risk
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
              Yellow — review advised
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-safe" />
              Green — standard language
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!loading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (loading) return;
              const f = e.dataTransfer.files?.[0];
              if (f) onPick(f);
            }}
            onClick={() => !loading && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            className={[
              "relative cursor-pointer rounded-sm border border-dashed transition-all duration-300",
              "bg-[rgb(22_22_26)]/40 backdrop-blur-sm",
              "min-h-[360px] flex flex-col items-center justify-center p-10 text-center",
              dragging
                ? "border-[rgb(217_172_95)] bg-[rgb(217_172_95)]/[0.06] glow-gold"
                : "border-[rgb(60_60_68)] hover:border-[rgb(217_172_95)]/60",
              loading ? "pointer-events-none opacity-90" : "",
            ].join(" ")}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />

            {/* Corner ticks — editorial detail */}
            <span className="pointer-events-none absolute top-3 left-3 h-3 w-3 border-l border-t border-[rgb(217_172_95)]/40" />
            <span className="pointer-events-none absolute top-3 right-3 h-3 w-3 border-r border-t border-[rgb(217_172_95)]/40" />
            <span className="pointer-events-none absolute bottom-3 left-3 h-3 w-3 border-l border-b border-[rgb(217_172_95)]/40" />
            <span className="pointer-events-none absolute bottom-3 right-3 h-3 w-3 border-r border-b border-[rgb(217_172_95)]/40" />

            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-6"
                >
                  <div className="flex items-end gap-1 h-8">
                    {[0, 1, 2, 3].map((i) => (
                      <motion.span
                        key={i}
                        animate={{ scaleY: [0.4, 1, 0.4] }}
                        transition={{
                          duration: 1.2,
                          repeat: Infinity,
                          delay: i * 0.15,
                          ease: "easeInOut",
                        }}
                        className="inline-block w-[3px] h-8 origin-bottom bg-[rgb(217_172_95)]"
                      />
                    ))}
                  </div>
                  <div className="font-serif italic text-2xl text-foreground">
                    Agents analyzing your NDA
                    <motion.span
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                    >
                      …
                    </motion.span>
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.32em] text-[rgb(160_160_170)]">
                    Counsel convening · do not refresh
                  </div>
                </motion.div>
              ) : file ? (
                <motion.div
                  key="file"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="text-[10px] uppercase tracking-[0.32em] text-[rgb(217_172_95)]">
                    Document queued
                  </div>
                  <div className="font-serif text-3xl italic max-w-md truncate px-4">
                    {file.name}
                  </div>
                  <div className="text-xs text-[rgb(160_160_170)]">
                    {(file.size / 1024).toFixed(1)} KB · ready for review
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="mt-2 text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)] hover:text-[rgb(217_172_95)] transition-colors"
                  >
                    Remove · choose another
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="text-[10px] uppercase tracking-[0.32em] text-[rgb(160_160_170)]">
                    Drag · Drop · Deposit
                  </div>
                  <div className="font-serif text-3xl italic text-foreground">
                    Place the document here
                  </div>
                  <div className="text-xs text-[rgb(160_160_170)]">
                    or click to select · accepts .md, .markdown, .txt
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-xs text-danger uppercase tracking-[0.2em]"
            >
              {error}
            </motion.div>
          )}

          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)]">
              {file ? "One document · ready" : "No document selected"}
            </div>
            <button
              onClick={handleAnalyze}
              disabled={!file || loading}
              className={[
                "group inline-flex items-center gap-3 px-7 py-3.5",
                "text-[11px] uppercase tracking-[0.28em] font-medium",
                "border transition-all duration-300",
                file && !loading
                  ? "bg-[rgb(217_172_95)] text-[rgb(15_15_18)] border-[rgb(217_172_95)] hover:bg-[rgb(230_188_115)] hover:border-[rgb(230_188_115)]"
                  : "bg-transparent text-[rgb(120_120_130)] border-[rgb(40_40_45)] cursor-not-allowed",
              ].join(" ")}
            >
              {loading ? "Analyzing" : "Analyze Contract"}
              <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">
                →
              </span>
            </button>
          </div>
        </div>
      </motion.section>

      {/* Recent runs */}
      {recent.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.32em] text-[rgb(160_160_170)]">
                § 02 · Prior Reviews
              </div>
              <h2 className="mt-3 font-serif text-3xl italic">Recent dockets.</h2>
            </div>
            <Link
              href="/history"
              className="text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)] hover:text-[rgb(217_172_95)] transition-colors"
            >
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recent.map((run, i) => {
              const id = pickRunId(run);
              const counts = flagCounts(run);
              return (
                <motion.div
                  key={id || i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.9 + i * 0.08 }}
                >
                  <Link
                    href={`/analysis/${id}`}
                    className="group block border border-[rgb(40_40_45)] bg-[rgb(22_22_26)]/60 p-5 hover:border-[rgb(217_172_95)]/60 transition-colors"
                  >
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)]">
                      <span className="font-mono">{shortId(id)}</span>
                      <span>{formatTime(run)}</span>
                    </div>
                    <div className="mt-4 font-serif text-lg italic line-clamp-2 text-foreground">
                      {run.summary || run.filename || "Unnamed document"}
                    </div>
                    <div className="mt-5 flex items-center gap-4 text-[11px] text-[rgb(160_160_170)]">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-danger" />
                        {counts.red ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
                        {counts.yellow ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-safe" />
                        {counts.green ?? 0}
                      </span>
                      <span className="ml-auto text-[10px] uppercase tracking-[0.24em] group-hover:text-[rgb(217_172_95)] transition-colors">
                        Open →
                      </span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}
    </div>
  );
}
