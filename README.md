# Groww SIP Discovery AI Engine 🚀

An independent academic research prototype for organizing investor feedback, testing AI-assisted classifications and exploring product opportunities related to SIP continuity. Public feedback does not establish population-level churn or root causes.

Built on an **evidence-first problem space formulation** framework, the app stores public and manually supplied records, preserves provenance, excludes synthetic fixtures from empirical metrics, supports human review, and surfaces evidence-linked hypotheses. It is not affiliated with Groww and does not provide investment advice.

---

## 🎯 Primary Business Objective
> **Research target:** Percentage of eligible first-time mutual fund investors who still have at least one active SIP 12 months after starting their first SIP. Active means at least one successful instalment in the prior 30 days. This prototype does not have cohort transaction data to calculate the retention rate.

---

## ✨ Key Features

- **Evidence Ingestion & Provenance:**
  - Manually enter or import evidence records attributed to Google Play, Apple App Store, Reddit, TradingQ&A, Google Forms, YouTube, X/Twitter, interviews, and other sources. The application does not automatically collect from those platforms.
  - Computes cryptographic SHA-256 content hashes to prevent duplicates.
  - Tracks user-entered, verified, unverified, duplicate, and synthetic-fixture provenance separately. Supplied URLs are not automatically verified.

- **AI Extraction Engine (Gemini):**
  - Classifies evidence into granular **Journey Stages** (*Discovery & Intent*, *Mandate & KYC Setup*, *First Instalment Allotment*, *Market Dip Reaction*, *Autopay Failure & Recovery*, *Continuation Milestone*, *Pause & Cancellation*).
  - Extracts emotional valence, operational failure mechanisms, friction themes, and user quote verification.
  - Requires source quotes for explicit timing, checking frequency, demographic and financial segment fields. A failed instalment is not automatically classified as churn.
  - The deterministic fake provider is for simulated tests only and is excluded from empirical intelligence summaries.

- **Human-in-the-Loop (HITL) Validation & Reliability:**
  - Review interface for product managers and analysts to **Confirm**, **Correct**, or **Reject** AI classifications.
  - Calculates inter-rater agreement rates, tracks disagreement distribution, and flags drift against a golden benchmark test suite.

- **Interactive Causal Force-Directed Graph:**
  - D3-powered force graph modeling relationships between Journey Stages, Friction Themes, Root Failure Mechanisms, and the 12-Month Active SIP metric.
  - Interactive stage filters, drag-and-drop nodes, and live inspection drawer.
  - Unified discovery views show all stored records, analyses, themes, graphs and opportunities together. Provenance labels distinguish genuine, unverified, curated benchmark, synthetic, primary research and duplicate records; illustrative outputs never count as genuine findings.

- **Opportunity Scoring & Evidence Log:**
  - Seven-criterion weighted prioritization with evidence counts, source diversity, confidence limits and human score override audit history.
  - Exports Markdown, CSV and JSON evidence logs with source inventory, AI evaluation diagnostics, failures, opportunities and provenance.

- **Investor Intelligence:**
  - Summarizes coverage across nine research dimensions, explicit journey windows, checking frequencies, segments, unmet needs, behavioural chains and recorded contradictions.
  - Provides source links and marks unknowns, simulated analysis and coverage gaps.
  - Adds an independent NextLeap nine-question audit; question counts require a valid non-simulated analysis and exact supporting text from the eligible source.

- **Standalone AI Evidence Log:**
  - `/evidence-log` provides a print-ready document with source inventory, eligible labelled examples, evaluation status, genuine corrections and limitations.
  - Use the browser print dialog to save a local PDF. The app does not publish the document or create public sharing permissions.

- **Research eligibility:**
  - Public-source evidence must be content-verified before it contributes to genuine research metrics. Link checking alone does not authenticate the quoted content.
  - Researcher-supplied Google Forms and interview records retain their separate user-entered provenance. Primary-research excerpts are withheld from the shareable Evidence Log pending documented consent.

---

## 🔺 Research Triangulation (NextLeap Part 1)

The engine now runs two independent research pipelines and compares them theme by theme without pooling denominators.

| Pipeline | Input | Processing | Output |
|---|---|---|---|
| **A: Primary research** | Google Forms export (`data/primary/google-forms-sip-survey.anonymized.csv`, 42 respondents, names removed) | Deterministic counts, per-question denominators, multi-select handling, segment cuts; AI coding of the open-ended answers only | `/primary-research` |
| **B: Secondary research** | Genuine public feedback (`data/secondary/*.jsonl`): TradingQ&A (Discourse API), Google Play reviews, YouTube comments | Groq-hosted LLM with schema validation, verbatim-quote grounding, prompt-injection wrapping | `/analysis`, `/themes` |

`/triangulation` compares both on a shared 12-theme codebook (`src/lib/research/codebook.ts`). It classifies each theme as convergent, divergent, one source only, not measured or insufficient, tests Life-to-SIP and MARKET PULSE against the evidence, and stores a guarded AI synthesis. `/opportunities` ranks opportunities with a published formula and traces each one back to survey answers and original public sources. `/validation` collects human accurate / partially accurate / inaccurate verdicts and stays **Pending** until a person reviews. `/evidence-log` exports the AI Evidence Log as Markdown or JSON.

### Reproduce the research
```bash
# 1. Anonymise the raw Google Forms export (drops name/email/phone columns)
npx tsx scripts/anonymize-survey.ts "path/to/export.csv"
# 2. Collect TradingQ&A posts through the public Discourse API
node scripts/collect-tradingqna.mjs 45
# 3. Run the real AI pipeline and write data/analysis/analysis-snapshot.json
npx tsx --env-file=.env.local scripts/run-research-analysis.ts
```
Commit the updated `data/` files; every deployment loads them on start. Human reviews can be exported from `/validation` and committed as `data/validation/validation-reviews.json`.

### Public access and the live AI demo
The deployed site is open to everyone with no login, passcode or API key. Every visitor can explore all records, AI results, themes, triangulation, opportunities, validation and the Evidence Log.

- **Live demo:** visitors can re-run Gemini (or Groq) on a fixed set of six genuine records and generate a fresh synthesis. Results are labelled *Live · not saved* and never change the research record.
- **Server-side limits** in shared Upstash Redis (`src/services/demo/guard.ts`): a ₹100/day Gemini spend budget (`AI_DEMO_DAILY_BUDGET_INR`, each call costed from reported tokens at Google's published prices), backstop daily call and token caps, per-visitor hourly and daily limits (hashed IP and user agent), at most 3 records per run, output-token caps, automated-client filtering, and kill switches (`AI_DEMO_ENABLED`, Redis key `demo:disabled`). Without Redis the demo stays off.
- **Read-only official record:** survey imports, validation reviews and saved AI runs are refused by the server on every Vercel deployment. They run only in the researcher's local workspace and are published by committing `data/`.

### Environment
See `.env.example`: `GEMINI_API_KEY` (preferred) and/or `GROQ_API_KEY`, `AI_DEMO_ENABLED`, the Upstash `KV_REST_API_*` variables, and optional `DATABASE_URL`.

### Design and motion
The research theme (`src/app/research.css`) follows the Impeccable “Operate” guidance. Motion uses Transitions.dev snippets pasted verbatim (`src/app/transitions*.css`, wired in `src/components/motion.tsx`): accordion, panel reveal, sliding tabs, number subtle change, text-state swap, menu dropdown, success check and error shake, each with its reduced-motion guard. The skills live in `.claude/skills/`.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (Turbopack, App Router, React 19)
- **Language:** TypeScript
- **Database:** SQLite / LibSQL with [Drizzle ORM](https://orm.drizzle.team)
- **AI / LLM:** Google Gen AI SDK (`@google/genai` / model configurable with `GEMINI_MODEL`)
- **Visualizations:** D3 Force (`d3-force`)
- **Testing:** Vitest
- **Styling:** Custom modern dark-mode fintech design system

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20.9 or later
- npm, pnpm, or yarn

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/shubhamnaik25081999-gif/groww_sip_discovery_AI_engine.git
cd groww_sip_discovery_AI_engine

# Install dependencies
npm install
```

### 3. Environment Variables
Create a `.env.local` file in the root directory:
```env
# Gemini API Key for live analysis
GEMINI_API_KEY=your_gemini_api_key_here
# Optional aliases/configuration
# GOOGLE_API_KEY=your_gemini_api_key_here
# GEMINI_MODEL=gemini-3.8-flash
# AI_PROVIDER=gemini
# DATABASE_URL=file:groww_sip_lab.db
```

Without `GEMINI_API_KEY` or `GOOGLE_API_KEY`, ingestion and stored-data views remain available, but live analysis returns a missing-key error. The local SQLite database is initialized automatically. Vercel's default `/tmp` database is ephemeral; configure a persistent LibSQL/Turso `DATABASE_URL` and `DATABASE_AUTH_TOKEN` for durable deployment data.

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Run Test Suite
```bash
npm test
```

---

## ☁️ Deploying to Vercel

1. **Import Project into Vercel**:
   - Link your GitHub repository (`groww_sip_discovery_AI_engine`).
   - Keep **Root Directory** as `./` (default).
   - Framework preset will automatically be detected as **Next.js**.

2. **Environment Variables**:
   - `GEMINI_API_KEY` or `GOOGLE_API_KEY`: Your Google Gemini API key for live analysis runs.
   - `DATABASE_URL`: *(Optional)* Your [Turso](https://turso.tech) LibSQL URL (`libsql://<your-db>.turso.io`) for persistent cloud database storage across serverless instances.
   - `DATABASE_AUTH_TOKEN`: *(Optional)* Turso authentication token.
   *(If no database URL is set, the app runs using `/tmp` serverless SQLite, which is not durable between instances.)*

3. **Deploy**:
   - Click **Deploy**. Next.js Turbopack build and TypeScript validation will compile cleanly.

---

## 📂 Project Structure

```
groww-sip-lab/
├── src/
│   ├── app/                 # Next.js App Router (Pages, Layout, Server Actions)
│   │   ├── evidence/        # Evidence table, filtering, ingestion modal
│   │   ├── intelligence/    # Nine-dimension evidence-linked summaries
│   │   ├── graph/           # D3 causal graph visualization
│   │   ├── opportunities/   # Opportunity prioritization matrix
│   │   ├── reliability/     # AI reliability metrics & evaluation
│   │   ├── themes/          # Thematic analysis breakdown
│   │   └── tracker/         # Fellowship 8-week hypothesis tracker
│   ├── components/          # Reusable UI components & modals
│   ├── db/                  # Drizzle database schema & SQLite client
│   ├── lib/                 # Types, CSV parser, cryptographic hashing
│   └── services/            # Ingestion, AI analysis, evaluations, exports
├── drizzle.config.ts        # Drizzle ORM config
├── vitest.config.ts         # Vitest test runner config
└── package.json
```

---

## 📄 License
This project is developed for the Groww Product Fellowship.
