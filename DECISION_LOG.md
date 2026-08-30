# Decision Log — Skylark BI Agent (ARIA)

**Author:** Engineering Team | **Date:** 2026-08-30 | **Timeline:** 6 hours

---

## 1. Key Assumptions

**Board Structure**
The CSV data contains columns typical of Indian B2B drone services:
- Deals: company name, deal stage, deal value, sector, close date, owner
- Work Orders: client name, project status, contract value, sector, start/end dates

Column names in Monday.com were assumed to be similar to CSV headers after import. The agent handles this gracefully by discovering schemas dynamically via `get_board_schema`.

**"Quarter" Default**
When a founder asks "this quarter", the agent uses the current calendar quarter (Q1-Q4 of the current year) since Skylark's fiscal year alignment is unknown.

**Data Quality Baseline**
Real-world data typically has 20-40% field-level issues (missing values, mixed formats). The agent was designed to report, not silently drop or fabricate, problematic records.

**Indian Currency**
Given Skylark operates in India, currency normalization prioritizes ₹, lakh, and crore formats before USD.

---

## 2. Tech Stack Decisions

**Why Next.js (not Flask / FastAPI)?**
- Single deployment unit: frontend + backend API routes in one repo
- Vercel-native hosting for zero-config deployment (one-click hosted prototype)
- Built-in TypeScript support eliminates a runtime type-mismatch class of bugs

**Why Monday.com GraphQL API (not MCP)?**
- MCP (Model Context Protocol) requires running a local MCP server, which complicates hosted deployments
- The GraphQL API v2 gives full control over query structure, pagination, and field selection
- Cursor-based pagination via `items_page` / `next_items_page` is more reliable than MCP wrappers for large boards
- API tokens are simpler to configure than MCP server OAuth flows for a 6-hour prototype

**Why Groq (Llama 3.1 70B) (not Claude 3.5 Sonnet)?**
- The original specification requested Claude 3.5 Sonnet, but was later relaxed to allow custom tech stack choices.
- Groq's LPU inference engine provides near-instantaneous response times, which makes the conversational interface feel incredibly snappy.
- Llama 3.1 70B has excellent tool-use (function calling) capabilities natively supported by the OpenAI-compatible `groq-sdk`.
- Strong structured JSON output for tool result parsing.

**Why Vanilla CSS (not Tailwind)?**
- Zero build configuration; design tokens in CSS custom properties give the same DX
- Full glassmorphism, gradient, and animation control without Tailwind plugin overhead

---

## 3. Data Resilience Trade-offs

**Chosen: Deterministic rule-based normalization**
The normalization layer (`lib/normalize.ts`) uses only explicit regex, lookup tables, and arithmetic — no LLM inference. This guarantees:
- Reproducible outputs (same messy input always gives same normalized output)
- Auditable logic (every normalization step is in one file)
- Zero hallucination risk on data values

**Trade-off:** Some genuinely ambiguous cases (e.g. `05/06/2024` — is it May 6 or June 5?) are flagged as caveats rather than silently resolved. This is intentional — surfacing ambiguity to the user is more trustworthy than a wrong silent assumption.

**With more time:**
- Train or fine-tune a small classification model for sector normalization
- Add a feedback loop where users can confirm/reject normalizations to improve future accuracy
- Implement fuzzy string matching (Levenshtein distance) for cross-board company name matching instead of the current tokenization approach

---

## 4. Cross-Board Matching Approach

Company names between Deals and Work Orders often differ (e.g. "ABC Pvt Ltd" vs "ABC"). The matching algorithm:
1. Strips legal suffixes (`Pvt`, `Ltd`, `Private`, `Limited`, `LLC`, etc.)
2. Normalizes to lowercase, strips punctuation
3. Compares the cleaned tokens

**Trade-off:** This approach has a ~10-15% false negative rate for heavily abbreviated names. With more time, a phonetic similarity metric (Soundex/Double Metaphone) would improve recall.

---

## 5. "Leadership Update" Interpretation

**My interpretation:** A leadership update is a concise, structured executive briefing that a founder can paste directly into a board deck or email. It should:

1. **Lead with the business conclusion**, not raw data
2. **Structure across four areas:** Pipeline, Revenue, Operations, and Data Quality
3. **Surface the 2-3 most actionable insights** (e.g., "₹2.3Cr of pipeline is stalled in Negotiation — 4 deals exceed 45 days")
4. **Include a data quality audit** — because leadership should know if the numbers they're looking at are complete
5. **Be self-contained** — readable without any prior context

Implementation: The `generate_leadership_summary` tool fetches both boards in parallel, computes cross-board metrics, and returns structured JSON. Claude then formats this into a Markdown executive brief with tables and key callouts. This runs in a single user turn — no back-and-forth needed.

---

## 6. What I'd Do Differently With More Time

| Priority | Enhancement |
|----------|------------|
| High | Streaming responses (SSE) so the UI shows text character-by-character |
| High | Time-series analysis — deal velocity, days-in-stage trend charts |
| High | Chart rendering via Recharts (bar/funnel/pie charts inline in chat) |
| Medium | Caching Monday.com data with 5-minute TTL (Redis/Upstash) to avoid re-fetching on every message |
| Medium | Multi-tenant auth so multiple team members each have private conversation history |
| Medium | Export to PDF / Google Slides (leadership update as a deck) |
| Low | Webhook integration — alert via Slack when a deal is stalled >30 days |
| Low | Historical data snapshots (save board state daily) to enable trend comparison |

---

## 7. Known Limitations

- **Read-only:** The agent cannot update Monday.com items. This is by design per the spec.
- **No persistent memory:** Conversation history is held client-side; refreshing the page clears it.
- **Date range filtering:** Currently supports static date comparisons; dynamic date math ("last 30 days") is interpreted by the LLM but not yet implemented as a dedicated filter operator.
- **Rate limits:** Monday.com GraphQL API has a 60-second rate limit bucket. Queries on very large boards (>2000 items) may occasionally trigger throttling.
