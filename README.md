# ARIA — Skylark Drones Business Intelligence Agent

> **ARIA** (Advanced Revenue Intelligence Agent) — An AI-powered BI assistant that answers founder-level business queries by integrating with Monday.com boards containing real-world deals and work order data.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-skylark--bi--agent-blue?style=for-the-badge&logo=vercel)](https://skylark-bi-agent-neon.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Groq](https://img.shields.io/badge/LLM-Groq-orange?style=for-the-badge)](https://groq.com/)

---

## Live Demo

**[https://skylark-bi-agent-neon.vercel.app/](https://skylark-bi-agent-neon.vercel.app/)**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router) + TypeScript |
| AI / LLM | Groq (Qwen 3 / Llama 4) with multi-model fallback |
| Data Source | Monday.com GraphQL API v2 |
| Styling | Vanilla CSS |
| Deployment | Vercel |

---

## Features

- Leadership Update — Full cross-board executive briefing
- Pipeline by Sector — Active deals aggregated by industry sector
- Won Deals Revenue — Closed-won deal revenue breakdown
- Stalled Deals — Deals stuck in a stage for too long
- Work Order Status — Live work order pipeline overview
- Cross-Board Match — Match companies across Deals and Work Orders
- Top Sectors — Best performing sectors by revenue
- Data Quality Audit — Detect missing/inconsistent data

---

## Local Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
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

### 3. Run dev server
```bash
npm run dev
# http://localhost:3000
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API key — get from [console.groq.com](https://console.groq.com) |
| `MONDAY_API_TOKEN` | Monday.com personal API token |
| `MONDAY_DEALS_BOARD_ID` | Numeric ID of the Deals board |
| `MONDAY_WORK_ORDERS_BOARD_ID` | Numeric ID of the Work Orders board |

---

## Deployment

Deployed on **Vercel**. To deploy your own instance:

1. Push code to GitHub
2. Import repo at [vercel.com](https://vercel.com/)
3. Add the 4 environment variables in **Settings > Environment Variables**
4. Click **Deploy**

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `GROQ_API_KEY not configured` | Add `GROQ_API_KEY` to `.env.local` |
| `Board not found` | Verify board IDs match your Monday.com board URLs |
| `Authentication failed` | Check that `MONDAY_API_TOKEN` is valid |
| `Rate limit hit (429)` | Agent auto-retries with a fallback model |

---

MIT — Built for Skylark Drones.
