# ARIA — Skylark Drones Business Intelligence Agent

> **ARIA** (Advanced Revenue Intelligence Agent) — An AI-powered BI assistant that answers founder-level business queries by integrating with Monday.com boards containing real-world deals and work order data.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-skylark--bi--agent-blue?style=for-the-badge&logo=vercel)](https://skylark-bi-agent-neon.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Groq](https://img.shields.io/badge/LLM-Groq-orange?style=for-the-badge)](https://groq.com/)

---

## 🚀 Live Deployment

**🔗 [https://skylark-bi-agent-neon.vercel.app/](https://skylark-bi-agent-neon.vercel.app/)**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Executive Chat UI                  │
│          Next.js 15 App Router + React 18           │
│     (Premium dark executive theme, markdown tables)  │
└────────────────────┬────────────────────────────────┘
                     │ POST /api/chat
┌────────────────────▼────────────────────────────────┐
│              Agent Orchestration Layer               │
│      Groq LLM (Qwen / Llama, Tool Use Loop)        │
│     lib/agent.ts + lib/prompts.ts + lib/tools.ts   │
└──────────┬──────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────┐
    │       Tool Dispatcher               │
    │  1. get_board_schema                │
    │  2. query_board_data                │
    │  3. generate_leadership_summary     │
    └──────┬──────────────────────────────┘
           │
    ┌──────▼──────────────────────────────┐
    │     Data Resilience Layer           │
    │  lib/normalize.ts                   │
    │  - Date normalization (7 formats)   │
    │  - Currency (₹ lakh/crore support)  │
    │  - Sector/Stage synonym maps        │
    │  - Cross-board company matching     │
    │  - Data quality scoring             │
    └──────┬──────────────────────────────┘
           │
    ┌──────▼──────────────────────────────┐
    │   Monday.com GraphQL API v2         │
    │  lib/monday.ts                      │
    │  - Cursor-based pagination          │
    │  - Schema caching                   │
    │  - Rate limit / auth handling       │
    └─────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Frontend | Next.js 15 (App Router) | SSR + API routes in one deployment |
| Language | TypeScript | Type safety for complex data structures |
| AI Model | Groq (Qwen 3 / Llama 4) | Ultra-fast inference with tool use support |
| LLM Fallback | Multi-model (Qwen 3.8B → Qwen 3.6B → Llama 4) | Automatic rate-limit recovery |
| BI Integration | Monday.com GraphQL API v2 | Flexible custom aggregations |
| Styling | Vanilla CSS | Full design control, no framework overhead |
| Markdown | react-markdown + remark-gfm | Renders executive tables and lists |
| Fonts | Inter (Google Fonts) | Premium readability |
| Deployment | Vercel | Zero-config Next.js hosting |

---

## Project Structure

```
skylark_assignment/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts        # POST /api/chat endpoint
│   ├── globals.css             # Premium dark executive theme
│   ├── layout.tsx              # Root layout + SEO metadata
│   └── page.tsx                # Chat UI (main interface)
├── lib/
│   ├── agent.ts                # Groq tool-use orchestration loop (multi-model fallback)
│   ├── monday.ts               # GraphQL API client + cursor pagination
│   ├── normalize.ts            # Deterministic data resilience layer
│   ├── prompts.ts              # System prompt (ARIA persona)
│   └── tools.ts                # Tool definitions + dispatchers
├── types/
│   └── monday.ts               # TypeScript interfaces
├── .env.example                # Environment variable template
├── DECISION_LOG.md             # Design decisions and trade-offs
├── README.md                   # This file
├── next.config.mjs
├── package.json
└── tsconfig.json
```

---

## Agent Capabilities

### Quick Prompts (sidebar)
- ⚡ **Leadership Update** — Full cross-board executive briefing
- 📊 **Pipeline by Sector** — Active deals aggregated by industry sector
- 💰 **Won Deals Revenue** — Closed-won deal revenue breakdown
- ⏳ **Stalled Deals** — Deals stuck in a stage for too long
- ⚙️ **Work Order Status** — Live work order pipeline overview
- 🔗 **Cross-Board Match** — Match companies across Deals & Work Orders
- 🏆 **Top Sectors** — Best performing sectors by revenue
- 📋 **Data Quality Audit** — Detect missing/inconsistent data

### Tool-Use Flow
1. **get_board_schema** → Dynamically discover column names and types
2. **query_board_data** → Filter, aggregate, and score data quality
3. **generate_leadership_summary** → Full cross-board executive analysis

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ Yes | Groq API key for LLM inference |
| `MONDAY_API_TOKEN` | ✅ Yes | Monday.com personal API token |
| `MONDAY_DEALS_BOARD_ID` | ✅ Yes | Numeric ID of the Deals board |
| `MONDAY_WORK_ORDERS_BOARD_ID` | ✅ Yes | Numeric ID of the Work Orders board |

---

## Setup Instructions

### Requirements
- Node.js 18+
- Monday.com Account + API Token
- Groq API Key (free at [console.groq.com](https://console.groq.com))

### 1. Configure Environment
```bash
cp .env.example .env.local
```

Fill in `.env.local`:
```env
GROQ_API_KEY=your_groq_api_key_here
MONDAY_API_TOKEN=your_monday_api_token_here
MONDAY_DEALS_BOARD_ID=5030968037
MONDAY_WORK_ORDERS_BOARD_ID=5030968148
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
# http://localhost:3000
```

### 4. Production Build
```bash
npm run build
npm start
```

---

## Deployment (Vercel)

This project is live at **[https://skylark-bi-agent-neon.vercel.app/](https://skylark-bi-agent-neon.vercel.app/)**.

To deploy your own instance:

1. Push your code to GitHub.
2. Go to [vercel.com](https://vercel.com/) → **Add New Project** → Import your GitHub repo.
3. Add the 4 environment variables in **Settings → Environment Variables**.
4. Click **Deploy**.

---

## Monday.com Board Setup

### Step 1: Import CSV Data
1. Download the two data files:
   - `Deal funnel Data.xlsx` → import as **Deals** board
   - `Work_Order_Tracker Data.xlsx` → import as **Work Orders** board
2. In Monday.com: **+ Add** → **Import data** → **Excel/CSV**

### Step 2: Get Board IDs
Open your board in Monday.com and look at the URL:
```
https://yourcompany.monday.com/boards/1234567890
```
The number at the end is your **Board ID**.

### Step 3: Get API Token
Click your avatar (bottom left) → **Admin** → **API** → Copy your **Personal API Token**.

---

## Data Normalization

The agent handles real-world messy data with deterministic (no LLM hallucination) parsing:

### Dates
| Input Format | Example | Output |
|-------------|---------|--------|
| ISO 8601 | `2024-03-15` | `2024-03-15` |
| DD/MM/YYYY | `15/03/2024` | `2024-03-15` |
| DD-Mon-YYYY | `15-Mar-2024` | `2024-03-15` |
| Month DD, YYYY | `March 15, 2024` | `2024-03-15` |
| Excel Serial | `45366` | `2024-03-31` |

### Currency
| Input | Output |
|-------|--------|
| `₹1,50,000` | `150000` |
| `$50K` | `50000` |
| `2.5 lakhs` | `250000` |
| `1 crore` | `10000000` |

### Sector Synonyms
| Raw Input | Normalized |
|-----------|-----------|
| Solar & Wind | energy |
| Renewable | energy |
| Mfg | manufacturing |
| PSU | government |
| Infra | infrastructure |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `GROQ_API_KEY not configured` | Add `GROQ_API_KEY` to `.env.local` |
| `Board not found` | Verify board IDs match the URL of your Monday.com boards |
| `Authentication failed` | Check that `MONDAY_API_TOKEN` is valid and not expired |
| `Rate limit hit (429)` | The agent auto-retries with a fallback model — wait a moment |
| Empty data returned | Ensure CSVs were imported correctly with at least 1 row |

---

## License

MIT — Built for Skylark Drones as a BI intelligence layer on Monday.com.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Executive Chat UI                  │
│          Next.js 14 App Router + React 18           │
│     (Premium dark executive theme, markdown tables)  │
└────────────────────┬────────────────────────────────┘
                     │ POST /api/chat
┌────────────────────▼────────────────────────────────┐
│              Agent Orchestration Layer               │
│         Claude 3.5 Sonnet (Tool Use Loop)           │
│     lib/agent.ts + lib/prompts.ts + lib/tools.ts   │
└──────────┬──────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────┐
    │       Tool Dispatcher               │
    │  1. get_board_schema               │
    │  2. query_board_data               │
    │  3. generate_leadership_summary     │
    └──────┬──────────────────────────────┘
           │
    ┌──────▼──────────────────────────────┐
    │     Data Resilience Layer           │
    │  lib/normalize.ts                   │
    │  - Date normalization (7 formats)   │
    │  - Currency (₹ lakh/crore support)  │
    │  - Sector/Stage synonym maps        │
    │  - Cross-board company matching     │
    │  - Data quality scoring             │
    └──────┬──────────────────────────────┘
           │
    ┌──────▼──────────────────────────────┐
    │   Monday.com GraphQL API v2         │
    │  lib/monday.ts                      │
    │  - Cursor pagination                │
    │  - Schema caching                   │
    │  - Rate limit / auth handling       │
    └─────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Frontend | Next.js 14 (App Router) | SSR + API routes in one deployment |
| Language | TypeScript | Type safety for complex data structures |
| AI Model | Claude 3.5 Sonnet | Best-in-class tool use + reasoning |
| BI Integration | Monday.com GraphQL API v2 | More flexible than MCP for custom aggregations |
| Styling | Vanilla CSS | Full design control, no framework overhead |
| Markdown | react-markdown + remark-gfm | Renders executive tables and lists |
| Fonts | Inter (Google Fonts) | Premium readability |

---

## Project Structure

```
skylark_assignment/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts        # POST /api/chat endpoint
│   ├── globals.css             # Premium dark executive theme
│   ├── layout.tsx              # Root layout + SEO metadata
│   └── page.tsx                # Chat UI (main interface)
├── lib/
│   ├── agent.ts                # Claude tool-use orchestration loop
│   ├── monday.ts               # GraphQL API client + pagination
│   ├── normalize.ts            # Deterministic data resilience layer
│   ├── prompts.ts              # System prompt (ARIA persona)
│   └── tools.ts                # Tool definitions + dispatchers
├── types/
│   └── monday.ts               # TypeScript interfaces
├── .env.example                # Environment variable template
├── DECISION_LOG.md             # Design decisions and trade-offs
├── README.md                   # This file
├── next.config.mjs
├── package.json
└── tsconfig.json
```

---

## Monday.com Setup Guide

### Step 1: Import CSV Data

1. Download the two Excel files provided:
   - `Deal funnel Data.xlsx` → import as **Deals** board
   - `Work_Order_Tracker Data.xlsx` → import as **Work Orders** board

2. In Monday.com:
   - Click **+ Add** → **Import data** → **Excel/CSV**
   - Map columns to appropriate types:

**Deals board column types:**
| Column | Recommended Type |
|--------|-----------------|
| Company / Client | Text |
| Deal Stage / Status | Status |
| Deal Value / Amount | Numbers |
| Sector / Industry | Dropdown |
| Close Date | Date |
| Owner / Rep | Person |
| Probability | Numbers (%) |

**Work Orders board column types:**
| Column | Recommended Type |
|--------|-----------------|
| Client / Company | Text |
| Status | Status |
| Contract Value | Numbers |
| Sector | Dropdown |
| Start Date | Date |
| Delivery / End Date | Date |
| Assigned To | Person |

### Step 2: Get Board IDs

1. Open your board in Monday.com.
2. Look at the URL: `https://yourcompany.monday.com/boards/1234567890`
3. The number at the end is your Board ID.

### Step 3: Get API Token

1. Click your avatar (bottom left) → **Admin** → **API**
2. Copy your **Personal API Token** (read-only scope is sufficient)

---

## Setup Instructions

### Requirements
- Node.js 18+ (tested on Next.js 14 / App Router)
- Monday.com Account + API Token
- Groq API Key (for LLM inference)

### 1. Configure Environment
1. Copy the example env file:
   ```bash
   cp .env.example .env.local
   ```
2. Fill in the keys in `.env.local`:
   - `GROQ_API_KEY`: Get from [console.groq.com](https://console.groq.com)
   - `MONDAY_API_TOKEN`: Monday.com -> Profile (bottom left) -> Admin -> API
   - `MONDAY_WORK_ORDERS_BOARD_ID`: 1234567890
   - `MONDAY_DEALS_BOARD_ID`: 0987654321

### 2. Install dependencies
```bash
npm install
```

### 3. Start development server
```bash
npm run dev
# http://localhost:3000
```

### Production Build

```bash
npm run build
npm start
```

### Deployment (Vercel — Recommended)

```bash
npm install -g vercel
vercel

# Set environment variables in Vercel dashboard:
# Settings → Environment Variables → Add all 4 variables
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ Yes | Anthropic Claude API key |
| `MONDAY_API_TOKEN` | ✅ Yes | Monday.com personal API token |
| `MONDAY_DEALS_BOARD_ID` | ✅ Yes | Numeric ID of the Deals board |
| `MONDAY_WORK_ORDERS_BOARD_ID` | ✅ Yes | Numeric ID of the Work Orders board |

---

## Data Normalization Rules

The agent handles real-world messy data with deterministic (no LLM hallucination) parsing:

### Dates
| Input Format | Example | Output |
|-------------|---------|--------|
| ISO 8601 | `2024-03-15` | `2024-03-15` |
| DD/MM/YYYY | `15/03/2024` | `2024-03-15` |
| DD-Mon-YYYY | `15-Mar-2024` | `2024-03-15` |
| Month DD, YYYY | `March 15, 2024` | `2024-03-15` |
| Excel Serial | `45366` | `2024-03-31` |
| 2-digit year | `15/03/24` | `2024-03-15` |

### Currency
| Input | Output |
|-------|--------|
| `₹1,50,000` | `150000` |
| `$50K` | `50000` |
| `2.5 lakhs` | `250000` |
| `1 crore` | `10000000` |
| `(5000)` | `-5000` (negative) |

### Sectors (synonym normalization)
| Raw Input | Normalized |
|-----------|-----------|
| Solar & Wind | energy |
| Renewable | energy |
| Mfg | manufacturing |
| PSU | government |
| Infra | infrastructure |

---

## Agent Capabilities

### Quick Prompts (sidebar)
- ⚡ Leadership Update (full cross-board executive briefing)
- 📊 Pipeline by Sector
- 💰 Won Deals Revenue
- ⏳ Stalled Deals Detection
- ⚙️ Work Order Status Overview
- 🔗 Cross-Board Matching Analysis
- 🏆 Top Performing Sectors
- 📋 Data Quality Audit

### Tool-Use Flow
1. **get_board_schema** → Discover column names dynamically
2. **query_board_data** → Filter + aggregate with data quality metrics
3. **generate_leadership_summary** → Full cross-board analysis

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "ANTHROPIC_API_KEY not configured" | Add `ANTHROPIC_API_KEY` to `.env.local` |
| "Board not found" | Verify board IDs match the URL of your Monday.com boards |
| "Authentication failed" | Check that your `MONDAY_API_TOKEN` is valid and not expired |
| "Rate limit hit" | Wait 60 seconds; Monday.com GraphQL has per-minute rate limits |
| Empty data returned | Ensure CSVs were imported correctly with at least 1 row |
