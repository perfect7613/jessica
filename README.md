# Jessica — AI Legal Team

Multi-agent NDA risk analyzer grounded in Indian law. Four specialized AI agents (General Counsel, Corporate, IP, Compliance) review non-disclosure agreements clause-by-clause, flag risks with color-coded severity, and cite Indian statutes and case law for every finding.

Built for the OpenCode Buildathon (MaaS track).

---

## Architecture (Mermaid)

```mermaid
graph TB
    subgraph Frontend["Frontend (Next.js + Tailwind + shadcn)"]
        Upload["Upload Page<br/>drag & drop .md/.pdf"]
        Analysis["Analysis Page<br/>color-coded NDA + summary<br/>+ trace viewer + annotation"]
        History["Run History<br/>clickable cards"]
        Compare["Compare Page<br/>side-by-side runs"]
        PDF["Redlined PDF<br/>Download (jsPDF)"]
    end

    Upload -->|POST /api/analyze| API
    Analysis -->|GET /api/runs/id| API
    Analysis -->|GET /api/runs/id/trace| API
    Analysis -->|POST /api/runs/id/annotate| API
    History -->|GET /api/runs| API
    Compare -->|GET /api/runs/id| API
    Analysis --> PDF

    subgraph Backend["Backend (FastAPI + Python 3.12)"]
        API["FastAPI Router<br/>/analyze /runs /stats /trace /annotate"]
        Docling["Docling<br/>PDF → Markdown"]
        API --> Docling
        Docling --> Crew

        subgraph Crew["CrewAI Crew (Process.hierarchical)"]
            GC["General Counsel<br/>(Manager + Synthesizer)<br/>Indian Contract Act<br/>Cross-domain risk"]

            GC -->|delegates| Corp["Corporate Specialist<br/>Companies Act 2013<br/>LLP Act 2008<br/>SEBI Takeover Regs"]
            GC -->|delegates| IP["IP Specialist<br/>Copyright Act 1957<br/>Patents Act 1970<br/>Trade Secrets"]
            GC -->|delegates| Comp["Compliance Specialist<br/>IT Act 2000 / DPDP Act<br/>FEMA 1999<br/>Jurisdiction"]

            Corp -->|parallel analysis| GC
            IP -->|parallel analysis| GC
            Comp -->|parallel analysis| GC
        end

        GC -->|"NDAAnalysisOutput<br/>(Pydantic JSON)"| API

        subgraph Tools["Agent Tools"]
            FC_Search["FirecrawlSearchTool<br/>web search for citations"]
            FC_Scrape["FirecrawlScrapeTool<br/>scrape legal pages"]
        end

        Corp -.-> FC_Search
        IP -.-> FC_Search
        Comp -.-> FC_Search
        GC -.-> FC_Search
        Corp -.-> FC_Scrape
        IP -.-> FC_Scrape

        Trace["JessicaTraceListener<br/>(BaseEventListener)<br/>captures all CrewAI events"]
        Crew -.->|events| Trace
    end

    subgraph DB["Supabase (PostgreSQL)"]
        Runs[("runs<br/>id, input_text, red/yellow/green_flags<br/>summary, full_output (JSONB)<br/>crewai_trace (JSONB)")]
        Annotations[("annotations<br/>id, run_id (FK), rating 1-5, note")]
    end

    API -->|store run + trace| Runs
    API -->|store feedback| Annotations
    Trace -->|serialize JSON| Runs

    subgraph Knowledge["Agent Knowledge Base"]
        IIMA["IIMA Working Paper 2025-12-01<br/>M P Ram Mohan et al.<br/>NDAs & Confidentiality under Indian Law"]
    end

    IIMA -.->|embedded in system prompts| GC
    IIMA -.->|embedded in system prompts| Corp
    IIMA -.->|embedded in system prompts| IP
    IIMA -.->|embedded in system prompts| Comp

    style Frontend fill:#1a1a1e,stroke:#d9ac5f,color:#f5f1e8
    style Backend fill:#16161a,stroke:#d9ac5f,color:#f5f1e8
    style Crew fill:#1e1e24,stroke:#78b478,color:#f5f1e8
    style DB fill:#16161a,stroke:#7ca5d9,color:#f5f1e8
    style Tools fill:#1e1e24,stroke:#dc4646,color:#f5f1e8
    style Knowledge fill:#1e1e24,stroke:#d9ac5f,color:#f5f1e8
    style GC fill:#2a2520,stroke:#d9ac5f,color:#f5f1e8
    style Corp fill:#1e2520,stroke:#78b478,color:#f5f1e8
    style IP fill:#1e2520,stroke:#78b478,color:#f5f1e8
    style Comp fill:#1e2520,stroke:#78b478,color:#f5f1e8
```

```mermaid
sequenceDiagram
    participant U as User / Judge
    participant FE as Frontend (Next.js)
    participant BE as Backend (FastAPI)
    participant D as Docling
    participant GC as General Counsel
    participant CS as Corporate Specialist
    participant IPS as IP Specialist
    participant CMS as Compliance Specialist
    participant FC as Firecrawl
    participant SB as Supabase

    U->>FE: Upload NDA (.md / .pdf)
    FE->>BE: POST /api/analyze (file)
    
    alt PDF uploaded
        BE->>D: Convert PDF → Markdown
        D-->>BE: Markdown text
    end

    BE->>GC: Start hierarchical crew
    
    par Parallel specialist analysis
        GC->>CS: Delegate corporate analysis
        CS->>FC: Search Indian law citations
        FC-->>CS: Legal references
        CS-->>GC: Corporate risk flags
    and
        GC->>IPS: Delegate IP analysis
        IPS->>FC: Search case law
        FC-->>IPS: Case references
        IPS-->>GC: IP risk flags
    and
        GC->>CMS: Delegate compliance analysis
        CMS-->>GC: Compliance risk flags
    end

    GC->>GC: Synthesize all findings
    GC-->>BE: NDAAnalysisOutput (Pydantic JSON)
    
    BE->>SB: Store run + trace
    BE-->>FE: { run_id, analysis, trace }
    FE-->>U: Color-coded analysis + summary + trace

    opt User provides feedback
        U->>FE: Rate 1-5 stars + note
        FE->>BE: POST /api/runs/{id}/annotate
        BE->>SB: Store annotation
    end

    opt Download PDF
        U->>FE: Click "Download Redlined PDF"
        FE->>FE: Generate PDF (jsPDF)
        FE-->>U: jessica-nda-redlined-analysis.pdf
    end
```

## Architecture (ASCII)

```
                                 Jessica — System Architecture
                                 =============================

    ┌─────────────────────────────────────────────────────────────────────┐
    │                        FRONTEND (Next.js)                          │
    │                                                                     │
    │   ┌──────────┐  ┌───────────────┐  ┌─────────┐  ┌───────────┐     │
    │   │  Upload   │  │   Analysis    │  │ History │  │  Compare  │     │
    │   │  Page     │  │   Page        │  │  Page   │  │   Page    │     │
    │   └────┬─────┘  └───────┬───────┘  └────┬────┘  └─────┬─────┘     │
    │        │                │               │              │           │
    │        └────────────────┴───────────────┴──────────────┘           │
    │                         │                                          │
    │              ┌──────────┴──────────┐                               │
    │              │   API Client        │                               │
    │              │   (src/lib/api.ts)  │                               │
    │              └──────────┬──────────┘                               │
    └─────────────────────────┼───────────────────────────────────────────┘
                              │ HTTP (REST)
                              ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                     BACKEND (FastAPI)                               │
    │                                                                     │
    │   Endpoints:                                                        │
    │   POST /api/analyze          Upload NDA → run crew → return JSON   │
    │   GET  /api/runs             List all past runs                    │
    │   GET  /api/runs/{id}        Full run details                      │
    │   GET  /api/runs/{id}/trace  CrewAI execution trace                │
    │   POST /api/runs/{id}/annotate   Human rating + note               │
    │   GET  /api/runs/{id}/annotations                                  │
    │                                                                     │
    │   ┌─────────────────────────────────────────────────────────┐      │
    │   │                   CrewAI Crew                            │      │
    │   │              (Process.hierarchical)                      │      │
    │   │                                                         │      │
    │   │   ┌─────────────────────────────────────────────┐       │      │
    │   │   │         General Counsel (Manager)            │       │      │
    │   │   │                                             │       │      │
    │   │   │   Synthesizes all specialist findings into   │       │      │
    │   │   │   final NDAAnalysisOutput (Pydantic JSON)    │       │      │
    │   │   └──────────────────┬──────────────────────────┘       │      │
    │   │                      │ delegates + synthesizes           │      │
    │   │          ┌───────────┼───────────┐                      │      │
    │   │          ▼           ▼           ▼                      │      │
    │   │   ┌───────────┐ ┌─────────┐ ┌────────────┐            │      │
    │   │   │ Corporate │ │   IP    │ │ Compliance │            │      │
    │   │   │Specialist │ │Specialist│ │ Specialist │            │      │
    │   │   │           │ │         │ │            │            │      │
    │   │   │ Companies │ │Copyright│ │ IT Act     │            │      │
    │   │   │ Act 2013  │ │Act 1957 │ │ DPDP Act  │            │      │
    │   │   │ LLP Act   │ │Patents  │ │ SEBI Regs │            │      │
    │   │   │ 2008      │ │Act 1970 │ │ FEMA 1999 │            │      │
    │   │   └─────┬─────┘ └────┬────┘ └─────┬──────┘            │      │
    │   │         │            │             │                    │      │
    │   │         └────────────┴─────────────┘                    │      │
    │   │                      │                                  │      │
    │   │              ┌───────┴────────┐                         │      │
    │   │              │  Firecrawl     │                         │      │
    │   │              │  Search Tool   │                         │      │
    │   │              │  + Scrape Tool │                         │      │
    │   │              └───────┬────────┘                         │      │
    │   │                      │ web search for legal refs        │      │
    │   │                      ▼                                  │      │
    │   │              ┌───────────────┐                          │      │
    │   │              │   Internet    │                          │      │
    │   │              │  (case law,   │                          │      │
    │   │              │   statutes)   │                          │      │
    │   │              └───────────────┘                          │      │
    │   └─────────────────────────────────────────────────────────┘      │
    │                                                                     │
    │   ┌──────────────────────┐    ┌─────────────────────────┐          │
    │   │  Trace Listener      │    │  Docling (PDF → MD)     │          │
    │   │  (BaseEventListener) │    │  (server-side convert)  │          │
    │   │  Captures all agent  │    │                         │          │
    │   │  execution events    │    │  Runs before agents     │          │
    │   └──────────┬───────────┘    └─────────────────────────┘          │
    │              │                                                      │
    └──────────────┼──────────────────────────────────────────────────────┘
                   │ stores runs + traces + annotations
                   ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                        SUPABASE                                     │
    │                                                                     │
    │   ┌────────────────────────────┐  ┌──────────────────────────┐     │
    │   │        runs                │  │     annotations          │     │
    │   │                            │  │                          │     │
    │   │  id            UUID PK     │  │  id          UUID PK     │     │
    │   │  created_at    TIMESTAMPTZ │  │  run_id      UUID FK     │     │
    │   │  input_text    TEXT        │  │  rating      INT (1-5)   │     │
    │   │  red_flags     INT         │  │  note        TEXT        │     │
    │   │  yellow_flags  INT         │  │  created_at  TIMESTAMPTZ │     │
    │   │  green_flags   INT         │  └──────────────────────────┘     │
    │   │  summary       TEXT        │                                    │
    │   │  full_output   JSONB       │                                    │
    │   │  crewai_trace  JSONB       │                                    │
    │   └────────────────────────────┘                                    │
    └─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. Judge uploads NDA (.md file)
           │
           ▼
2. FastAPI receives file
           │
           ▼
3. CrewAI Crew kicks off (hierarchical process)
           │
           ├──► Corporate Specialist ──► analyzes entity/signatory/governance clauses
           ├──► IP Specialist ──────────► analyzes confidentiality/IP/trade secret clauses
           └──► Compliance Specialist ──► analyzes jurisdiction/data privacy/regulatory clauses
                     │
                     │ (agents use Firecrawl to search web for citations when needed)
                     │
                     ▼
4. General Counsel synthesizes all findings
           │
           ▼
5. Structured output (Pydantic JSON):
   ┌────────────────────────────────────────────┐
   │  NDAAnalysisOutput                         │
   │  ├── clauses: [FlaggedClause, ...]         │
   │  │   ├── original_text                     │
   │  │   ├── risk_level (red|yellow|green)     │
   │  │   ├── clause_type                       │
   │  │   ├── explanation                       │
   │  │   ├── citation (Indian law)             │
   │  │   └── reference_section                 │
   │  ├── summary (GC's synthesis)              │
   │  ├── red_flags (count)                     │
   │  ├── yellow_flags (count)                  │
   │  └── green_flags (count)                   │
   └────────────────────────────────────────────┘
           │
           ▼
6. Stored in Supabase (run + trace)
           │
           ▼
7. Frontend renders:
   • Color-coded annotated NDA (inline red/yellow/green highlights)
   • Summary panel with flag count badges
   • Agent reasoning trace (expandable timeline)
   • Annotation form (1-5 stars + note)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Motion |
| Backend | Python 3.12, FastAPI, CrewAI |
| LLM | OpenAI GPT-5.4 Mini |
| Web Search | Firecrawl (search + scrape) |
| PDF Parsing | Docling (server-side) |
| Database | Supabase (PostgreSQL) |
| Observability | CrewAI BaseEventListener → Supabase → Frontend |

## Agent Knowledge Base

Each agent's system prompt is grounded in the **IIMA Working Paper No. 2025-12-01** (M P Ram Mohan et al.) — a practice note on NDAs and confidentiality clauses under Indian law.

| Agent | Domain Knowledge |
|---|---|
| General Counsel | Indian Contract Act 1872 (Sections 10, 23, 27, 73-74), remedies (injunctions, Anton Piller orders), M&A/SEBI context, cross-domain risk synthesis |
| Corporate Specialist | Companies Act 2013 (Sections 179, 46, 180), LLP Act 2008, signatory authority, permitted disclosures, return/destruction clauses, M&A/SEBI Takeover compliance |
| IP Specialist | Copyright Act 1957, Patents Act 1970, Trade Marks Act 1999, IT Act s.72A, common law duty of fidelity (Talbot v General Television), trade secret perpetuity, Anton Piller orders |
| Compliance Specialist | IT Act 2000 s.43A, SPDI Rules 2011, DPDP Act 2023, FEMA 1999, SEBI Insider Trading Regs, whistleblowing/public interest carve-outs, export controls |

## Guardrails

- **Citation anchoring:** Every risk flag must cite Indian law (statute, section, or case law). No citation = "Unable to assess."
- **Confidence threshold:** Low-confidence assessments return "Insufficient information" instead of guessing.
- **Flag count verification:** Backend recomputes red/yellow/green counts from the actual clause list — does not trust LLM arithmetic.

## Quick Start

```bash
# 1. Backend
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your keys
uvicorn app.main:app --port 8000

# 2. Frontend
cd frontend
npm install
cp .env.local.example .env.local
npm run dev

# 3. Open http://localhost:3000
```

### Environment Variables

**Backend (`.env`):**
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...
FIRECRAWL_API_KEY=fc-...
```

**Frontend (`.env.local`):**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Supabase Setup

Run this SQL in your Supabase SQL Editor:

```sql
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

ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_runs" ON runs
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_annotations" ON annotations
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
```

## Tests

```bash
cd backend
source .venv/bin/activate
pytest tests/ -v   # 40 tests
```

## Project Structure

```
jessica/
├── backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── crew.py              # 4-agent hierarchical crew
│   │   │   ├── general_counsel.py   # GC agent + IIMA knowledge
│   │   │   ├── specialists.py       # Corporate, IP, Compliance agents
│   │   │   └── trace_listener.py    # BaseEventListener for observability
│   │   ├── routers/
│   │   │   ├── analysis.py          # /analyze, /runs, /annotate endpoints
│   │   │   └── traces.py            # /trace endpoint
│   │   ├── tools/
│   │   │   └── firecrawl_tools.py   # FirecrawlSearchTool, FirecrawlScrapeTool
│   │   ├── config.py                # Env var loading
│   │   ├── database.py              # Supabase client
│   │   ├── main.py                  # FastAPI app
│   │   └── models.py                # Pydantic models
│   ├── tests/                       # 40 unit tests
│   ├── migrations/                  # Supabase SQL
│   ├── sample_nda.md                # Test NDA with deliberate red flags
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             # Upload page
│   │   │   ├── history/page.tsx     # Run history
│   │   │   └── analysis/[id]/page.tsx  # Analysis results
│   │   ├── components/
│   │   │   ├── annotated-nda.tsx    # Color-coded NDA viewer
│   │   │   ├── trace-viewer.tsx     # Agent reasoning timeline
│   │   │   └── star-rating.tsx      # Rating input
│   │   └── lib/
│   │       └── api.ts               # Backend API client
│   └── package.json
└── README.md
```
