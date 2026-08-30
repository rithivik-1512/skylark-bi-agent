# ARIA — Skylark Drones Business Intelligence Agent

> **ARIA** (Advanced Revenue Intelligence Agent) — An AI-powered BI assistant that answers founder-level business queries by integrating with Monday.com boards containing real-world work orders and deals data.

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
