/**
 * POST /api/chat
 * Main chat endpoint — receives conversation history, runs the agent loop,
 * returns the reply and data quality notes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAgent } from '@/lib/agent';
import { ChatMessage, ChatApiResponse } from '@/types/monday';

export const runtime = 'nodejs'; // Required for Anthropic SDK + fetch

export async function POST(req: NextRequest): Promise<NextResponse<ChatApiResponse>> {
  let messages: ChatMessage[];

  try {
    const body = await req.json();
    messages = body.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { reply: '', dataQualityNotes: [], toolsUsed: [], error: 'Invalid request: messages array is required.' },
        { status: 400 }
      );
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content || !['user', 'assistant'].includes(msg.role)) {
        return NextResponse.json(
          { reply: '', dataQualityNotes: [], toolsUsed: [], error: 'Invalid message format. Each message must have role (user|assistant) and content.' },
          { status: 400 }
        );
      }
    }
  } catch {
    return NextResponse.json(
      { reply: '', dataQualityNotes: [], toolsUsed: [], error: 'Invalid JSON in request body.' },
      { status: 400 }
    );
  }

  try {
    const result = await runAgent(messages);

    return NextResponse.json({
      reply: result.reply,
      dataQualityNotes: result.dataQualityNotes,
      toolsUsed: result.toolsUsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Differentiate error types for appropriate status codes
    const statusCode =
      message.includes('ANTHROPIC_API_KEY') || message.includes('MONDAY_API_TOKEN')
        ? 503
        : message.includes('authentication')
        ? 401
        : message.includes('rate limit')
        ? 429
        : 500;

    console.error('[/api/chat] Agent error:', message);

    return NextResponse.json(
      {
        reply: '',
        dataQualityNotes: [],
        toolsUsed: [],
        error: sanitizeErrorForClient(message),
      },
      { status: statusCode }
    );
  }
}

/**
 * Sanitize error messages — remove internal paths, tokens, or stack traces.
 * Return a user-friendly version.
 */
function sanitizeErrorForClient(message: string): string {
  if (message.includes('GROQ_API_KEY')) {
    return 'The AI service is not configured. Please set GROQ_API_KEY in your environment.';
  }
  if (message.includes('MONDAY_API_TOKEN')) {
    return 'Monday.com integration is not configured. Please set MONDAY_API_TOKEN in your environment.';
  }
  if (message.includes('MONDAY_DEALS_BOARD_ID') || message.includes('MONDAY_WORK_ORDERS_BOARD_ID')) {
    return 'Monday.com board IDs are not configured. Please set MONDAY_DEALS_BOARD_ID and MONDAY_WORK_ORDERS_BOARD_ID in your environment.';
  }
  if (message.includes('rate limit')) {
    return 'Rate limit reached. Please wait a moment and try again.';
  }
  if (message.includes('authentication') || message.includes('401') || message.includes('403')) {
    return 'Authentication failed. Please verify your API tokens are valid.';
  }
  // Generic error — trim to 200 chars to avoid leaking internals
  return message.length > 200 ? message.slice(0, 200) + '...' : message;
}
