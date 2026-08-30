/**
 * Deterministic Data Resilience Layer
 *
 * All normalization is done without LLM inference — purely rule-based.
 * Every normalized value carries its original raw value and an issue explanation
 * so the agent can communicate data quality caveats to the user.
 */

import {
  RawMondayItem,
  RawColumnValue,
  BoardSchema,
  NormalizedItem,
  NormalizedValue,
  DataQualityIssue,
  AggregateResult,
  AggregateOp,
  AggregateGroup,
  BoardMatchResult,
} from '@/types/monday';

// ─── Date Normalization ────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

/**
 * Convert Excel serial date number to YYYY-MM-DD.
 * Excel's epoch is Jan 0, 1900. Accounts for the 1900 leap year bug.
 */
function excelSerialToDate(serial: number): string | null {
  if (serial < 1 || serial > 2958465) return null; // 1900-01-01 to 9999-12-31
  // Excel incorrectly considers 1900 a leap year, so subtract 1 for dates after Feb 28, 1900
  const adjustedSerial = serial > 59 ? serial - 1 : serial;
  const date = new Date(Date.UTC(1900, 0, adjustedSerial));
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

/**
 * Normalize any date string to YYYY-MM-DD.
 * Returns { date, issue } where issue is set if format was ambiguous or corrected.
 */
export function normalizeDate(raw: string | null | undefined): NormalizedValue {
  if (!raw || raw.trim() === '' || raw.toLowerCase() === 'n/a' || raw.toLowerCase() === 'null') {
    return { raw: raw ?? null, normalized: null, type: 'null', issue: 'Missing or null date value' };
  }

  const s = raw.trim();

  // ISO 8601: YYYY-MM-DD (most reliable, check first)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00Z');
    if (!isNaN(d.getTime())) {
      return { raw, normalized: s, type: 'date' };
    }
  }

  // ISO with time: YYYY-MM-DDTHH:MM:SS...
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return { raw, normalized: d.toISOString().split('T')[0], type: 'date' };
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY (common in Indian/European data)
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const normalized = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      const issue = day <= 12
        ? `Ambiguous format DD/MM/YYYY vs MM/DD/YYYY. Assumed DD/MM/YYYY (value: ${raw})`
        : undefined;
      return { raw, normalized, type: 'date', issue };
    }
  }

  // MM/DD/YYYY (US format - only when day > 12 to distinguish from DD/MM)
  const mmddyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mmddyyyy) {
    const [, m, d, y] = mmddyyyy;
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && day > 12) {
      const normalized = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      return { raw, normalized, type: 'date', issue: `Interpreted as MM/DD/YYYY (value: ${raw})` };
    }
  }

  // DD-Mon-YYYY or DD/Mon/YYYY: 15-Mar-2024
  const ddMonYYYY = s.match(/^(\d{1,2})[\/\-\s]([a-zA-Z]{3,9})[\/\-\s](\d{4})$/);
  if (ddMonYYYY) {
    const [, day, monthStr, year] = ddMonYYYY;
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month) {
      const normalized = `${year}-${month}-${day.padStart(2, '0')}`;
      return { raw, normalized, type: 'date' };
    }
  }

  // Month DD, YYYY: "March 15, 2024"
  const monthNameFull = s.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthNameFull) {
    const [, monthStr, day, year] = monthNameFull;
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month) {
      const normalized = `${year}-${month}-${day.padStart(2, '0')}`;
      return { raw, normalized, type: 'date' };
    }
  }

  // DD/MM/YY or MM/DD/YY (2-digit year — assume 20xx)
  const shortYear = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (shortYear) {
    const [, d, m, y] = shortYear;
    const fullYear = `20${y}`;
    const normalized = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return {
      raw,
      normalized,
      type: 'date',
      issue: `2-digit year assumed as 20${y} (value: ${raw})`,
    };
  }

  // Excel serial number (pure integer between 20000 and 60000 — plausible date range ~1955-2064)
  const numericSerial = parseFloat(s);
  if (!isNaN(numericSerial) && numericSerial === Math.floor(numericSerial) && numericSerial >= 20000 && numericSerial <= 60000) {
    const normalized = excelSerialToDate(numericSerial);
    if (normalized) {
      return {
        raw,
        normalized,
        type: 'date',
        issue: `Interpreted as Excel date serial number (${raw} → ${normalized})`,
      };
    }
  }

  // Standard JavaScript Date string fallback: e.g. "Thu Feb 26 2026 00:00:00 GMT+0000..."
  const parsedTs = Date.parse(s);
  if (!isNaN(parsedTs)) {
    const parsedDate = new Date(parsedTs);
    const normalized = parsedDate.toISOString().split('T')[0];
    return {
      raw,
      normalized,
      type: 'date',
    };
  }

  // YYYY only — partial date
  if (/^\d{4}$/.test(s)) {
    const yr = parseInt(s, 10);
    if (yr >= 2000 && yr <= 2100) {
      return {
        raw,
        normalized: `${s}-01-01`,
        type: 'date',
        issue: `Only year provided, defaulted to Jan 1 of ${s}`,
      };
    }
  }

  // Unrecognized
  return {
    raw,
    normalized: null,
    type: 'null',
    issue: `Unrecognized date format: "${raw}"`,
  };
}

// ─── Number / Currency Normalization ─────────────────────────────────────────

const CURRENCY_PREFIXES = /^[$₹€£¥₩₦₨₪]/;
const CURRENCY_SUFFIXES = /\s*(USD|INR|EUR|GBP|JPY|KRW|lakh|lakhs|cr|crore|crores|M|K|B)$/i;

/**
 * Normalize currency/number strings to a plain float.
 * Returns null (not zero) for missing/empty/N-A values.
 */
export function normalizeNumber(raw: string | null | undefined): NormalizedValue {
  if (!raw || raw.trim() === '' || raw === '-' || raw.toLowerCase() === 'n/a' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'nil') {
    return { raw: raw ?? null, normalized: null, type: 'null', issue: 'Missing numeric value' };
  }

  let s = raw.trim();
  let issue: string | undefined;

  // Detect currency type for context
  const isCurrency = CURRENCY_PREFIXES.test(s);

  // Strip currency prefix/symbols
  s = s.replace(CURRENCY_PREFIXES, '').trim();

  // Handle Indian number system suffixes: lakh, crore
  const lakhMatch = s.match(/^([\d,]+(?:\.\d+)?)\s*(?:lakh|lakhs)/i);
  if (lakhMatch) {
    const num = parseFloat(lakhMatch[1].replace(/,/g, ''));
    return {
      raw,
      normalized: num * 100_000,
      type: 'currency',
      issue: `Converted from lakhs (${raw} → ${(num * 100_000).toLocaleString()})`,
    };
  }

  const croreMatch = s.match(/^([\d,]+(?:\.\d+)?)\s*(?:cr|crore|crores)/i);
  if (croreMatch) {
    const num = parseFloat(croreMatch[1].replace(/,/g, ''));
    return {
      raw,
      normalized: num * 10_000_000,
      type: 'currency',
      issue: `Converted from crores (${raw} → ${(num * 10_000_000).toLocaleString()})`,
    };
  }

  // Strip trailing currency suffixes (USD, INR etc.)
  s = s.replace(CURRENCY_SUFFIXES, '').trim();

  // Remove commas (thousand separators)
  s = s.replace(/,/g, '');

  // Handle K/M/B multipliers
  const multiplierMatch = s.match(/^([\d.]+)\s*([KMBkmb])$/);
  if (multiplierMatch) {
    const base = parseFloat(multiplierMatch[1]);
    const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[multiplierMatch[2].toLowerCase() as 'k' | 'm' | 'b'];
    issue = `Expanded from shorthand (${raw})`;
    return { raw, normalized: base * multiplier, type: isCurrency ? 'currency' : 'number', issue };
  }

  // Handle parentheses as negative: (1500) → -1500
  const parenMatch = s.match(/^\(([0-9.,]+)\)$/);
  if (parenMatch) {
    const num = parseFloat(parenMatch[1].replace(/,/g, ''));
    if (!isNaN(num)) {
      return {
        raw,
        normalized: -num,
        type: isCurrency ? 'currency' : 'number',
        issue: `Negative value in parentheses notation (${raw})`,
      };
    }
  }

  const parsed = parseFloat(s);
  if (isNaN(parsed)) {
    return {
      raw,
      normalized: null,
      type: 'null',
      issue: `Could not parse as number: "${raw}"`,
    };
  }

  return {
    raw,
    normalized: parsed,
    type: isCurrency ? 'currency' : 'number',
    issue,
  };
}

// ─── Category Normalization ───────────────────────────────────────────────────

// Sector synonym map — covers common Indian renewable energy naming variations
const SECTOR_SYNONYMS: Record<string, string[]> = {
  energy: ['energy', 'energy sector', 'power', 'electricity', 'solar', 'solar & wind', 'solar and wind', 'renewable', 'renewables', 'wind', 'wind energy', 'solar energy'],
  manufacturing: ['manufacturing', 'mfg', 'production', 'factory', 'industrial', 'industry'],
  infrastructure: ['infrastructure', 'infra', 'construction', 'civil', 'building'],
  agriculture: ['agriculture', 'agri', 'farming', 'agro'],
  government: ['government', 'govt', 'gov', 'public sector', 'psu', 'defense', 'defence'],
  real_estate: ['real estate', 'realty', 'property', 'housing', 'real-estate'],
  technology: ['technology', 'tech', 'it', 'software', 'saas', 'ites'],
  logistics: ['logistics', 'transport', 'transportation', 'supply chain', 'delivery'],
  mining: ['mining', 'mine', 'coal', 'mineral', 'extraction'],
  telecom: ['telecom', 'telecommunications', 'telco', 'communication'],
  finance: ['finance', 'financial', 'banking', 'bank', 'insurance', 'fintech'],
  healthcare: ['healthcare', 'health', 'pharma', 'pharmaceutical', 'hospital', 'medtech'],
  retail: ['retail', 'e-commerce', 'ecommerce', 'fmcg', 'consumer'],
};

// Stage synonym map for deal pipeline stages
const STAGE_SYNONYMS: Record<string, string[]> = {
  lead: ['lead', 'new lead', 'inquiry', 'enquiry', 'prospect', 'unqualified'],
  qualified: ['qualified', 'qualified lead', 'mql', 'sql', 'discovery'],
  proposal: ['proposal', 'proposal sent', 'rfp', 'rfq', 'quoting', 'quoted', 'tender'],
  negotiation: ['negotiation', 'negotiating', 'final negotiation', 'commercial', 'commercial discussion'],
  won: ['won', 'closed won', 'closed-won', 'deal won', 'converted', 'success', 'signed'],
  lost: ['lost', 'closed lost', 'closed-lost', 'deal lost', 'rejected', 'failed', 'not interested', 'dead'],
  on_hold: ['on hold', 'on-hold', 'hold', 'paused', 'suspended', 'deferred', 'stalled'],
};

// Status synonym map for work order statuses
const STATUS_SYNONYMS: Record<string, string[]> = {
  not_started: ['not started', 'new', 'todo', 'to do', 'pending', 'open', 'backlog'],
  in_progress: ['in progress', 'in-progress', 'wip', 'work in progress', 'ongoing', 'active', 'started', 'executing'],
  completed: ['completed', 'complete', 'done', 'finished', 'closed', 'delivered', 'deployed'],
  on_hold: ['on hold', 'on-hold', 'hold', 'paused', 'suspended', 'blocked', 'delayed'],
  cancelled: ['cancelled', 'canceled', 'dropped', 'terminated', 'void'],
};

function normalizeCategoryWith(
  raw: string | null | undefined,
  synonymMap: Record<string, string[]>
): NormalizedValue {
  if (!raw || raw.trim() === '' || raw.toLowerCase() === 'n/a' || raw.toLowerCase() === 'null') {
    return { raw: raw ?? null, normalized: null, type: 'null', issue: 'Missing category value' };
  }

  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, ' ');

  for (const [canonical, aliases] of Object.entries(synonymMap)) {
    if (aliases.some((a) => cleaned === a || cleaned.includes(a))) {
      const wasNormalized = cleaned !== canonical;
      return {
        raw,
        normalized: canonical,
        type: 'category',
        issue: wasNormalized ? `Normalized "${raw}" → "${canonical}"` : undefined,
      };
    }
  }

  // Not found in synonym map — return as-is but flag it
  return {
    raw,
    normalized: raw.trim(),
    type: 'category',
    issue: `Unrecognized category: "${raw}" — kept as-is`,
  };
}

export function normalizeSector(raw: string | null | undefined): NormalizedValue {
  return normalizeCategoryWith(raw, SECTOR_SYNONYMS);
}

export function normalizeDealStage(raw: string | null | undefined): NormalizedValue {
  return normalizeCategoryWith(raw, STAGE_SYNONYMS);
}

export function normalizeStatus(raw: string | null | undefined): NormalizedValue {
  return normalizeCategoryWith(raw, STATUS_SYNONYMS);
}

// ─── Column Type Detection ────────────────────────────────────────────────────

/**
 * Given a column title and type, decide what normalizer to use and
 * which canonical field name to assign.
 */
interface ColumnMapping {
  canonicalName: string;
  normalizer: (raw: string | null) => NormalizedValue;
}

function getColumnMapping(title: string, type: string): ColumnMapping {
  const t = title.toLowerCase().trim();

  // Date columns
  if (
    type === 'date' ||
    t.includes('date') ||
    t.includes('deadline') ||
    t.includes('start') ||
    t.includes('end') ||
    t.includes('due') ||
    t.includes('created') ||
    t.includes('closed') ||
    t.includes('delivery')
  ) {
    return { canonicalName: title, normalizer: normalizeDate };
  }

  // Currency / number columns
  if (
    type === 'numbers' ||
    t.includes('value') ||
    t.includes('amount') ||
    t.includes('revenue') ||
    t.includes('deal size') ||
    t.includes('deal value') ||
    t.includes('budget') ||
    t.includes('cost') ||
    t.includes('price') ||
    t.includes('worth') ||
    t.includes('fee') ||
    t.includes('salary') ||
    t.includes('total') ||
    t.includes('quantity') ||
    t.includes('count') ||
    t.includes('days') ||
    t.includes('hours') ||
    t.includes('probability') ||
    t.includes('score') ||
    t.includes('%')
  ) {
    return { canonicalName: title, normalizer: normalizeNumber };
  }

  // Sector columns
  if (t.includes('sector') || t.includes('industry') || t.includes('vertical') || t.includes('segment')) {
    return { canonicalName: title, normalizer: normalizeSector };
  }

  // Stage columns (deal pipeline)
  if (t.includes('stage') || t.includes('pipeline') || t.includes('funnel')) {
    return { canonicalName: title, normalizer: normalizeDealStage };
  }

  // Status columns
  if (t.includes('status') || t === 'state' || t.includes('progress')) {
    return { canonicalName: title, normalizer: normalizeStatus };
  }

  // Default: treat as plain text
  return {
    canonicalName: title,
    normalizer: (raw) => ({
      raw,
      normalized: raw?.trim() || null,
      type: raw?.trim() ? 'text' : 'null',
      issue: !raw?.trim() ? 'Empty text field' : undefined,
    }),
  };
}

// ─── Item Normalization ───────────────────────────────────────────────────────

/**
 * Normalize a raw Monday.com item into structured, typed fields.
 * Attaches data quality issues to _dataIssues array.
 */
export function normalizeItem(rawItem: RawMondayItem, schema: BoardSchema): NormalizedItem {
  const fields: Record<string, NormalizedValue> = {};
  const _dataIssues: DataQualityIssue[] = [];

  // Build a map from column ID to schema info for quick lookup
  const schemaMap = new Map(schema.columns.map((c) => [c.id, c]));

  for (const cv of rawItem.column_values) {
    const schemaCol = schemaMap.get(cv.id);
    const columnTitle = schemaCol?.title ?? cv.column?.title ?? cv.id;
    const columnType = schemaCol?.type ?? cv.column?.type ?? 'text';

    // Use .text first (human-readable), fall back to .value (raw JSON)
    const rawValue = cv.text ?? extractValueText(cv.value);

    const mapping = getColumnMapping(columnTitle, columnType);
    const normalized = mapping.normalizer(rawValue);

    // If this field already exists and had a valid non-null value, don't overwrite it with a null value
    if (fields[columnTitle] && fields[columnTitle].normalized !== null && normalized.normalized === null) {
      // Keep existing non-null
    } else {
      fields[columnTitle] = normalized;
    }

    if (normalized.issue) {
      _dataIssues.push({
        field: columnTitle,
        raw: normalized.raw,
        issue: normalized.issue,
        rowId: rawItem.id,
        rowName: rawItem.name,
      });
    }
  }

  return {
    id: rawItem.id,
    name: rawItem.name || '(unnamed)',
    fields,
    _dataIssues,
  };
}

/**
 * Extract a human-readable text from a raw Monday.com JSON value string.
 */
function extractValueText(value: string | null): string | null {
  if (!value || value === 'null') return null;
  try {
    const parsed = JSON.parse(value);
    // Date columns: { date: "2024-03-15" }
    if (parsed?.date) return parsed.date;
    // Status: { label: "In Progress" }
    if (parsed?.label) return parsed.label;
    // Text: { text: "..." }
    if (typeof parsed?.text === 'string') return parsed.text;
    // Number: directly the value
    if (typeof parsed === 'number') return String(parsed);
    // Email / phone: { email: "..." }
    if (parsed?.email) return parsed.email;
    if (parsed?.phone) return parsed.phone;
    // Dropdown / mirror: { chosenValues: [{ name: "..." }] }
    if (Array.isArray(parsed?.chosenValues)) {
      return parsed.chosenValues.map((v: { name?: string }) => v.name).filter(Boolean).join(', ');
    }
    return String(value);
  } catch {
    return value;
  }
}

// ─── Batch Normalization ──────────────────────────────────────────────────────

export function normalizeItems(rawItems: RawMondayItem[], schema: BoardSchema): NormalizedItem[] {
  return rawItems.map((item) => normalizeItem(item, schema));
}

// ─── Filtering ────────────────────────────────────────────────────────────────

// ─── Semantic Field Aliases ──────────────────────────────────────────────────

const FIELD_ALIASES: Record<string, string[]> = {
  sector: ['sector/service', 'sector', 'industry', 'vertical', 'domain', 'service'],
  value: ['masked deal value', 'deal value', 'deal size', 'amount', 'total amount', 'contract value', 'value', 'revenue'],
  stage: ['deal stage', 'stage', 'pipeline stage', 'funnel stage', 'status'],
  status: ['deal status', 'work order status', 'project status', 'status', 'state'],
  date: ['tentative close date', 'close date (a)', 'created date', 'expected close date', 'close date', 'start date', 'end date', 'date'],
  company: ['client code', 'company', 'client', 'customer', 'account', 'lead', 'name'],
};

export function findFieldKey(fields: Record<string, unknown>, targetName: string): string | null {
  if (!targetName) return null;
  const target = targetName.toLowerCase().trim();
  const keys = Object.keys(fields);

  const candidates: string[] = [];

  // 1. Exact match
  const exact = keys.filter((k) => k.toLowerCase() === target);
  candidates.push(...exact);

  // 2. Substring match
  const substring = keys.filter((k) => k.toLowerCase().includes(target) || target.includes(k.toLowerCase()));
  candidates.push(...substring);

  // 3. Alias dictionary match
  for (const [aliasCategory, aliases] of Object.entries(FIELD_ALIASES)) {
    const matchesTarget = aliasCategory === target || aliases.some((a) => target.includes(a) || a.includes(target));
    if (matchesTarget) {
      for (const alias of aliases) {
        const found = keys.filter((k) => k.toLowerCase().includes(alias));
        candidates.push(...found);
      }
    }
  }

  const uniqueCandidates = [...new Set(candidates)];
  if (uniqueCandidates.length === 0) return null;

  // Prefer candidate column that contains a non-null normalized value
  for (const c of uniqueCandidates) {
    const val = fields[c] as NormalizedValue | undefined;
    if (val && typeof val === 'object' && 'normalized' in val && val.normalized !== null && val.normalized !== undefined) {
      return c;
    }
  }

  return uniqueCandidates[0];
}

// ─── Filtering ────────────────────────────────────────────────────────────────

export interface FilterSpec {
  field: string;
  operator: string;
  value?: string;
}

export function applyFilters(items: NormalizedItem[], filters: FilterSpec[]): NormalizedItem[] {
  return items.filter((item) => {
    return filters.every((filter) => {
      const fieldKey = findFieldKey(item.fields, filter.field);
      if (!fieldKey) return filter.operator === 'not_null' ? false : true;

      const nv = item.fields[fieldKey];
      const val = nv.normalized;
      const op = (filter.operator || 'contains').toLowerCase().replace(/[^a-z_]/g, '');
      const filterVal = (filter.value ?? '').toLowerCase().trim();

      switch (op) {
        case 'not_null':
        case 'exists':
        case 'is_not_null':
          return val !== null && val !== undefined && val !== '';
        case 'is_null':
        case 'null':
          return val === null || val === undefined || val === '';
        case 'contains':
        case 'includes':
          return val !== null && String(val).toLowerCase().includes(filterVal);
        case 'not_contains':
        case 'not_includes':
          return val === null || !String(val).toLowerCase().includes(filterVal);
        case 'equals':
        case 'eq':
          return val !== null && String(val).toLowerCase() === filterVal;
        case 'not_equals':
        case 'neq':
        case 'ne':
          return val === null || String(val).toLowerCase() !== filterVal;
        case 'gt':
          return typeof val === 'number' && val > parseFloat(filterVal || '0');
        case 'lt':
          return typeof val === 'number' && val < parseFloat(filterVal || '0');
        case 'gte':
          return typeof val === 'number' && val >= parseFloat(filterVal || '0');
        case 'lte':
          return typeof val === 'number' && val <= parseFloat(filterVal || '0');
        default:
          return true;
      }
    });
  });
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function aggregate(
  items: NormalizedItem[],
  groupByField: string,
  metricField: string,
  op: AggregateOp
): AggregateResult {
  const groups = new Map<string, number[]>();
  let excludedCount = 0;
  const exclusionReasons: string[] = [];
  const reasonSet = new Set<string>();

  for (const item of items) {
    const groupKey = findFieldValue(item, groupByField);
    const metricRaw = findNormalizedValue(item, metricField);

    // For count operations, we don't need a numeric metric
    if (op === 'count') {
      const key = groupKey ?? '(unknown)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(1);
      continue;
    }

    // For numeric ops, we need a valid number
    if (typeof metricRaw !== 'number') {
      excludedCount++;
      const reason = `Missing/invalid "${metricField}" value`;
      if (!reasonSet.has(reason)) {
        exclusionReasons.push(reason);
        reasonSet.add(reason);
      }
      continue;
    }

    const key = groupKey ?? '(unknown)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(metricRaw);
  }

  const resultGroups: AggregateGroup[] = [];
  for (const [groupKey, values] of groups.entries()) {
    let value = 0;
    switch (op) {
      case 'sum':
        value = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        break;
      case 'min':
        value = Math.min(...values);
        break;
      case 'max':
        value = Math.max(...values);
        break;
      case 'count':
        value = values.length;
        break;
    }
    resultGroups.push({ groupKey, value, count: values.length });
  }

  // Sort by value descending
  resultGroups.sort((a, b) => b.value - a.value);

  const validRecords = items.length - excludedCount;

  return {
    operation: op,
    groupByField,
    metricField,
    groups: resultGroups,
    totalRecords: items.length,
    validRecords,
    excludedCount,
    exclusionReasons,
  };
}

function findFieldValue(item: NormalizedItem, fieldName: string): string | null {
  const key = findFieldKey(item.fields, fieldName);
  if (!key) return null;
  const val = item.fields[key].normalized;
  return val !== null && val !== undefined ? String(val) : null;
}

function findNormalizedValue(item: NormalizedItem, fieldName: string): number | string | null {
  const key = findFieldKey(item.fields, fieldName);
  if (!key) return null;
  return item.fields[key].normalized ?? null;
}

// ─── Cross-Board Matching ─────────────────────────────────────────────────────

/**
 * Attempt to join Deals and Work Orders on company/client name.
 * Uses fuzzy normalization (lowercase, strip legal suffixes like Pvt Ltd, LLC etc.)
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\b(pvt\.?|ltd\.?|private|limited|llc|inc\.?|corp\.?|gmbh|co\.?|company|enterprises?|solutions?|technologies?|tech|group|india|global|international|industries)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const COMPANY_FIELD_HINTS = ['company', 'client', 'customer', 'organization', 'account', 'lead', 'name'];

function extractCompanyName(item: NormalizedItem): string | null {
  // Try item.name first (Monday.com item name is often the company/deal name)
  if (item.name && item.name !== '(unnamed)') {
    return item.name;
  }
  // Then check field titles
  for (const hint of COMPANY_FIELD_HINTS) {
    const key = Object.keys(item.fields).find((k) => k.toLowerCase().includes(hint));
    if (key) {
      const val = item.fields[key].normalized;
      if (typeof val === 'string' && val.trim()) return val;
    }
  }
  return null;
}

export function matchAcrossBoards(
  deals: NormalizedItem[],
  workOrders: NormalizedItem[]
): BoardMatchResult {
  const matched: BoardMatchResult['matched'] = [];
  const usedWorkOrderIds = new Set<string>();

  // Build normalized company → workOrder map
  const workOrderMap = new Map<string, NormalizedItem[]>();
  for (const wo of workOrders) {
    const company = extractCompanyName(wo);
    if (!company) continue;
    const key = normalizeCompanyName(company);
    if (!workOrderMap.has(key)) workOrderMap.set(key, []);
    workOrderMap.get(key)!.push(wo);
  }

  const unmatchedDeals: NormalizedItem[] = [];

  for (const deal of deals) {
    const company = extractCompanyName(deal);
    if (!company) {
      unmatchedDeals.push(deal);
      continue;
    }
    const key = normalizeCompanyName(company);
    const candidates = workOrderMap.get(key);

    if (!candidates || candidates.length === 0) {
      unmatchedDeals.push(deal);
    } else {
      for (const wo of candidates) {
        matched.push({ deal, workOrder: wo, matchKey: company });
        usedWorkOrderIds.add(wo.id);
      }
    }
  }

  const unmatchedWorkOrders = workOrders.filter((wo) => !usedWorkOrderIds.has(wo.id));
  const matchRate = deals.length > 0 ? (matched.length / deals.length) * 100 : 0;

  return { matched, unmatchedDeals, unmatchedWorkOrders, matchRate };
}

// ─── Data Quality Score ───────────────────────────────────────────────────────

/**
 * Compute a 0-100 data quality score for a set of normalized items.
 * Based on: % of fields that are non-null and had no issues.
 */
export function computeDataQualityScore(items: NormalizedItem[]): number {
  if (items.length === 0) return 0;

  let totalFields = 0;
  let cleanFields = 0;

  for (const item of items) {
    for (const nv of Object.values(item.fields)) {
      totalFields++;
      if (nv.normalized !== null && !nv.issue) cleanFields++;
    }
  }

  return totalFields === 0 ? 0 : Math.round((cleanFields / totalFields) * 100);
}

/**
 * Collect all unique data quality issues across a set of items,
 * grouped and deduplicated for concise reporting.
 */
export function summarizeDataIssues(items: NormalizedItem[]): string[] {
  const issueCounts = new Map<string, number>();

  for (const item of items) {
    for (const dq of item._dataIssues) {
      const key = dq.issue;
      issueCounts.set(key, (issueCounts.get(key) ?? 0) + 1);
    }
  }

  return Array.from(issueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([issue, count]) => `${count} row(s): ${issue}`)
    .slice(0, 15); // cap at 15 unique issues for readability
}
