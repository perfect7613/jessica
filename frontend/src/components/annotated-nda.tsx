"use client";

import { useMemo, useCallback, Fragment } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

export interface FlaggedClause {
  original_text: string;
  risk_level: "red" | "yellow" | "green";
  clause_type: string;
  explanation: string;
  citation: string;
  reference_section: string;
}

interface AnnotatedNDAProps {
  ndaText: string;
  clauses: FlaggedClause[];
  onClauseClick?: (index: number) => void;
}

const riskStyles: Record<
  string,
  { bg: string; border: string; hoverBg: string }
> = {
  red: {
    bg: "rgba(220, 70, 70, 0.12)",
    border: "#dc4646",
    hoverBg: "rgba(220, 70, 70, 0.2)",
  },
  yellow: {
    bg: "rgba(217, 172, 95, 0.12)",
    border: "#d9ac5f",
    hoverBg: "rgba(217, 172, 95, 0.2)",
  },
  green: {
    bg: "rgba(120, 180, 120, 0.12)",
    border: "#78b478",
    hoverBg: "rgba(120, 180, 120, 0.2)",
  },
};

interface TextSegment {
  type: "text" | "clause";
  content: string;
  clauseIndex?: number;
  clause?: FlaggedClause;
}

export function AnnotatedNDA({
  ndaText,
  clauses,
  onClauseClick,
}: AnnotatedNDAProps) {
  const segments = useMemo(() => {
    if (!clauses || clauses.length === 0) {
      return [{ type: "text" as const, content: ndaText }];
    }

    // Find all clause positions in the text
    const matches: { start: number; end: number; clauseIndex: number }[] = [];

    clauses.forEach((clause, index) => {
      if (!clause.original_text) return;
      const pos = ndaText.indexOf(clause.original_text);
      if (pos !== -1) {
        matches.push({
          start: pos,
          end: pos + clause.original_text.length,
          clauseIndex: index,
        });
      }
    });

    // Sort by position
    matches.sort((a, b) => a.start - b.start);

    // Remove overlapping matches (keep first)
    const filtered: typeof matches = [];
    for (const m of matches) {
      const last = filtered[filtered.length - 1];
      if (!last || m.start >= last.end) {
        filtered.push(m);
      }
    }

    // Build segments
    const result: TextSegment[] = [];
    let cursor = 0;

    for (const match of filtered) {
      if (match.start > cursor) {
        result.push({
          type: "text",
          content: ndaText.slice(cursor, match.start),
        });
      }
      result.push({
        type: "clause",
        content: ndaText.slice(match.start, match.end),
        clauseIndex: match.clauseIndex,
        clause: clauses[match.clauseIndex],
      });
      cursor = match.end;
    }

    if (cursor < ndaText.length) {
      result.push({ type: "text", content: ndaText.slice(cursor) });
    }

    return result;
  }, [ndaText, clauses]);

  const handleClauseClick = useCallback(
    (index: number) => {
      onClauseClick?.(index);
    },
    [onClauseClick]
  );

  return (
    <TooltipProvider>
      <div className="font-sans text-sm leading-7 text-[rgb(200_200_210)] whitespace-pre-wrap">
        {segments.map((segment, i) => {
          if (segment.type === "text") {
            return <Fragment key={i}>{segment.content}</Fragment>;
          }

          const clause = segment.clause!;
          const style = riskStyles[clause.risk_level] || riskStyles.yellow;

          return (
            <Tooltip key={i}>
              <TooltipTrigger
                render={
                  <span
                    role="button"
                    tabIndex={0}
                    data-clause-index={segment.clauseIndex}
                    className="relative cursor-pointer rounded-sm px-0.5 transition-colors duration-150"
                    style={{
                      backgroundColor: style.bg,
                      borderLeft: `3px solid ${style.border}`,
                      paddingLeft: "6px",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        style.hoverBg;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        style.bg;
                    }}
                    onClick={() =>
                      segment.clauseIndex !== undefined &&
                      handleClauseClick(segment.clauseIndex)
                    }
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        segment.clauseIndex !== undefined
                      ) {
                        handleClauseClick(segment.clauseIndex);
                      }
                    }}
                  >
                    {segment.content}
                  </span>
                }
              />
              <TooltipContent side="top" className="max-w-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: style.border }}
                    />
                    <span className="font-medium text-xs">
                      {clause.clause_type}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    {clause.explanation.length > 150
                      ? clause.explanation.slice(0, 150) + "..."
                      : clause.explanation}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
