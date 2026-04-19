"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  ChevronDown,
  FileText,
  Loader2,
} from "lucide-react";

import { getRun, getTrace, getAnnotations, annotateRun } from "@/lib/api";
import type { Run } from "@/lib/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import {
  AnnotatedNDA,
  type FlaggedClause,
} from "@/components/annotated-nda";
import {
  TraceViewer,
  type TraceEvent,
} from "@/components/trace-viewer";
import { StarRating } from "@/components/star-rating";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AnalysisData extends Run {
  input_text?: string;
  gc_summary?: string;
  clauses?: FlaggedClause[];
  annotations?: { rating: number; note?: string }[];
}

interface Annotation {
  rating: number;
  note?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalizeSeverity(
  s: string | undefined
): "red" | "yellow" | "green" {
  if (!s) return "yellow";
  const lower = s.toLowerCase();
  if (lower === "red" || lower === "danger" || lower === "high") return "red";
  if (lower === "green" || lower === "safe" || lower === "low") return "green";
  return "yellow";
}

function normalizeClauses(run: AnalysisData): FlaggedClause[] {
  // If the run already has typed clauses
  if (run.clauses && Array.isArray(run.clauses)) {
    return run.clauses.map((c) => ({
      ...c,
      risk_level: normalizeSeverity(c.risk_level),
    }));
  }
  // Try deriving from flags
  if (run.flags && Array.isArray(run.flags)) {
    return run.flags.map((f) => ({
      original_text: (f.clause as string) || "",
      risk_level: normalizeSeverity(f.severity),
      clause_type: (f.title as string) || "Clause",
      explanation: (f.description as string) || "",
      citation: "",
      reference_section: "",
    }));
  }
  return [];
}

function countByRisk(clauses: FlaggedClause[]) {
  const counts = { red: 0, yellow: 0, green: 0 };
  for (const c of clauses) {
    counts[c.risk_level]++;
  }
  return counts;
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                    */
/* ------------------------------------------------------------------ */

function AnalysisSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-64 bg-[rgb(30_30_34)]" />
        <Skeleton className="h-5 w-20 bg-[rgb(30_30_34)]" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.66fr] gap-8">
        <div className="space-y-4">
          <Skeleton className="h-6 w-48 bg-[rgb(30_30_34)]" />
          <Skeleton className="h-[400px] w-full bg-[rgb(30_30_34)]" />
        </div>
        <div className="space-y-4">
          <div className="flex gap-3">
            <Skeleton className="h-16 w-24 bg-[rgb(30_30_34)]" />
            <Skeleton className="h-16 w-24 bg-[rgb(30_30_34)]" />
            <Skeleton className="h-16 w-24 bg-[rgb(30_30_34)]" />
          </div>
          <Skeleton className="h-32 w-full bg-[rgb(30_30_34)]" />
          <Skeleton className="h-64 w-full bg-[rgb(30_30_34)]" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Clause accordion item                                               */
/* ------------------------------------------------------------------ */

const riskBadgeStyles: Record<string, { bg: string; text: string }> = {
  red: { bg: "rgba(220, 70, 70, 0.15)", text: "#dc4646" },
  yellow: { bg: "rgba(217, 172, 95, 0.15)", text: "#d9ac5f" },
  green: { bg: "rgba(120, 180, 120, 0.15)", text: "#78b478" },
};

function ClauseItem({
  clause,
  index,
  isOpen,
  onToggle,
}: {
  clause: FlaggedClause;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const badgeStyle = riskBadgeStyles[clause.risk_level] || riskBadgeStyles.yellow;

  return (
    <div
      id={`clause-detail-${index}`}
      className="rounded-lg border border-[rgb(40_40_45)] bg-[rgb(22_22_26)] overflow-hidden"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[rgb(30_30_34)]"
      >
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown className="size-3.5 text-[rgb(120_120_130)]" />
        </motion.div>

        <span className="flex-1 text-sm font-medium text-foreground truncate">
          {clause.clause_type}
        </span>

        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
          style={{
            backgroundColor: badgeStyle.bg,
            color: badgeStyle.text,
          }}
        >
          {clause.risk_level}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[rgb(40_40_45)] px-4 py-3 space-y-3">
              <p className="text-sm leading-relaxed text-[rgb(200_200_210)]">
                {clause.explanation}
              </p>

              {clause.citation && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[rgb(120_120_130)] block mb-1">
                    Citation
                  </span>
                  <p className="text-xs font-mono leading-relaxed text-[rgb(140_140_150)] bg-[rgb(18_18_22)] rounded px-3 py-2">
                    {clause.citation}
                  </p>
                </div>
              )}

              {clause.reference_section && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[rgb(120_120_130)] block mb-1">
                    Reference Section
                  </span>
                  <p className="text-xs text-[rgb(160_160_170)]">
                    {clause.reference_section}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */

export default function AnalysisPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<AnalysisData | null>(null);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Annotation form state
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Accordion state
  const [openClauses, setOpenClauses] = useState<Set<number>>(new Set());

  const rightPanelRef = useRef<HTMLDivElement>(null);

  /* Load data */
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [runData, traceData, annotationData] = await Promise.allSettled([
          getRun(id),
          getTrace(id),
          getAnnotations(id),
        ]);

        if (runData.status === "fulfilled") {
          setData(runData.value as AnalysisData);
        } else {
          setError("Failed to load analysis");
          return;
        }

        if (traceData.status === "fulfilled") {
          const trace = traceData.value;
          // api.ts now returns the array directly
          setTraceEvents(Array.isArray(trace) ? trace : []);
        }

        if (annotationData.status === "fulfilled") {
          const ann = annotationData.value;
          // api.ts now returns the array directly
          setAnnotations(Array.isArray(ann) ? ann : []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  /* Handle clause click from annotated NDA */
  const handleClauseClick = useCallback((index: number) => {
    setOpenClauses((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });

    // Scroll to clause detail in right panel
    setTimeout(() => {
      const el = document.getElementById(`clause-detail-${index}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Flash effect
        el.style.boxShadow = "0 0 0 2px rgba(217, 172, 95, 0.5)";
        setTimeout(() => {
          el.style.boxShadow = "";
        }, 1500);
      }
    }, 100);
  }, []);

  /* Toggle clause accordion */
  const toggleClause = useCallback((index: number) => {
    setOpenClauses((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  /* Submit annotation */
  const handleSubmitAnnotation = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await annotateRun(id, rating, note || undefined);
      setSubmitted(true);
      setAnnotations((prev) => [...prev, { rating, note: note || undefined }]);
    } catch {
      // silently fail for now
    } finally {
      setSubmitting(false);
    }
  };

  /* Derived data */
  const clauses = data ? normalizeClauses(data) : [];
  const counts = countByRisk(clauses);
  const ndaText = data?.input_text || "";
  const gcSummary = data?.gc_summary || data?.summary || "";

  if (loading) {
    return <AnalysisSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="size-12 text-[rgb(220_70_70)] mb-4" />
        <h2 className="font-serif text-2xl text-foreground mb-2">
          Analysis Not Found
        </h2>
        <p className="text-sm text-[rgb(160_160_170)]">
          {error || "Could not load this analysis."}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <FileText className="size-5 text-[#d9ac5f]" />
          <h1 className="font-serif text-2xl lg:text-3xl text-foreground">
            {data.filename || "NDA Analysis"}
          </h1>
        </div>
        {data.created_at && (
          <span className="text-xs text-[rgb(120_120_130)] uppercase tracking-wider">
            {new Date(data.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.66fr] gap-8">
        {/* LEFT COLUMN — Annotated NDA */}
        <div className="min-w-0">
          <h2 className="font-serif text-lg text-foreground mb-4 flex items-center gap-2">
            <span className="text-[rgb(160_160_170)] text-xs uppercase tracking-wider font-sans">
              Annotated Document
            </span>
          </h2>

          <Card className="border-[rgb(40_40_45)] bg-[rgb(18_18_22)]">
            <CardContent className="p-0">
              <ScrollArea className="h-[600px] lg:h-[700px]">
                <div className="p-6">
                  {ndaText ? (
                    <AnnotatedNDA
                      ndaText={ndaText}
                      clauses={clauses}
                      onClauseClick={handleClauseClick}
                    />
                  ) : (
                    <p className="text-sm text-[rgb(120_120_130)] italic">
                      Original NDA text not available for annotation view.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN — Summary + Details */}
        <div ref={rightPanelRef} className="lg:sticky lg:top-8 lg:self-start space-y-6">
          {/* Flag counts */}
          <div className="flex gap-3">
            <div
              className="flex-1 rounded-lg px-4 py-3 text-center"
              style={{ backgroundColor: "rgba(220, 70, 70, 0.12)" }}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <AlertTriangle className="size-3.5" style={{ color: "#dc4646" }} />
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "#dc4646" }}>
                  High Risk
                </span>
              </div>
              <span className="text-2xl font-serif" style={{ color: "#dc4646" }}>
                {counts.red}
              </span>
            </div>

            <div
              className="flex-1 rounded-lg px-4 py-3 text-center"
              style={{ backgroundColor: "rgba(217, 172, 95, 0.12)" }}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <AlertCircle className="size-3.5" style={{ color: "#d9ac5f" }} />
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "#d9ac5f" }}>
                  Caution
                </span>
              </div>
              <span className="text-2xl font-serif" style={{ color: "#d9ac5f" }}>
                {counts.yellow}
              </span>
            </div>

            <div
              className="flex-1 rounded-lg px-4 py-3 text-center"
              style={{ backgroundColor: "rgba(120, 180, 120, 0.12)" }}
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <ShieldCheck className="size-3.5" style={{ color: "#78b478" }} />
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "#78b478" }}>
                  Clear
                </span>
              </div>
              <span className="text-2xl font-serif" style={{ color: "#78b478" }}>
                {counts.green}
              </span>
            </div>
          </div>

          {/* GC Summary */}
          {gcSummary && (
            <Card className="border-[rgb(40_40_45)] bg-[rgb(22_22_26)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-serif text-foreground flex items-center gap-2">
                  General Counsel Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-[rgb(200_200_210)]">
                  {gcSummary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Flagged Clauses List */}
          {clauses.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wider text-[rgb(160_160_170)] font-sans mb-3 flex items-center gap-2">
                Flagged Clauses
                <Badge variant="secondary" className="text-[10px] h-4 bg-[rgb(30_30_34)] text-[rgb(160_160_170)]">
                  {clauses.length}
                </Badge>
              </h3>

              <ScrollArea className="h-[350px] lg:h-[400px]">
                <div className="space-y-2 pr-2">
                  {clauses.map((clause, i) => (
                    <ClauseItem
                      key={i}
                      clause={clause}
                      index={i}
                      isOpen={openClauses.has(i)}
                      onToggle={() => toggleClause(i)}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>

      {/* BELOW BOTH COLUMNS */}
      <Separator className="bg-[rgb(40_40_45)]" />

      {/* Trace Viewer */}
      {traceEvents.length > 0 && (
        <TraceViewer events={traceEvents} />
      )}

      {/* Annotation Section */}
      <Card className="border-[rgb(217_172_95)]/30 bg-gradient-to-br from-[rgb(28_26_22)] to-[rgb(22_22_26)]">
        <CardHeader className="border-b border-[rgb(217_172_95)]/15 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-[#d9ac5f] rounded-full" />
            <CardTitle className="text-lg font-serif text-foreground">
              Rate This Analysis
            </CardTitle>
          </div>
          <p className="text-xs text-[rgb(160_160_170)] mt-1 ml-[1.25rem]">
            Your feedback helps improve the quality of future reviews
          </p>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          {/* Existing annotations */}
          {annotations.length > 0 && (
            <div className="space-y-3 mb-4">
              <span className="text-[10px] uppercase tracking-[0.24em] text-[rgb(217_172_95)] font-medium">
                Previous Feedback
              </span>
              {annotations.map((ann, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg bg-[rgb(15_15_18)] border border-[rgb(40_40_45)] px-4 py-3"
                >
                  <div className="flex items-center gap-0.5 shrink-0">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <svg
                        key={s}
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill={s <= ann.rating ? "#d9ac5f" : "none"}
                        stroke={s <= ann.rating ? "#d9ac5f" : "rgb(60 60 68)"}
                        strokeWidth="1.5"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    ))}
                  </div>
                  {ann.note && (
                    <p className="text-sm text-[rgb(200_200_210)] leading-relaxed">
                      {ann.note}
                    </p>
                  )}
                </div>
              ))}
              <Separator className="bg-[rgb(50_48_40)]" />
            </div>
          )}

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 rounded-lg bg-[rgba(120,180,120,0.1)] border border-[rgba(120,180,120,0.2)] px-5 py-4"
            >
              <ShieldCheck className="size-5 text-[#78b478]" />
              <span className="text-sm text-[#78b478] font-medium">Feedback recorded. Thank you.</span>
            </motion.div>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="text-[10px] uppercase tracking-[0.24em] text-[rgb(200_200_210)] font-medium block mb-3">
                  How accurate was this analysis?
                </label>
                <StarRating value={rating} onChange={setRating} />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.24em] text-[rgb(200_200_210)] font-medium block mb-2">
                  Notes (optional)
                </label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What did the agents get right or wrong..."
                  className="bg-[rgb(15_15_18)] border-[rgb(50_48_40)] text-sm text-[rgb(220_220_225)] placeholder:text-[rgb(80_80_90)] resize-none min-h-[90px] focus:border-[rgb(217_172_95)]/50 focus:ring-[rgb(217_172_95)]/20"
                />
              </div>

              <Button
                onClick={handleSubmitAnnotation}
                disabled={rating === 0 || submitting}
                className="bg-[#d9ac5f] text-[rgb(15_15_18)] font-medium hover:bg-[#e6bc73] disabled:opacity-30 disabled:bg-[rgb(60_60_68)] disabled:text-[rgb(100_100_110)] transition-all duration-200 px-6 py-2.5 text-[11px] uppercase tracking-[0.2em]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Submitting...
                  </>
                ) : (
                  "Submit Feedback"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
