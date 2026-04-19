const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Flag = {
  severity: "red" | "yellow" | "green" | "danger" | "warning" | "safe";
  title?: string;
  description?: string;
  clause?: string;
  [key: string]: unknown;
};

export type Run = {
  id: string;
  run_id?: string;
  created_at?: string;
  timestamp?: string;
  filename?: string;
  summary?: string;
  flags?: Flag[];
  flag_counts?: { red?: number; yellow?: number; green?: number };
  [key: string]: unknown;
};

export type Stats = {
  total_runs: number;
  total_clauses_reviewed: number;
  total_red: number;
  total_yellow: number;
  total_green: number;
  total_annotations: number;
  avg_rating: number | null;
};

export async function getStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function analyzeNDA(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  // Backend returns { run_id, analysis, trace }
  return { id: data.run_id, run_id: data.run_id, ...data };
}

export async function listRuns(): Promise<Run[]> {
  const res = await fetch(`${API_BASE}/api/runs`);
  if (!res.ok) throw new Error("Failed to fetch runs");
  const data = await res.json();
  // Backend returns { runs: [...] }
  const runs = data.runs || data || [];
  return runs.map((r: Record<string, unknown>) => ({
    ...r,
    // Normalize flag_counts from top-level red_flags/yellow_flags/green_flags
    flag_counts: {
      red: (r.red_flags as number) ?? 0,
      yellow: (r.yellow_flags as number) ?? 0,
      green: (r.green_flags as number) ?? 0,
    },
  }));
}

export async function getRun(id: string) {
  const res = await fetch(`${API_BASE}/api/runs/${id}`);
  if (!res.ok) throw new Error("Run not found");
  const data = await res.json();
  // Backend returns { run: { id, input_text, full_output: { clauses, summary, ... }, ... } }
  const run = data.run || data;
  const fullOutput = run.full_output || {};
  return {
    ...run,
    // Flatten full_output fields to top level for the analysis page
    clauses: fullOutput.clauses || [],
    summary: fullOutput.summary || run.summary || "",
    flag_counts: {
      red: (run.red_flags as number) ?? 0,
      yellow: (run.yellow_flags as number) ?? 0,
      green: (run.green_flags as number) ?? 0,
    },
  };
}

export async function getTrace(id: string) {
  const res = await fetch(`${API_BASE}/api/runs/${id}/trace`);
  if (!res.ok) throw new Error("Trace not found");
  const data = await res.json();
  // Backend returns { trace: [...] }
  return data.trace || data || [];
}

export async function annotateRun(id: string, rating: number, note?: string) {
  const res = await fetch(`${API_BASE}/api/runs/${id}/annotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating, note }),
  });
  if (!res.ok) throw new Error("Annotation failed");
  return res.json();
}

export async function getAnnotations(id: string) {
  const res = await fetch(`${API_BASE}/api/runs/${id}/annotations`);
  if (!res.ok) throw new Error("Failed to fetch annotations");
  const data = await res.json();
  // Backend returns { annotations: [...] }
  return data.annotations || data || [];
}
