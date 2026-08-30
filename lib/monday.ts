/**
 * Monday.com GraphQL API v2 Client
 * Handles authentication, pagination, schema discovery, and error resilience.
 */

import {
  BoardSchema,
  RawMondayItem,
} from '@/types/monday';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const API_VERSION = '2024-01';

// In-memory schema cache (cleared per request lifecycle via module scope in Next.js serverless)
const schemaCache = new Map<string, BoardSchema>();

export class MondayApiError extends Error {
  public readonly statusCode?: number;
  public readonly graphqlErrors?: unknown[];
  public readonly isRateLimit: boolean;
  public readonly isAuthError: boolean;

  constructor(
    message: string,
    opts: {
      statusCode?: number;
      graphqlErrors?: unknown[];
      isRateLimit?: boolean;
      isAuthError?: boolean;
    } = {}
  ) {
    super(message);
    this.name = 'MondayApiError';
    this.statusCode = opts.statusCode;
    this.graphqlErrors = opts.graphqlErrors;
    this.isRateLimit = opts.isRateLimit ?? false;
    this.isAuthError = opts.isAuthError ?? false;
  }
}

async function mondayGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    throw new MondayApiError(
      'MONDAY_API_TOKEN is not configured. Please set it in .env.local.',
      { isAuthError: true }
    );
  }

  let response: Response;
  try {
    response = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
        'API-Version': API_VERSION,
      },
      body: JSON.stringify({ query, variables }),
      // 30-second timeout
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new MondayApiError('Monday.com API request timed out after 30 seconds.');
    }
    throw new MondayApiError(`Network error connecting to Monday.com: ${String(err)}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new MondayApiError(
      'Monday.com authentication failed. Verify your MONDAY_API_TOKEN is valid and active.',
      { statusCode: response.status, isAuthError: true }
    );
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After') ?? '60';
    throw new MondayApiError(
      `Monday.com rate limit hit. Retry after ${retryAfter} seconds.`,
      { statusCode: 429, isRateLimit: true }
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable body)');
    throw new MondayApiError(
      `Monday.com API returned HTTP ${response.status}: ${body.slice(0, 300)}`,
      { statusCode: response.status }
    );
  }

  const json = await response.json();

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors
      .map((e: { message?: string }) => e.message ?? JSON.stringify(e))
      .join('; ');
    throw new MondayApiError(`Monday.com GraphQL errors: ${messages}`, {
      graphqlErrors: json.errors,
    });
  }

  return json.data as T;
}

/**
 * Fetch the schema (column definitions) for a board.
 * Results are cached in-memory for the lifetime of the serverless function.
 */
export async function getBoardSchema(boardId: string): Promise<BoardSchema> {
  if (schemaCache.has(boardId)) {
    return schemaCache.get(boardId)!;
  }

  const query = `
    query GetBoardSchema($boardId: ID!) {
      boards(ids: [$boardId]) {
        id
        name
        columns {
          id
          title
          type
        }
      }
    }
  `;

  const data = await mondayGraphQL<{
    boards: Array<{
      id: string;
      name: string;
      columns: Array<{ id: string; title: string; type: string }>;
    }>;
  }>(query, { boardId });

  if (!data.boards || data.boards.length === 0) {
    throw new MondayApiError(
      `Board with ID ${boardId} not found. Check your MONDAY_WORK_ORDERS_BOARD_ID / MONDAY_DEALS_BOARD_ID environment variables.`
    );
  }

  const board = data.boards[0];
  const schema: BoardSchema = {
    id: board.id,
    name: board.name,
    columns: board.columns,
  };

  schemaCache.set(boardId, schema);
  return schema;
}

/**
 * Fetch ALL items from a board using cursor-based pagination.
 * Monday.com limits items_page to 100 per request.
 */
export async function queryBoardItems(boardId: string): Promise<RawMondayItem[]> {
  const allItems: RawMondayItem[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const MAX_PAGES = 50; // Safety cap: 50 × 100 = 5000 items max

  // First page (no cursor)
  const firstPageQuery = `
    query GetBoardItemsFirst($boardId: ID!) {
      boards(ids: [$boardId]) {
        items_page(limit: 100) {
          cursor
          items {
            id
            name
            column_values {
              id
              column {
                title
                type
              }
              value
              text
            }
          }
        }
      }
    }
  `;

  const firstData = await mondayGraphQL<{
    boards: Array<{
      items_page: {
        cursor: string | null;
        items: RawMondayItem[];
      };
    }>;
  }>(firstPageQuery, { boardId });

  if (!firstData.boards || firstData.boards.length === 0) {
    throw new MondayApiError(`Board ${boardId} not found during item query.`);
  }

  const firstPage = firstData.boards[0].items_page;
  allItems.push(...firstPage.items);
  cursor = firstPage.cursor;
  pageCount++;

  // Subsequent pages (with cursor)
  const nextPageQuery = `
    query GetBoardItemsNext($cursor: String!) {
      next_items_page(limit: 100, cursor: $cursor) {
        cursor
        items {
          id
          name
          column_values {
            id
            column {
              title
              type
            }
            value
            text
          }
        }
      }
    }
  `;

  while (cursor && pageCount < MAX_PAGES) {
    const nextData = await mondayGraphQL<{
      next_items_page: {
        cursor: string | null;
        items: RawMondayItem[];
      };
    }>(nextPageQuery, { cursor });

    allItems.push(...nextData.next_items_page.items);
    cursor = nextData.next_items_page.cursor;
    pageCount++;
  }

  return allItems;
}

/**
 * Returns the configured board IDs from environment variables.
 * Throws a descriptive error if not configured.
 */
export function getBoardIds(): { deals: string; workOrders: string } {
  const deals = process.env.MONDAY_DEALS_BOARD_ID;
  const workOrders = process.env.MONDAY_WORK_ORDERS_BOARD_ID;

  if (!deals || !workOrders) {
    const missing = [
      !deals && 'MONDAY_DEALS_BOARD_ID',
      !workOrders && 'MONDAY_WORK_ORDERS_BOARD_ID',
    ]
      .filter(Boolean)
      .join(', ');
    throw new MondayApiError(
      `Missing Monday.com board configuration: ${missing}. Please set these in .env.local.`
    );
  }

  return { deals, workOrders };
}
