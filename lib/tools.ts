/**
 * Agent Tool Definitions and Dispatcher
 * Implements Claude tool-use (function calling) specs and handler logic.
 */

import Groq from 'groq-sdk';
import { getBoardSchema, getBoardIds, queryBoardItems, MondayApiError } from '@/lib/monday';
import {
  normalizeItems,
  applyFilters,
  aggregate,
  matchAcrossBoards,
  computeDataQualityScore,
  summarizeDataIssues,
  FilterSpec,
} from '@/lib/normalize';
import {
  GetBoardSchemaInput,
  QueryBoardDataInput,
  GenerateLeadershipSummaryInput,
  NormalizedItem,
} from '@/types/monday';

// ─── Tool Definitions (Anthropic format) ─────────────────────────────────────

export const TOOL_DEFINITIONS: Groq.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_board_schema',
      description:
        'Inspect the structure (column names and types) of a Monday.com board ("deals" or "work_orders").',
      parameters: {
        type: 'object' as const,
        properties: {
          board_type: {
            type: 'string',
            description: 'Which board: "deals" (sales pipeline) or "work_orders" (project execution).',
          },
        },
        required: ['board_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_board_data',
      description:
        'Query, filter, or aggregate data from a Monday.com board ("deals" or "work_orders").',
      parameters: {
        type: 'object' as const,
        properties: {
          board_type: {
            type: 'string',
            description: 'Which board: "deals" or "work_orders".',
          },
          filters: {
            type: 'array',
            description: 'Optional filters to narrow down records.',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', description: 'Column name to filter on.' },
                operator: {
                  type: 'string',
                  description: '"contains", "equals", "gt", "lt", or "not_null".',
                },
                value: { type: 'string', description: 'Value to compare against.' },
              },
              required: ['field', 'operator'],
            },
          },
          aggregate: {
            anyOf: [
              {
                type: 'object',
                description: 'Aggregation config.',
                properties: {
                  group_by: { type: 'string', description: 'Column to group by (e.g. "Sector", "Stage", "Status").' },
                  metric_field: { type: 'string', description: 'Column to compute metric on (e.g. "Deal Value").' },
                  operation: { type: 'string', description: '"sum", "count", "avg", "min", or "max".' },
                },
                required: ['group_by', 'metric_field', 'operation'],
              },
              { type: 'null' },
            ],
            description: 'Optional: compute an aggregation. Set to null to skip.',
          },
          include_sample: {
            type: 'boolean',
            description: 'Include sample records.',
          },
          include_data_quality: {
            type: 'boolean',
            description: 'Include data quality metrics.',
          },
        },
        required: ['board_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_leadership_summary',
      description:
        'Generate a comprehensive multi-board leadership/executive summary across pipeline, revenue, and operations.',
      parameters: {
        type: 'object' as const,
        properties: {
          time_period: {
            type: 'string',
            description: 'Time period context (e.g. "Q3 2024", "this quarter").',
          },
        },
      },
    },
  },
];

// ─── Board Resolution Helper ──────────────────────────────────────────────────

function resolveBoardId(boardType: string | undefined): string {
  const ids = getBoardIds();
  const normalized = String(boardType || '').toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.includes('deal') || normalized.includes('sales') || normalized.includes('pipeline') || normalized.includes('lead')) {
    return ids.deals;
  }
  return ids.workOrders;
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

async function handleGetBoardSchema(input: GetBoardSchemaInput): Promise<object> {
  const boardId = resolveBoardId(input.board_type);
  const schema = await getBoardSchema(boardId);

  return {
    board_name: schema.name,
    board_type: input.board_type,
    total_columns: schema.columns.length,
    // Only return column titles and types — no IDs needed
    columns: schema.columns.map((c) => ({ title: c.title, type: c.type })),
    note: 'Use column title values when filtering or aggregating.',
  };
}

async function handleQueryBoardData(input: QueryBoardDataInput): Promise<object> {
  const boardId = resolveBoardId(input.board_type);

  // Fetch schema + raw items
  const [schema, rawItems] = await Promise.all([
    getBoardSchema(boardId),
    queryBoardItems(boardId),
  ]);

  // Normalize all items
  let items: NormalizedItem[] = normalizeItems(rawItems, schema);

  const totalFetched = items.length;

  // Apply filters (guard against null)
  if (input.filters && Array.isArray(input.filters) && input.filters.length > 0) {
    items = applyFilters(items, input.filters as FilterSpec[]);
  }

  const filteredCount = items.length;

  const result: Record<string, unknown> = {
    board_type: input.board_type,
    board_name: schema.name,
    total_records_fetched: totalFetched,
    records_after_filter: filteredCount,
  };

  // Aggregation (guard against null — model may pass null when not needed)
  if (input.aggregate && typeof input.aggregate === 'object' && input.aggregate.group_by) {
    const agg = aggregate(
      items,
      input.aggregate.group_by,
      input.aggregate.metric_field,
      input.aggregate.operation
    );

    result.aggregation = {
      operation: agg.operation,
      group_by: agg.groupByField,
      metric_field: agg.metricField,
      total_records: agg.totalRecords,
      valid_records: agg.validRecords,
      excluded_records: agg.excludedCount,
      results: agg.groups.map((g) => ({
        group: g.groupKey,
        value: Math.round(g.value * 100) / 100,
        record_count: g.count,
      })),
    };
  }

  // Always include top 8 matching records with clean non-null fields
  result.records = items.slice(0, 8).map((item) => {
    const row: Record<string, unknown> = { name: item.name };
    for (const [fieldName, nv] of Object.entries(item.fields)) {
      if (nv.normalized !== null && nv.normalized !== undefined) {
        row[fieldName] = nv.normalized;
      }
    }
    return row;
  });

  // Include stage breakdown summary if available
  const stageAgg = aggregate(items, 'stage', 'value', 'sum');
  if (stageAgg.groups.length > 0) {
    result.breakdown_by_stage = stageAgg.groups.slice(0, 6).map((g) => ({
      stage: g.groupKey,
      total_value: Math.round(g.value),
      count: g.count,
    }));
  }

  // Include sector breakdown summary if available
  const sectorAgg = aggregate(items, 'sector', 'value', 'sum');
  if (sectorAgg.groups.length > 0) {
    result.breakdown_by_sector = sectorAgg.groups.slice(0, 6).map((g) => ({
      sector: g.groupKey,
      total_value: Math.round(g.value),
      count: g.count,
    }));
  }

  // Data quality
  if (input.include_data_quality) {
    const score = computeDataQualityScore(items);
    const issues = summarizeDataIssues(items);
    result.data_quality = {
      score_pct: score,
      score_description: score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Poor',
      top_issues: issues.slice(0, 3),
    };
  }

  return result;
}

async function handleGenerateLeadershipSummary(
  input: GenerateLeadershipSummaryInput
): Promise<object> {
  const ids = getBoardIds();
  const focusAreas = input.focus_areas ?? ['pipeline', 'revenue', 'operations', 'cross_board'];

  // Fetch both boards in parallel
  const [dealsSchema, dealsRaw, workOrdersSchema, workOrdersRaw] = await Promise.all([
    getBoardSchema(ids.deals),
    queryBoardItems(ids.deals),
    getBoardSchema(ids.workOrders),
    queryBoardItems(ids.workOrders),
  ]);

  const deals = normalizeItems(dealsRaw, dealsSchema);
  const workOrders = normalizeItems(workOrdersRaw, workOrdersSchema);

  const summary: Record<string, unknown> = {
    reportDate: new Date().toISOString().split('T')[0],
    timePeriodContext: input.time_period ?? 'All time (no time filter applied)',
    totalDealsRecords: deals.length,
    totalWorkOrderRecords: workOrders.length,
  };

  // ─── Pipeline Analysis ─────────────────────────────────────────────────────
  if (focusAreas.includes('pipeline')) {
    const stageAgg = aggregate(deals, 'Stage', 'Deal Value', 'sum');
    const stageCount = aggregate(deals, 'Stage', 'Deal Value', 'count');

    // Also try alternate column names
    const dealValueFields = findNumericFieldName(deals[0], ['deal value', 'value', 'amount', 'deal size', 'contract value']);
    const stageFields = findFieldName(deals[0], ['stage', 'pipeline stage', 'funnel stage']);

    let pipelineAgg = stageAgg;
    let pipelineCountAgg = stageCount;

    if (dealValueFields && stageFields && (dealValueFields !== 'Deal Value' || stageFields !== 'Stage')) {
      pipelineAgg = aggregate(deals, stageFields, dealValueFields, 'sum');
      pipelineCountAgg = aggregate(deals, stageFields, dealValueFields, 'count');
    }

    const totalPipelineValue = pipelineAgg.groups
      .filter((g) => !['won', 'lost', 'closed won', 'closed lost'].includes(g.groupKey.toLowerCase()))
      .reduce((s, g) => s + g.value, 0);

    summary.pipeline = {
      totalDeals: deals.length,
      totalPipelineValue: Math.round(totalPipelineValue),
      dataQualityNotes: summarizeDataIssues(deals).slice(0, 5),
      byStage: pipelineAgg.groups.map((g) => ({
        stage: g.groupKey,
        totalValue: Math.round(g.value),
        count: pipelineCountAgg.groups.find((c) => c.groupKey === g.groupKey)?.value ?? g.count,
        avgDealSize: g.count > 0 ? Math.round(g.value / g.count) : 0,
      })),
      excludedRecords: pipelineAgg.excludedCount,
      exclusionNote:
        pipelineAgg.excludedCount > 0
          ? `${pipelineAgg.excludedCount} deals excluded due to missing value fields`
          : 'All deal records had value data',
    };
  }

  // ─── Revenue / Sector Analysis ─────────────────────────────────────────────
  if (focusAreas.includes('revenue')) {
    const sectorField = findFieldName(deals[0], ['sector', 'industry', 'vertical', 'segment']);
    const valueField = findNumericFieldName(deals[0], ['deal value', 'value', 'amount', 'deal size']);
    const woSectorField = findFieldName(workOrders[0], ['sector', 'industry', 'vertical', 'segment', 'category']);
    const woValueField = findNumericFieldName(workOrders[0], ['contract value', 'total value', 'value', 'amount', 'revenue', 'order value']);

    const wonDeals = deals.filter((d) => {
      const stageKey = findFieldName(d, ['stage', 'pipeline stage']);
      if (!stageKey) return false;
      const stageVal = String(d.fields[stageKey]?.normalized ?? '').toLowerCase();
      return stageVal === 'won' || stageVal.includes('won');
    });

    const wonBySection = sectorField && valueField
      ? aggregate(wonDeals, sectorField, valueField, 'sum')
      : null;
    const dealsBySector = sectorField
      ? aggregate(deals, sectorField, sectorField, 'count')
      : null;
    const woRevenueBySector = woSectorField && woValueField
      ? aggregate(workOrders, woSectorField, woValueField, 'sum')
      : null;

    summary.revenue = {
      totalWonDeals: wonDeals.length,
      wonRevenue: wonBySection ? Math.round(wonBySection.groups.reduce((s, g) => s + g.value, 0)) : null,
      bySector: dealsBySector
        ? dealsBySector.groups.map((g) => ({
            sector: g.groupKey,
            dealCount: g.value,
            wonRevenue: wonBySection?.groups.find((s) => s.groupKey === g.groupKey)?.value ?? 0,
            workOrderRevenue: woRevenueBySector?.groups.find((s) => s.groupKey === g.groupKey)?.value ?? null,
          }))
        : [],
      dataQualityNotes: [
        ...summarizeDataIssues(wonDeals).slice(0, 3),
        sectorField ? `Using "${sectorField}" as sector field` : 'No sector field detected on deals board',
        valueField ? `Using "${valueField}" as deal value field` : 'No numeric value field detected on deals board',
      ].filter(Boolean),
    };
  }

  // ─── Operations Analysis ───────────────────────────────────────────────────
  if (focusAreas.includes('operations')) {
    const statusField = findFieldName(workOrders[0], ['status', 'state', 'progress']);
    const statusAgg = statusField
      ? aggregate(workOrders, statusField, statusField, 'count')
      : null;

    const completedCount = statusAgg?.groups.find((g) =>
      ['completed', 'done', 'finished'].includes(g.groupKey.toLowerCase())
    )?.value ?? 0;

    const inProgressCount = statusAgg?.groups.find((g) =>
      ['in_progress', 'in progress', 'ongoing', 'active'].includes(g.groupKey.toLowerCase())
    )?.value ?? 0;

    // Check for overdue: compare due date to today
    const today = new Date().toISOString().split('T')[0];
    const dueDateField = findFieldName(workOrders[0], ['due date', 'deadline', 'end date', 'delivery date']);
    const overdueCount = dueDateField
      ? workOrders.filter((wo) => {
          const dueDate = wo.fields[dueDateField]?.normalized;
          const statusKey = findFieldName(wo, ['status', 'state']);
          const status = statusKey ? String(wo.fields[statusKey]?.normalized ?? '').toLowerCase() : '';
          const isComplete = ['completed', 'done', 'cancelled'].includes(status);
          return typeof dueDate === 'string' && dueDate < today && !isComplete;
        }).length
      : 0;

    summary.operations = {
      totalWorkOrders: workOrders.length,
      byStatus: statusAgg?.groups.map((g) => ({ status: g.groupKey, count: g.value })) ?? [],
      completedCount,
      inProgressCount,
      overdueCount,
      completionRate:
        workOrders.length > 0 ? Math.round((completedCount / workOrders.length) * 100) : 0,
      dataQualityNotes: summarizeDataIssues(workOrders).slice(0, 5),
    };
  }

  // ─── Cross-Board Insights ──────────────────────────────────────────────────
  if (focusAreas.includes('cross_board')) {
    const matchResult = matchAcrossBoards(deals, workOrders);

    summary.crossBoardInsights = {
      totalDeals: deals.length,
      totalWorkOrders: workOrders.length,
      matchedRecords: matchResult.matched.length,
      unmatchedDeals: matchResult.unmatchedDeals.length,
      unmatchedWorkOrders: matchResult.unmatchedWorkOrders.length,
      matchRate: Math.round(matchResult.matchRate),
      matchRateNote:
        matchResult.matchRate < 30
          ? 'Low match rate — company names may differ significantly between boards'
          : matchResult.matchRate > 70
          ? 'High match rate — boards are well-aligned'
          : 'Moderate match rate — some manual review may help alignment',
      sampleMatchedCompanies: matchResult.matched
        .slice(0, 5)
        .map((m) => m.matchKey),
    };
  }

  // Overall data quality
  summary.overallDataQualityScore = Math.round(
    (computeDataQualityScore(deals) + computeDataQualityScore(workOrders)) / 2
  );

  return summary;
}

// ─── Field Name Discovery Helpers ────────────────────────────────────────────

function findFieldName(item: NormalizedItem | undefined, hints: string[]): string | null {
  if (!item) return null;
  for (const hint of hints) {
    const key = Object.keys(item.fields).find((k) => k.toLowerCase().includes(hint.toLowerCase()));
    if (key) return key;
  }
  return null;
}

function findNumericFieldName(item: NormalizedItem | undefined, hints: string[]): string | null {
  if (!item) return null;
  for (const hint of hints) {
    const key = Object.keys(item.fields).find(
      (k) =>
        k.toLowerCase().includes(hint.toLowerCase()) &&
        (item.fields[k].type === 'number' || item.fields[k].type === 'currency')
    );
    if (key) return key;
  }
  // Fall back to any numeric field
  return Object.keys(item.fields).find(
    (k) => item.fields[k].type === 'number' || item.fields[k].type === 'currency'
  ) ?? null;
}

// ─── Tool Dispatcher ──────────────────────────────────────────────────────────

export interface ToolResult {
  output: object;
  dataQualityNotes?: string[];
  error?: string;
}

export async function dispatchTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<ToolResult> {
  try {
    let output: object;

    switch (toolName) {
      case 'get_board_schema':
        output = await handleGetBoardSchema(toolInput as unknown as GetBoardSchemaInput);
        break;
      case 'query_board_data':
        output = await handleQueryBoardData(toolInput as unknown as QueryBoardDataInput);
        break;
      case 'generate_leadership_summary':
        output = await handleGenerateLeadershipSummary(toolInput as unknown as GenerateLeadershipSummaryInput);
        break;
      default:
        output = { error: `Unknown tool: ${toolName}` };
    }

    // Extract any data quality notes from the output if present
    const outputWithQuality = output as Record<string, unknown>;
    const dataQualityNotes: string[] = [];

    if (outputWithQuality.data_quality) {
      const dq = outputWithQuality.data_quality as Record<string, unknown>;
      if (Array.isArray(dq.top_issues)) {
        dataQualityNotes.push(...(dq.top_issues as string[]));
      }
    }

    return { output, dataQualityNotes };
  } catch (err) {
    if (err instanceof MondayApiError) {
      const errorOutput = {
        error: err.message,
        error_type: err.isAuthError
          ? 'authentication'
          : err.isRateLimit
          ? 'rate_limit'
          : 'api_error',
        suggestion: err.isAuthError
          ? 'Check MONDAY_API_TOKEN in .env.local'
          : err.isRateLimit
          ? 'Wait 60 seconds and retry'
          : 'Check board ID configuration or Monday.com status',
      };
      return { output: errorOutput, error: err.message };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      output: { error: `Unexpected error: ${message}` },
      error: message,
    };
  }
}
