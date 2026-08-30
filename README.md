# ARIA — Skylark Drones Business Intelligence Agent

> **ARIA** (Advanced Revenue Intelligence Agent) is an AI-powered Business Intelligence assistant built for Skylark Drones. It connects live to your Monday.com boards and answers founder-level business queries in natural language — no dashboards, no manual reports.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20App-blue?style=for-the-badge&logo=vercel)](https://skylark-bi-agent-neon.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Groq](https://img.shields.io/badge/LLM-Groq-orange?style=for-the-badge)](https://groq.com/)

---

## Live App

**https://skylark-bi-agent-neon.vercel.app/**

---

## What Does ARIA Do?

ARIA sits on top of your Monday.com deal pipeline and work order tracker. You can ask it questions in plain English and it returns structured, executive-grade reports.

**Example queries you can ask:**
- *"Give me a leadership update"*
- *"What is our pipeline by sector?"*
- *"Show me stalled deals"*
- *"How much revenue have we won this quarter?"*
- *"Match deals to work orders and show cross-board status"*
- *"Run a data quality audit"*

ARIA fetches live data from Monday.com, normalises it, runs aggregations, and returns a formatted markdown report — all in seconds.

---

## How It Works

```
User Query (Chat UI)
        |
        v
   /api/chat  (Next.js API Route)
        |
        v
  Agent Loop  (lib/agent.ts)
  - Sends query + tools to Groq LLM
  - LLM decides which tool(s) to call
        |
        v
  Tool Dispatcher  (lib/tools.ts)
  |
  |-- get_board_schema    -> Fetches column names from Monday.com board
  |-- query_board_data    -> Filters & aggregates rows from board
  |-- generate_leadership_summary -> Full cross-board executive report
        |
        v
  Monday.com GraphQL API  (lib/monday.ts)
  - Cursor-based pagination (fetches all rows)
  - Schema caching
        |
        v
  Data Normalization  (lib/normalize.ts)
  - Cleans messy date formats, currency, sector names
  - Handles duplicate columns, null values
        |
        v
  Final Markdown Report -> Streamed back to Chat UI
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 15 App Router + React 18 | UI + API routes in one deployment |
| Language | TypeScript | Type-safe data handling |
| AI / LLM | Groq — Qwen 3 / Llama 4 | Ultra-fast inference + tool use |
| LLM Fallback | Multi-model (Qwen 3.8B ? Qwen 3.6B ? Llama 4) | Auto-recovery on rate limits |
| Data Source | Monday.com GraphQL API v2 | Live deal + work order data |
| Styling | Vanilla CSS | Premium dark executive theme |
| Markdown | react-markdown + remark-gfm | Renders tables and formatted reports |
| Fonts | Inter (Google Fonts) | Clean readability |
| Hosting | Vercel | Zero-config Next.js deployment |

---

## Project Structure

```
skylark_assignment/
|
+-- app/
¦   +-- api/
¦   ¦   +-- chat/
¦   ¦       +-- route.ts        # Main API endpoint — receives user message,
¦   ¦                           # runs agent loop, returns response
¦   +-- globals.css             # Dark executive theme, animations, layout
¦   +-- layout.tsx              # Root HTML layout + metadata
¦   +-- page.tsx                # Chat UI — sidebar, message list, input box
¦
+-- lib/
¦   +-- agent.ts                # Core agent loop — sends messages to Groq,
¦   ¦                           # handles tool calls, multi-model fallback
¦   +-- monday.ts               # Monday.com GraphQL client —
¦   ¦                           # cursor pagination, schema fetch, auth
¦   +-- normalize.ts            # Data cleaning layer —
¦   ¦                           # dates, currency, sector synonyms,
¦   ¦                           # duplicate column handling
¦   +-- prompts.ts              # ARIA system prompt and persona
¦   +-- tools.ts                # Tool definitions + execution logic
¦                               # (schema, query, leadership summary)
¦
+-- types/
¦   +-- monday.ts               # TypeScript interfaces for board data
¦
+-- .env.example                # Template for required environment variables
+-- .env.local                  # Your local secrets (not committed to git)
+-- next.config.mjs             # Next.js config
+-- package.json
+-- tsconfig.json
+-- README.md
```

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js 18+**
- **Monday.com** account with a Deals board and a Work Orders board
- **Groq API Key** — free at [console.groq.com](https://console.groq.com)

### Step 1 — Clone the repo
```bash
git clone https://github.com/rithivik-1512/skylark-bi-agent.git
cd skylark-bi-agent
```

### Step 2 — Install dependencies
```bash
npm install
```

### Step 3 — Set up environment variables
```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your values:
```env
GROQ_API_KEY=your_groq_api_key_here
MONDAY_API_TOKEN=your_monday_api_token_here
MONDAY_DEALS_BOARD_ID=your_deals_board_id
MONDAY_WORK_ORDERS_BOARD_ID=your_work_orders_board_id
```

**How to get these values:**

| Variable | Where to find it |
|----------|-----------------|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) ? API Keys |
| `MONDAY_API_TOKEN` | Monday.com ? Avatar (bottom left) ? Admin ? API |
| `MONDAY_DEALS_BOARD_ID` | Open your Deals board ? check the URL: `.../boards/1234567890` |
| `MONDAY_WORK_ORDERS_BOARD_ID` | Open your Work Orders board ? check the URL |

### Step 4 — Run the dev server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## How to Use the App

Once open, you will see:

- **Left Sidebar** — 8 pre-built quick insight buttons. Click any to instantly run that query.
- **Chat Area** — Type any business question in plain English and press Enter.
- **Clear Button** — Resets the conversation.

### Quick Insight Buttons

| Button | What it does |
|--------|-------------|
| Leadership Update | Full cross-board executive briefing — pipeline health, revenue, work orders |
| Pipeline by Sector | Active deals grouped and summed by industry sector |
| Won Deals Revenue | Total revenue from closed-won deals |
| Stalled Deals | Deals that have been stuck in the same stage too long |
| Work Order Status | Live overview of all work orders by status |
| Cross-Board Match | Links deal companies to their matching work orders |
| Top Sectors | Ranks sectors by total deal value |
| Data Quality Audit | Flags records with missing or inconsistent data |

### Example Questions to Ask
```
What is the total pipeline value?
Which sector has the most deals?
Show me all deals in proposal stage
How many work orders are completed?
Give me a full leadership summary
Which deals have been stalled the longest?
```

---

## Deployment on Vercel

This project is live at: **https://skylark-bi-agent-neon.vercel.app/**

To deploy your own instance:

1. Fork or clone this repo and push to your GitHub
2. Go to [vercel.com](https://vercel.com/) and click **Add New Project**
3. Import your GitHub repository
4. Under **Environment Variables**, add all 4 variables from the table above
5. Click **Deploy**

Vercel will automatically rebuild and redeploy whenever you push to `main`.

---

## Data Handling Notes

- **No data is stored** — all queries fetch live from Monday.com at request time
- The normalization layer handles messy real-world data automatically:
  - Multiple date formats (DD/MM/YYYY, ISO, Excel serial numbers, etc.)
  - Indian currency formats (? lakhs, crores)
  - Sector name variations (e.g. "Solar & Wind" ? energy, "Mfg" ? manufacturing)
  - Duplicate column titles in Monday.com boards

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank response or spinner stuck | Check that all 4 env variables are set correctly |
| `GROQ_API_KEY not configured` | Add `GROQ_API_KEY` to `.env.local` |
| `Board not found` | Verify board IDs from your Monday.com board URLs |
| `Authentication failed` | Check that your `MONDAY_API_TOKEN` is valid and active |
| `Rate limit hit (429)` | ARIA auto-retries with a fallback model — wait a moment and try again |
| Empty results | Make sure your Monday.com boards have data rows imported |

---

## License

MIT — Built for Skylark Drones as a live BI intelligence layer on Monday.com.
