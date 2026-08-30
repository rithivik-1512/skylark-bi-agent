'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage, ChatApiResponse } from '@/types/monday';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UIMessage extends ChatMessage {
  id: string;
  dataQualityNotes?: string[];
  toolsUsed?: string[];
  isError?: boolean;
}

// ─── Quick Prompts ────────────────────────────────────────────────────────────

const SIDEBAR_PROMPTS = [
  { icon: '⚡', label: 'Leadership Update', prompt: 'Prepare a full Q3 leadership update covering pipeline health, revenue performance, and operational execution.' },
  { icon: '📊', label: 'Pipeline by Sector', prompt: 'How is our pipeline looking by sector? Break down active deal value and count by industry.' },
  { icon: '💰', label: 'Won Deals Revenue', prompt: 'What is our total won deals revenue? Show breakdown by sector and deal size.' },
  { icon: '⏳', label: 'Stalled Deals', prompt: 'Which deals appear to be stalled or stuck in the pipeline? Look for deals in negotiation or proposal stages.' },
  { icon: '⚙️', label: 'Work Order Status', prompt: 'Give me a status overview of all work orders — how many are completed, in progress, and overdue?' },
  { icon: '🔗', label: 'Cross-Board Match', prompt: 'How well do our deals align with work orders? Show me the cross-board match analysis.' },
  { icon: '🏆', label: 'Top Sectors', prompt: 'Which sectors are performing best in terms of both pipeline value and work order revenue?' },
  { icon: '📋', label: 'Data Quality Audit', prompt: 'Run a data quality audit on both boards. What data issues should our team fix?' },
];

const WELCOME_CHIPS = [
  { icon: '📊', label: 'Pipeline health overview' },
  { icon: '💰', label: 'Revenue by sector this quarter' },
  { icon: '⚡', label: 'Prepare leadership update' },
  { icon: '⚙️', label: 'Work order completion rates' },
];

// ─── Tool Name Display Map ─────────────────────────────────────────────────────

const TOOL_DISPLAY: Record<string, string> = {
  get_board_schema: '🔍 Inspecting board schema',
  query_board_data: '📡 Querying Monday.com',
  generate_leadership_summary: '📊 Generating leadership summary',
};

// ─── Unique ID Generator ──────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('Thinking...');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [inputValue]);

  // Health check on mount
  useEffect(() => {
    const checkConfig = async () => {
      try {
        // Send a benign ping — if it returns 503 / config error, show warning
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: '.' }] }),
        });
        const data: ChatApiResponse = await res.json();
        if (data.error?.includes('not configured') || data.error?.includes('ANTHROPIC') || data.error?.includes('MONDAY')) {
          setIsConfigured(false);
        } else {
          setIsConfigured(true);
        }
      } catch {
        setIsConfigured(false);
      }
    };
    checkConfig();
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isLoading) return;

      setErrorBanner(null);
      setInputValue('');

      const userMsg: UIMessage = {
        id: genId(),
        role: 'user',
        content: trimmed,
      };

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setIsLoading(true);
      setLoadingStage('Thinking...');

      // Simulate progressive loading stages
      const stages = [
        { delay: 1200, label: '🔍 Querying Monday.com boards...' },
        { delay: 3000, label: '🧹 Normalizing data...' },
        { delay: 5500, label: '🧠 Analyzing business metrics...' },
        { delay: 8000, label: '✍️ Preparing insights...' },
      ];
      const timers: ReturnType<typeof setTimeout>[] = [];
      stages.forEach(({ delay, label }) => {
        timers.push(setTimeout(() => setLoadingStage(label), delay));
      });

      try {
        const apiMessages = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages }),
        });

        const data: ChatApiResponse = await res.json();

        if (!res.ok || data.error) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const assistantMsg: UIMessage = {
          id: genId(),
          role: 'assistant',
          content: data.reply,
          dataQualityNotes: data.dataQualityNotes,
          toolsUsed: data.toolsUsed,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorBanner(message);

        const errorMsg: UIMessage = {
          id: genId(),
          role: 'assistant',
          content: `I encountered an error while processing your request:\n\n> ${message}\n\nPlease check your API configuration and try again.`,
          isError: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        timers.forEach(clearTimeout);
        setIsLoading(false);
        setLoadingStage('Thinking...');
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    },
    [messages, isLoading]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setErrorBanner(null);
    textareaRef.current?.focus();
  };

  return (
    <div className="app-container">
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="sidebar" role="complementary" aria-label="Quick prompts sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" aria-hidden="true">🚁</div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">ARIA</span>
            <span className="sidebar-logo-subtitle">Skylark BI Agent</span>
          </div>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-section-label">Quick Insights</p>
          {SIDEBAR_PROMPTS.map((p, i) => (
            <button
              key={i}
              id={`quick-prompt-${i}`}
              className="quick-prompt-btn"
              onClick={() => sendMessage(p.prompt)}
              disabled={isLoading}
              aria-label={`Quick prompt: ${p.label}`}
            >
              <span className="quick-prompt-icon" aria-hidden="true">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-bottom">
          <div className="status-badge" role="status" aria-live="polite">
            <div
              className={`status-dot ${isConfigured === false ? 'offline' : ''}`}
              aria-hidden="true"
            />
            {isConfigured === false
              ? 'Config needed'
              : isConfigured === true
              ? 'Connected to Monday.com'
              : 'Checking connection...'}
          </div>
        </div>
      </aside>

      {/* ── Main Chat ──────────────────────────────────────────────────── */}
      <main className="main-area" role="main">
        {/* Header */}
        <header className="chat-header">
          <div className="chat-header-info">
            <div className="header-avatar" aria-hidden="true">🤖</div>
            <div>
              <div className="header-title">ARIA — Business Intelligence Agent</div>
              <div className="header-subtitle">Monday.com live data</div>
            </div>
          </div>
          <div className="header-actions">
            <button
              id="clear-chat-btn"
              className="header-btn"
              onClick={handleClearChat}
              aria-label="Clear conversation"
            >
              🗑 Clear
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="messages-area" role="log" aria-live="polite" aria-label="Conversation">
          <div className="messages-inner">
            {messages.length === 0 ? (
              /* Welcome Screen */
              <div className="welcome-screen">
                <div className="welcome-glow" aria-hidden="true">🚁</div>
                <h1 className="welcome-title">Ask ARIA Anything</h1>
                <p className="welcome-subtitle">
                  Get instant, executive-grade insights from your Monday.com deals pipeline
                  and work orders — powered by AI and real-time data.
                </p>
                <div className="welcome-chips" role="list" aria-label="Suggested queries">
                  {WELCOME_CHIPS.map((chip, i) => (
                    <button
                      key={i}
                      id={`welcome-chip-${i}`}
                      className="welcome-chip"
                      role="listitem"
                      onClick={() => sendMessage(chip.label)}
                      aria-label={`Try: ${chip.label}`}
                    >
                      <span aria-hidden="true">{chip.icon}</span>
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Message Thread */
              <>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`message-row ${msg.role}`}
                    role="article"
                    aria-label={`${msg.role === 'user' ? 'You' : 'ARIA'} said`}
                  >
                    <div className={`message-avatar ${msg.role}`} aria-hidden="true">
                      {msg.role === 'assistant' ? '🤖' : '👤'}
                    </div>

                    <div className="message-content-wrapper">
                      {/* Message bubble */}
                      <div
                        className={`message-bubble ${msg.role} ${msg.isError ? 'error' : ''}`}
                      >
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              // Open external links in new tab
                              a: ({ ...props }) => (
                                <a {...props} target="_blank" rel="noopener noreferrer" />
                              ),
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          <span>{msg.content}</span>
                        )}
                      </div>

                      {/* Tools used tags */}
                      {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                        <div className="tools-used-row" aria-label="Tools used">
                          {[...new Set(msg.toolsUsed)].map((tool, i) => (
                            <span key={i} className="tool-tag" title={`Tool used: ${tool}`}>
                              {tool}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Data quality callout */}
                      {msg.dataQualityNotes && msg.dataQualityNotes.length > 0 && (
                        <div
                          className="data-quality-callout"
                          role="note"
                          aria-label="Data quality caveats"
                        >
                          <div className="data-quality-header">
                            <span aria-hidden="true">⚠️</span>
                            Data Quality Notes
                          </div>
                          <div className="data-quality-items">
                            {msg.dataQualityNotes.map((note, i) => (
                              <div key={i} className="data-quality-item">
                                {note}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Loading / Thinking Indicator */}
                {isLoading && (
                  <div className="message-row assistant" role="status" aria-label="ARIA is thinking">
                    <div className="message-avatar assistant" aria-hidden="true">🤖</div>
                    <div className="message-content-wrapper">
                      <div className="thinking-bubble" aria-hidden="true">
                        <div className="thinking-dot" />
                        <div className="thinking-dot" />
                        <div className="thinking-dot" />
                        <span className="thinking-label">{loadingStage}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
        </div>

        {/* Input Area */}
        <div className="input-area">
          <div className="input-inner">
            {/* Error Banner */}
            {errorBanner && (
              <div className="error-banner" role="alert" aria-live="assertive">
                <span aria-hidden="true">⚠️</span>
                {errorBanner}
                <button
                  onClick={() => setErrorBanner(null)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px' }}
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}

            <form
              className="input-form"
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(inputValue);
              }}
              aria-label="Message input form"
            >
              <textarea
                id="message-input"
                ref={textareaRef}
                className="input-textarea"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about pipeline health, revenue by sector, leadership updates..."
                disabled={isLoading}
                rows={1}
                aria-label="Type your business intelligence question"
                aria-multiline="true"
              />
              <button
                id="send-message-btn"
                type="submit"
                className="send-btn"
                disabled={isLoading || !inputValue.trim()}
                aria-label="Send message"
              >
                {isLoading ? '⏳' : '↑'}
              </button>
            </form>

            <p className="input-hint">
              Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line · Data sourced live from Monday.com
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
