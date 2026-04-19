CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    input_text TEXT NOT NULL,
    red_flags INTEGER NOT NULL DEFAULT 0,
    yellow_flags INTEGER NOT NULL DEFAULT 0,
    green_flags INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    full_output JSONB NOT NULL DEFAULT '{}',
    crewai_trace JSONB DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
