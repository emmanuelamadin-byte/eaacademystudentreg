"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Sparkles,
  Send,
  RotateCcw,
  Bot,
  User,
  Copy,
  Check,
  Lock,
  ArrowRight,
  Code,
  CheckCircle2,
  AlertCircle,
  Compass,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAcademy } from "@/components/academy-provider";
import { api } from "@/lib/api";
import { isPremium, TRACKS } from "@/lib/types";

type Message = {
  role: "user" | "model";
  text: string;
  codeSnippet?: string;
  timestamp: string;
};

const PROMPT_SUGGESTIONS: Record<string, string[]> = {
  "system-dev": [
    "Explain how database indexes work under the hood with a simple analogy.",
    "Review my code for edge cases, performance bottlenecks, and security bugs.",
    "What are the most common technical interview questions for full-stack developers?",
    "How should I structure a production Next.js App Router project with Supabase?",
  ],
  "creative-media": [
    "How do I pace and cut a 60-second video for maximum viewer retention?",
    "What color grading workflow gives commercial footage a clean, cinematic look?",
    "How should I structure my portfolio case studies to land international clients?",
    "Critique my concept and storytelling hook for a brand documentary.",
  ],
  "business-growth": [
    "Roast my landing page value proposition and suggest 3 high-converting hooks.",
    "How do I design and test a low-budget customer acquisition funnel?",
    "What key metrics (CAC, LTV, Churn) should I measure for subscription growth?",
    "How do I pitch my digital marketing services to high-ticket B2B clients?",
  ],
};

const DEFAULT_SUGGESTIONS = [
  "How should I prioritize my learning goals this month?",
  "How do I transform my classroom projects into a standout client portfolio?",
  "Explain how to overcome imposter syndrome as a tech beginner.",
  "Give me 3 practical project ideas for my career track.",
];

export function AIMentor() {
  const { user } = useAcademy();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [codeSnippet, setCodeSnippet] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const premium = isPremium(user);
  const trackId = user?.enrolledClassId || "system-dev";
  const track = TRACKS.find((t) => t.id === trackId);
  const suggestions = PROMPT_SUGGESTIONS[trackId] || DEFAULT_SUGGESTIONS;

  // Load chat history from localStorage
  useEffect(() => {
    if (!user) return;
    try {
      const stored = localStorage.getItem(`ea_ai_mentor_${user.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      // LocalStorage access issues ignored
    }
  }, [user]);

  // Persist chat history
  useEffect(() => {
    if (!user || !messages.length) return;
    try {
      localStorage.setItem(
        `ea_ai_mentor_${user.id}`,
        JSON.stringify(messages.slice(-30)),
      );
    } catch {
      // LocalStorage quota issues ignored
    }
  }, [messages, user]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const handleSend = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || input).trim();
    if (!promptToSend || busy || !user) return;

    if (!premium) {
      setError(
        "EA AI Mentor is exclusively available to Premium members. Please upgrade to unlock.",
      );
      return;
    }

    const newMessage: Message = {
      role: "user",
      text: promptToSend,
      codeSnippet: codeSnippet.trim() ? codeSnippet.trim() : undefined,
      timestamp: new Date().toISOString(),
    };

    const nextMessages = [...messages, newMessage];
    setMessages(nextMessages);
    setInput("");
    const attachedCode = codeSnippet.trim();
    setCodeSnippet("");
    setShowCodeInput(false);
    setBusy(true);
    setError("");

    try {
      const history = nextMessages.slice(-8, -1).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const response = await api<{ text: string }>("ai.ask", {
        mode: "mentor",
        prompt: promptToSend,
        code: attachedCode || undefined,
        trackId,
        history,
      });

      const assistantMessage: Message = {
        role: "model",
        text: response.text,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "EA AI Mentor is temporarily busy. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleClearHistory = () => {
    if (!user) return;
    setMessages([]);
    setError("");
    try {
      localStorage.removeItem(`ea_ai_mentor_${user.id}`);
    } catch {
      // Ignore
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    void navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!premium) {
    return (
      <div className="learning-surface">
        <header className="page-header">
          <div>
            <span className="eyebrow">PREMIUM EXCLUSIVE</span>
            <h1>EA AI Mentor & Copilot</h1>
            <p className="muted">
              Your 24/7 personal tutor, code reviewer, and creative career
              advisor.
            </p>
          </div>
        </header>

        <section
          className="card"
          style={{
            maxWidth: "880px",
            margin: "0 auto",
            padding: "2.5rem",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "#f8fafc",
            borderRadius: "16px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <Sparkles size={26} />
            </div>
            <div>
              <span
                style={{
                  textTransform: "uppercase",
                  fontSize: "12px",
                  letterSpacing: "0.1em",
                  color: "#fbbf24",
                  fontWeight: 700,
                }}
              >
                Supercharge Your Learning
              </span>
              <h2 style={{ margin: 0, fontSize: "1.75rem", color: "#fff" }}>
                Meet Your EA AI Mentor
              </h2>
            </div>
          </div>

          <p
            style={{
              fontSize: "1.05rem",
              lineHeight: 1.6,
              color: "#cbd5e1",
              marginBottom: "2rem",
            }}
          >
            Get unblocked instantly anytime. EA AI Mentor is grounded in our
            specialized curriculum, trained to provide deep contextual answers,
            step-by-step code analysis, creative feedback, and pre-submission
            assignment evaluations.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1.25rem",
              marginBottom: "2.5rem",
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                padding: "1.25rem",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Code size={22} style={{ color: "#38bdf8", marginBottom: "0.5rem" }} />
              <h4 style={{ color: "#fff", margin: "0 0 0.5rem 0" }}>
                Code & Architecture Review
              </h4>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#94a3b8" }}>
                Paste snippets to spot edge cases, runtime bugs, and optimize
                code structure with line-by-line feedback.
              </p>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                padding: "1.25rem",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <CheckCircle2
                size={22}
                style={{ color: "#4ade80", marginBottom: "0.5rem" }}
              />
              <h4 style={{ color: "#fff", margin: "0 0 0.5rem 0" }}>
                Assignment Pre-Checks
              </h4>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#94a3b8" }}>
                Test your projects and write-ups against rubrics before using
                your monthly official instructor evaluations.
              </p>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                padding: "1.25rem",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Compass
                size={22}
                style={{ color: "#fbbf24", marginBottom: "0.5rem" }}
              />
              <h4 style={{ color: "#fff", margin: "0 0 0.5rem 0" }}>
                Track-Specific Coaching
              </h4>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#94a3b8" }}>
                Tailored for {track?.name || "your track"}: video editing tips,
                growth experiments, and client pitch preparation.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1.5rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div>
              <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>
                ₦3,000
              </span>
              <span style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
                {" "}
                / month · Cancel anytime
              </span>
            </div>
            <Link
              href="/app/billing"
              className="btn btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.85rem 1.75rem",
                fontSize: "1rem",
                fontWeight: 600,
              }}
            >
              <Lock size={17} /> Upgrade to Premium to Unlock
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="learning-surface">
      <header
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.25rem",
            }}
          >
            <span className="eyebrow" style={{ color: "#d97706" }}>
              PREMIUM ASSISTANT
            </span>
            <span
              className="badge"
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                background: "rgba(217, 119, 6, 0.12)",
                color: "#b45309",
                border: "1px solid rgba(217, 119, 6, 0.25)",
              }}
            >
              PRO
            </span>
          </div>
          <h1>EA AI Mentor</h1>
          <p className="muted">
            Personalized guidance for {track?.name || "your career track"}. Ask
            anything about lessons, projects, or career growth.
          </p>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={handleClearHistory}
            title="Start a new chat session"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <RotateCcw size={15} /> New chat
          </button>
        )}
      </header>

      <div
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "680px",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                margin: "auto",
                maxWidth: "600px",
                padding: "2rem 1rem",
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                  color: "#d97706",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "1rem",
                  boxShadow: "0 4px 12px rgba(217, 119, 6, 0.15)",
                }}
              >
                <Sparkles size={28} />
              </div>
              <h2 style={{ fontSize: "1.4rem", marginBottom: "0.5rem" }}>
                How can I assist your learning today?
              </h2>
              <p
                className="muted"
                style={{ fontSize: "0.95rem", marginBottom: "1.5rem" }}
              >
                Choose a suggested topic below or type your question about
                lessons, code snippets, project ideas, or assignments.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: "0.75rem",
                  width: "100%",
                }}
              >
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(suggestion)}
                    style={{
                      textAlign: "left",
                      padding: "0.85rem 1.25rem",
                      borderRadius: "10px",
                      background: "var(--surface-sunken, #f8fafc)",
                      border: "1px solid var(--border-subtle, #e2e8f0)",
                      fontSize: "0.9rem",
                      color: "inherit",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--primary, #0f172a)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor =
                        "var(--border-subtle, #e2e8f0)";
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    <span>{suggestion}</span>
                    <ArrowRight size={15} style={{ opacity: 0.6 }} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((item, index) => {
              const isUser = item.role === "user";
              return (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    gap: "1rem",
                    alignItems: "flex-start",
                    alignSelf: isUser ? "flex-end" : "flex-start",
                    maxWidth: isUser ? "85%" : "95%",
                  }}
                >
                  {!isUser && (
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "10px",
                        background:
                          "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Bot size={20} />
                    </div>
                  )}

                  <div
                    style={{
                      borderRadius: "14px",
                      padding: "1rem 1.25rem",
                      background: isUser
                        ? "var(--primary, #0f172a)"
                        : "var(--surface-sunken, #f8fafc)",
                      color: isUser ? "#fff" : "inherit",
                      border: isUser
                        ? "none"
                        : "1px solid var(--border-subtle, #e2e8f0)",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                      position: "relative",
                      wordBreak: "break-word",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.4rem",
                        gap: "1rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          opacity: isUser ? 0.8 : 0.6,
                          textTransform: "uppercase",
                        }}
                      >
                        {isUser ? "You" : "EA AI Mentor"}
                      </span>
                      {!isUser && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => copyToClipboard(item.text, index)}
                          title="Copy message"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            fontSize: "12px",
                            opacity: 0.7,
                          }}
                        >
                          {copiedIndex === index ? (
                            <>
                              <Check size={13} className="text-emerald" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy size={13} /> Copy
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {item.codeSnippet && (
                      <div
                        style={{
                          marginBottom: "0.75rem",
                          padding: "0.75rem",
                          background: isUser
                            ? "rgba(255,255,255,0.1)"
                            : "#1e293b",
                          color: isUser ? "#e2e8f0" : "#f8fafc",
                          borderRadius: "8px",
                          fontSize: "13px",
                          fontFamily: "monospace",
                          whiteSpace: "pre-wrap",
                          overflowX: "auto",
                        }}
                      >
                        {item.codeSnippet}
                      </div>
                    )}

                    <div
                      className="prose"
                      style={{
                        color: isUser ? "#fff" : "inherit",
                        fontSize: "0.95rem",
                        lineHeight: 1.6,
                      }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {item.text}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {isUser && (
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "10px",
                        background: "var(--navy, #1e293b)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <User size={18} />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {busy && (
            <div
              style={{
                display: "flex",
                gap: "1rem",
                alignItems: "center",
                color: "var(--color-muted, #64748b)",
                fontSize: "0.9rem",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background:
                    "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={18} className="spin" />
              </div>
              <span>EA AI Mentor is analyzing and preparing your response…</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {error && (
          <div
            style={{
              padding: "0.75rem 1.75rem",
              background: "#fee2e2",
              color: "#991b1b",
              fontSize: "0.9rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              borderTop: "1px solid #fecaca",
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div
          style={{
            padding: "1.25rem 1.75rem",
            borderTop: "1px solid var(--border-subtle, #e2e8f0)",
            background: "var(--surface, #fff)",
          }}
        >
          {showCodeInput && (
            <div style={{ marginBottom: "0.75rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  marginBottom: "4px",
                  color: "var(--color-muted, #64748b)",
                }}
              >
                Paste Code or Draft for Analysis
              </label>
              <textarea
                rows={4}
                value={codeSnippet}
                onChange={(e) => setCodeSnippet(e.target.value)}
                placeholder="Paste code snippet, query, or text draft to review..."
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  border: "1px solid var(--border-subtle, #e2e8f0)",
                  background: "var(--surface-sunken, #f8fafc)",
                }}
              />
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}
          >
            <div style={{ flex: 1, position: "relative" }}>
              <textarea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Ask your mentor a question, ask for code help, or press Shift+Enter for new line..."
                style={{
                  width: "100%",
                  borderRadius: "10px",
                  padding: "0.75rem 1rem",
                  border: "1px solid var(--border-subtle, #e2e8f0)",
                  resize: "none",
                  fontSize: "0.95rem",
                  lineHeight: 1.5,
                }}
              />
              <button
                type="button"
                onClick={() => setShowCodeInput(!showCodeInput)}
                className="text-button"
                style={{
                  position: "absolute",
                  right: "10px",
                  bottom: "10px",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  color: showCodeInput ? "var(--primary, #0f172a)" : "#64748b",
                }}
                title={showCodeInput ? "Hide code snippet" : "Attach code snippet"}
              >
                <Code size={14} />
                {showCodeInput ? "Hide Code" : "Add Code"}
              </button>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || (!input.trim() && !codeSnippet.trim())}
              style={{
                height: "50px",
                padding: "0 1.25rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexShrink: 0,
              }}
            >
              <Send size={16} />
              <span>{busy ? "Thinking…" : "Send"}</span>
            </button>
          </form>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "0.5rem",
              fontSize: "12px",
              color: "var(--color-muted, #94a3b8)",
            }}
          >
            <span>AI suggestions are advisory. Human instructors grade official assignments.</span>
            <span>Premium member · Up to 15 daily requests</span>
          </div>
        </div>
      </div>
    </div>
  );
}
