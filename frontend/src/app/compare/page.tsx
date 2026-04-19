"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import {
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";

import { getRun } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FlaggedClause {
  original_text: string;
  risk_level: "red" | "yellow" | "green";
  clause_type: string;
  explanation: string;
  citation: string;
  reference_section: string;
}

interface RunData {
  id: string;
  created_at?: string;
  summary?: string;
  red_flags?: number;
  yellow_flags?: number;
  green_flags?: number;
  clauses?: FlaggedClause[];
  flag_counts?: { red?: number; yellow?: number; green?: number };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function shortId(id: string) {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function getCounts(run: RunData) {
  if (run.flag_counts)
    return {
      red: run.flag_counts.red ?? 0,
      yellow: run.flag_counts.yellow ?? 0,
      green: run.flag_counts.green ?? 0,
    };
  return {
    red: run.red_flags ?? 0,
    yellow: run.yellow_flags ?? 0,
    green: run.green_flags ?? 0,
  };
}

function formatDate(ts?: string) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

const riskBadge: Record<string, { bg: string; text: string; label: string }> = {
  red: { bg: "rgba(220,70,70,0.15)", text: "#dc4646", label: "High Risk" },
  yellow: { bg: "rgba(217,172,95,0.15)", text: "#d9ac5f", label: "Caution" },
  green: { bg: "rgba(120,180,120,0.15)", text: "#78b478", label: "Clear" },
};

/* ------------------------------------------------------------------ */
/*  Single run column                                                   */
/* ------------------------------------------------------------------ */

function RunColumn({ run, label }: { run: RunData; label: string }) {
  const counts = getCounts(run);
  const clauses = run.clauses ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.32em] text-[rgb(217_172_95)] font-medium">
          {label}
        </div>
        <div className="mt-1 font-mono text-xs text-[rgb(160_160_170)]">
          {shortId(run.id)}
        </div>
        <div className="text-[10px] text-[rgb(120_120_130)] mt-0.5">
          {formatDate(run.created_at)}
        </div>
      </div>

      {/* Flag counts */}
      <div className="flex gap-2">
        {(["red", "yellow", "green"] as const).map((level) => {
          const badge = riskBadge[level];
          const Icon =
            level === "red"
              ? AlertTriangle
              : level === "yellow"
                ? AlertCircle
                : ShieldCheck;
          return (
            <div
              key={level}
              className="flex-1 rounded-lg px-3 py-2.5 text-center"
              style={{ backgroundColor: badge.bg }}
            >
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Icon className="size-3" style={{ color: badge.text }} />
                <span
                  className="text-[9px] uppercase tracking-wider font-medium"
                  style={{ color: badge.text }}
                >
                  {badge.label}
                </span>
              </div>
              <span
                className="text-xl font-serif"
                style={{ color: badge.text }}
              >
                {counts[level]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <Card className="border-[rgb(40_40_45)] bg-[rgb(22_22_26)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wider text-[rgb(160_160_170)] font-sans">
            General Counsel Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-[rgb(200_200_210)]">
            {run.summary || "No summary available."}
          </p>
        </CardContent>
      </Card>

      {/* Clauses */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)] mb-3">
          Flagged Clauses ({clauses.length})
        </div>
        <ScrollArea className="h-[500px]">
          <div className="space-y-2 pr-2">
            {clauses.map((c, i) => {
              const badge = riskBadge[c.risk_level] || riskBadge.yellow;
              return (
                <div
                  key={i}
                  className="rounded-lg border border-[rgb(40_40_45)] bg-[rgb(22_22_26)] p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {c.clause_type}
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                      style={{
                        backgroundColor: badge.bg,
                        color: badge.text,
                      }}
                    >
                      {c.risk_level}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-[rgb(180_180_190)]">
                    {c.explanation}
                  </p>
                  {c.citation && (
                    <p className="text-[10px] font-mono text-[rgb(120_120_130)] leading-relaxed bg-[rgb(18_18_22)] rounded px-2.5 py-1.5">
                      {c.citation}
                    </p>
                  )}
                </div>
              );
            })}
            {clauses.length === 0 && (
              <div className="text-xs text-[rgb(120_120_130)] italic py-8 text-center">
                No flagged clauses
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compare content (needs searchParams)                               */
/* ------------------------------------------------------------------ */

function CompareContent() {
  const searchParams = useSearchParams();
  const idA = searchParams.get("a") || "";
  const idB = searchParams.get("b") || "";

  const [runA, setRunA] = useState<RunData | null>(null);
  const [runB, setRunB] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idA || !idB) {
      setError("Two run IDs are required for comparison.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const [a, b] = await Promise.all([getRun(idA), getRun(idB)]);
        setRunA(a as RunData);
        setRunB(b as RunData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load runs");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [idA, idB]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="h-6 w-32 bg-[rgb(30_30_34)]" />
            <Skeleton className="h-16 w-full bg-[rgb(30_30_34)]" />
            <Skeleton className="h-32 w-full bg-[rgb(30_30_34)]" />
            <Skeleton className="h-[400px] w-full bg-[rgb(30_30_34)]" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !runA || !runB) {
    return (
      <div className="border border-dashed border-[rgb(60_60_68)] py-24 text-center">
        <div className="text-[10px] uppercase tracking-[0.32em] text-[rgb(160_160_170)]">
          Comparison unavailable
        </div>
        <div className="mt-4 font-serif text-2xl italic text-foreground">
          {error || "Could not load one or both runs."}
        </div>
        <Link
          href="/history"
          className="inline-flex mt-8 items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[rgb(217_172_95)] hover:underline"
        >
          <ArrowLeft className="size-3" /> Back to Archive
        </Link>
      </div>
    );
  }

  /* Compute deltas */
  const countsA = getCounts(runA);
  const countsB = getCounts(runB);
  const totalA =
    (countsA.red ?? 0) + (countsA.yellow ?? 0) + (countsA.green ?? 0);
  const totalB =
    (countsB.red ?? 0) + (countsB.yellow ?? 0) + (countsB.green ?? 0);

  return (
    <>
      {/* Delta summary */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card className="border-[rgb(217_172_95)]/20 bg-[rgb(22_22_26)]">
          <CardContent className="py-5">
            <div className="grid grid-cols-4 gap-6 text-center">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[rgb(160_160_170)]">
                  Total Flags
                </div>
                <div className="mt-1 font-serif text-2xl text-foreground">
                  {totalA}{" "}
                  <span className="text-[rgb(120_120_130)] text-base">vs</span>{" "}
                  {totalB}
                </div>
              </div>
              {(["red", "yellow", "green"] as const).map((level) => {
                const a = countsA[level] ?? 0;
                const b = countsB[level] ?? 0;
                const diff = b - a;
                const badge = riskBadge[level];
                return (
                  <div key={level}>
                    <div
                      className="text-[10px] uppercase tracking-wider"
                      style={{ color: badge.text }}
                    >
                      {badge.label}
                    </div>
                    <div className="mt-1 font-serif text-2xl" style={{ color: badge.text }}>
                      {a}{" "}
                      <span className="text-[rgb(120_120_130)] text-base">
                        vs
                      </span>{" "}
                      {b}
                      {diff !== 0 && (
                        <span className="text-sm ml-1">
                          ({diff > 0 ? "+" : ""}
                          {diff})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Separator className="bg-[rgb(40_40_45)]" />

      {/* Side by side */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-8"
      >
        <RunColumn run={runA} label="Run A" />
        <div className="hidden lg:block">
          <div className="sticky top-0 h-full border-l border-[rgb(40_40_45)]" />
        </div>
        <RunColumn run={runB} label="Run B" />
      </motion.div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ComparePage() {
  return (
    <div className="flex flex-col gap-8 pb-16">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Link
          href="/history"
          className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[rgb(160_160_170)] hover:text-[rgb(217_172_95)] transition-colors mb-6"
        >
          <ArrowLeft className="size-3" /> Back to Archive
        </Link>

        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-[rgb(160_160_170)]">
          <span className="inline-block h-px w-8 bg-[rgb(217_172_95)]/60" />
          Side-by-Side Comparison
        </div>
        <h1 className="mt-4 font-serif text-4xl sm:text-5xl leading-[0.95] tracking-tight">
          <span className="italic">Compare</span>{" "}
          <span>Analyses</span>
          <span className="text-[rgb(217_172_95)]">.</span>
        </h1>
      </motion.div>

      <Separator className="bg-[rgb(40_40_45)]" />

      <Suspense
        fallback={
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-6 w-32 bg-[rgb(30_30_34)]" />
                <Skeleton className="h-16 w-full bg-[rgb(30_30_34)]" />
                <Skeleton className="h-[400px] w-full bg-[rgb(30_30_34)]" />
              </div>
            ))}
          </div>
        }
      >
        <CompareContent />
      </Suspense>
    </div>
  );
}
