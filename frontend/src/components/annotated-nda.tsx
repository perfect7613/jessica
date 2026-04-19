"use client";

import { useMemo, useCallback, Fragment } from "react";

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

    // Strip markdown formatting for comparison purposes
    // The LLM returns original_text without ** markers, but input_text has them
    function stripMd(s: string): string {
      return s.replace(/\*\*/g, "").replace(/\*/g, "");
    }

    // Normalize whitespace for fuzzy matching
    function normalize(s: string): string {
      return stripMd(s).replace(/\s+/g, " ").trim();
    }

    // Find the position of a clause's text in the original NDA
    // Uses a sliding window approach on normalized text to find the match
    // then maps back to the original text positions
    function findClauseInNda(clauseText: string): { start: number; end: number } | null {
      // Try exact match first
      let pos = ndaText.indexOf(clauseText);
      if (pos !== -1) return { start: pos, end: pos + clauseText.length };

      // Try matching with stripped markdown
      const stripped = stripMd(clauseText);
      pos = ndaText.indexOf(stripped);
      if (pos !== -1) return { start: pos, end: pos + stripped.length };

      // Fuzzy match: normalize both texts and find position, then map back
      const normClause = normalize(clauseText);
      if (normClause.length < 20) return null;

      // Use first 60 chars of normalized clause as search anchor
      const anchor = normClause.slice(0, 60);
      const normNda = normalize(ndaText);
      const normPos = normNda.indexOf(anchor);
      if (normPos === -1) return null;

      // Map normalized position back to original position
      // Walk through original text, counting non-markdown, non-extra-whitespace chars
      let origStart = -1;
      let normCount = 0;
      let i = 0;
      const ndaLen = ndaText.length;

      while (i < ndaLen && normCount <= normPos + normClause.length + 50) {
        // Skip markdown markers
        if (ndaText[i] === "*") {
          i++;
          continue;
        }
        // Collapse whitespace
        if (/\s/.test(ndaText[i])) {
          if (normCount > 0 && normCount <= normPos + normClause.length) {
            normCount++;
          }
          // Skip extra whitespace
          while (i < ndaLen && /\s/.test(ndaText[i])) i++;
          if (normCount === normPos) origStart = i;
          continue;
        }

        if (normCount === normPos && origStart === -1) origStart = i;
        normCount++;
        i++;
      }

      if (origStart === -1) return null;

      // Find the end: search for the last few words of the clause text in the NDA
      // starting from origStart
      const lastWords = normClause.slice(-40);
      const searchRegion = normalize(ndaText.slice(origStart, origStart + normClause.length * 3));
      const endNormPos = searchRegion.indexOf(lastWords);

      if (endNormPos === -1) {
        // Fallback: use a generous end estimate
        const estimatedEnd = Math.min(origStart + normClause.length + 100, ndaLen);
        return { start: origStart, end: estimatedEnd };
      }

      // Find end position in original text by looking for the clause's last sentence
      const clauseWords = clauseText.trim().split(/\s+/);
      const lastFewWords = clauseWords.slice(-5).join(" ").replace(/\*\*/g, "");
      const endSearch = ndaText.indexOf(lastFewWords, origStart);
      if (endSearch !== -1) {
        return { start: origStart, end: endSearch + lastFewWords.length };
      }

      return { start: origStart, end: Math.min(origStart + normClause.length + 80, ndaLen) };
    }

    // Find all clause positions in the text
    const matches: { start: number; end: number; clauseIndex: number }[] = [];

    clauses.forEach((clause, index) => {
      if (!clause.original_text) return;
      const match = findClauseInNda(clause.original_text);
      if (match) {
        matches.push({ ...match, clauseIndex: index });
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
      <div className="font-sans text-sm leading-7 text-[rgb(200_200_210)] whitespace-pre-wrap">
        {segments.map((segment, i) => {
          if (segment.type === "text") {
            return <Fragment key={i}>{segment.content}</Fragment>;
          }

          const clause = segment.clause!;
          const style = riskStyles[clause.risk_level] || riskStyles.yellow;

          return (
            <span
              key={i}
              role="button"
              tabIndex={0}
              data-clause-index={segment.clauseIndex}
              className="relative cursor-pointer rounded-sm transition-colors duration-150"
              style={{
                backgroundColor: style.bg,
                borderLeft: `3px solid ${style.border}`,
                paddingLeft: "8px",
                paddingRight: "2px",
                paddingTop: "2px",
                paddingBottom: "2px",
                display: "inline",
              }}
              title={`${clause.clause_type} — ${clause.explanation.slice(0, 120)}...`}
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
          );
        })}
      </div>
  );
}
