// ─── Monday.com Raw API Types ───────────────────────────────────────────────

export interface ColumnSchema {
  id: string;
  title: string;
  type: string; // e.g. "text", "numbers", "date", "status", "dropdown", "long_text", "email", "phone"
}

export interface BoardSchema {
  id: string;
  name: string;
  columns: ColumnSchema[];
}

export interface RawColumnValue {
  id: string;
  column: {
    title: string;
    type: string;
  };
  value: string | null;
  text: string | null;
}

export interface RawMondayItem {
  id: string;
  name: string;
  column_values: RawColumnValue[];
}

export interface BoardItemsResponse {
  items: RawMondayItem[];
  cursor: string | null;
}

// ─── Normalized / Resilient Data Types ─────────────────────────────────────

export type NormalizedValueType = 'date' | 'number' | 'currency' | 'category' | 'text' | 'null';

export interface NormalizedValue {
  raw: string | null;
  normalized: string | number | null;
  type: NormalizedValueType;
  issue?: string; // e.g. "ambiguous date format DD/MM vs MM/DD — assumed DD/MM"
}

export interface DataQualityIssue {
  field: string;
  raw: string | null;
  issue: string;
  rowId: string;
  rowName: string;
}

export interface NormalizedItem {
  id: string;
  name: string;
  fields: Record<string, NormalizedValue>;
  _dataIssues: DataQualityIssue[];
}

// ─── Aggregation Types ───────────────────────────────────────────────────────

export type AggregateOp = 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface AggregateGroup {
  groupKey: string;
  value: number;
  count: number; // number of records in this group
}

export interface AggregateResult {
  operation: AggregateOp;
  groupByField: string;
  metricField: string;
  groups: AggregateGroup[];
  totalRecords: number;
  validRecords: number;
  excludedCount: number;
  exclusionReasons: string[];
}

// ─── Cross-Board Matching Types ──────────────────────────────────────────────

export interface BoardMatchResult {
  matched: Array<{
    deal: NormalizedItem;
    workOrder: NormalizedItem;
    matchKey: string;
  }>;
  unmatchedDeals: NormalizedItem[];
  unmatchedWorkOrders: NormalizedItem[];
  matchRate: number;
}

// ─── Leadership Summary Types ────────────────────────────────────────────────

export interface PipelineStageMetrics {
  stage: string;
  count: number;
  totalValue: number;
  avgDealSize: number;
}

export interface SectorMetrics {
  sector: string;
  dealCount: number;
  pipelineValue: number;
  wonRevenue: number;
  workOrderCount: number;
  completionRate: number;
}

export interface LeadershipSummaryData {
  reportDate: string;
  pipeline: {
    totalDeals: number;
    totalValue: number;
    byStage: PipelineStageMetrics[];
    dataQualityNotes: string[];
  };
  revenue: {
    totalWon: number;
    totalWorkOrderValue: number;
    bySector: SectorMetrics[];
    dataQualityNotes: string[];
  };
  operations: {
    totalWorkOrders: number;
    completedCount: number;
    inProgressCount: number;
    overdueCount: number;
    completionRate: number;
    dataQualityNotes: string[];
  };
  crossBoardInsights: {
    dealToWorkOrderConversionRate: number;
    avgTimeFromDealToExecution: string | null;
    topPerformingSectors: string[];
    dataQualityNotes: string[];
  };
  overallDataQualityScore: number; // 0-100
}

// ─── Chat / API Types ────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatApiResponse {
  reply: string;
  dataQualityNotes: string[];
  toolsUsed: string[];
  error?: string;
}

// ─── Tool Input/Output Types ─────────────────────────────────────────────────

export interface GetBoardSchemaInput {
  board_type: 'deals' | 'work_orders';
}

export interface QueryBoardDataInput {
  board_type: 'deals' | 'work_orders';
  filters?: Array<{
    field: string; // column title (case-insensitive)
    operator: 'contains' | 'equals' | 'gt' | 'lt' | 'not_null';
    value?: string;
  }>;
  aggregate?: {
    group_by: string;     // column title
    metric_field: string; // column title
    operation: AggregateOp;
  };
  include_sample?: boolean; // include up to 10 raw rows in response
  include_data_quality?: boolean;
}

export interface GenerateLeadershipSummaryInput {
  focus_areas?: Array<'pipeline' | 'revenue' | 'operations' | 'cross_board'>;
  time_period?: string; // e.g. "Q3 2024", "this quarter", "YTD"
}
