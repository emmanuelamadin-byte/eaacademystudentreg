import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AcademyUser } from "../src/lib/types";

const mockGenerateContent = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    })),
  };
});
vi.mock("../src/server/supabase", () => ({
  limit: vi.fn().mockResolvedValue(undefined),
  document: vi.fn().mockImplementation(async (_col, id) => ({
    id,
    title: "Test Assignment",
    brief: "Build a web app",
  })),
}));
vi.mock("../src/server/academy", () => ({
  getLesson: vi.fn().mockResolvedValue({
    id: "lesson-1",
    title: "Intro Lesson",
    content: "Lesson content here",
    videoUrl: "https://youtube.com/watch?v=demo",
  }),
  listClassroomLessons: vi.fn().mockResolvedValue([
    {
      id: "lesson-1",
      title: "Intro to System Engineering",
      content: "Overview of system design",
      videoUrl: "https://youtube.com/watch?v=demo",
      classId: "system-dev",
    },
  ]),
}));

import { askAI } from "../src/server/ai";

describe("EA AI Mentor and learning assistant boundaries", () => {
  const freeStudent: AcademyUser = {
    id: "free-user",
    email: "free@example.com",
    name: "Free Student",
    role: "Student",
    enrolledClassId: "system-dev",
    membershipPlan: "Free",
    enrolledAt: new Date().toISOString(),
  };

  const premiumStudent: AcademyUser = {
    ...freeStudent,
    id: "premium-user",
    email: "premium@example.com",
    membershipPlan: "Premium",
    premiumGranted: true,
    premiumUntil: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("serves curriculum-grounded fallback response when GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    const result = await askAI(premiumStudent, {
      mode: "tutor",
      lessonId: "lesson-1",
      prompt: "Explain the main concept of this lesson",
    });
    expect(result).toHaveProperty("text");
    expect((result as { text: string }).text).toContain("Intro Lesson");
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("allows limited lesson AI tutor (mode=tutor) for free tier students with 5/day limit", async () => {
    const { limit } = await import("../src/server/supabase");
    mockGenerateContent.mockResolvedValueOnce({
      text: "Here is a helpful explanation of the intro lesson.",
    });

    const result = await askAI(freeStudent, {
      mode: "tutor",
      lessonId: "lesson-1",
      prompt: "Can you explain this lesson?",
    });

    expect(result).toEqual({
      text: "Here is a helpful explanation of the intro lesson.",
    });
    expect(limit).toHaveBeenCalledWith(
      freeStudent.id,
      "ai-day",
      5,
      86400,
      expect.stringContaining("5"),
    );
  });

  it("rejects AI Mentor requests for free tier students", async () => {
    await expect(
      askAI(freeStudent, {
        mode: "mentor",
        prompt: "Help me learn React",
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("Premium"),
    });
  });

  it("rejects AI review and test generation for free tier students", async () => {
    await expect(
      askAI(freeStudent, {
        mode: "review",
        prompt: "Review my code",
        code: "const x = 1;",
      }),
    ).rejects.toMatchObject({
      status: 403,
    });

    await expect(
      askAI(freeStudent, {
        mode: "tests",
        prompt: "Generate tests",
        code: "function add(a, b) { return a + b; }",
      }),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects curriculum drafting for student accounts", async () => {
    await expect(
      askAI(premiumStudent, {
        mode: "curriculum",
        prompt: "Draft a new track",
      }),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows AI Mentor for Premium students with conversation history and sanitizes consecutive user turns", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: "Here is your mentor guidance for System Development.",
    });

    const result = await askAI(premiumStudent, {
      mode: "mentor",
      prompt: "Can you explain closures with an example?",
      trackId: "system-dev",
      history: [
        { role: "user", text: "Hi mentor" },
        { role: "model", text: "Hello! What are you working on today?" },
        { role: "user", text: "Orphaned retry message" },
      ],
    });

    expect(result).toEqual({
      text: "Here is your mentor guidance for System Development.",
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.contents).toHaveLength(3);
    expect(callArgs.contents[0]).toEqual({
      role: "user",
      parts: [{ text: "Hi mentor" }],
    });
    expect(callArgs.contents[1]).toEqual({
      role: "model",
      parts: [{ text: "Hello! What are you working on today?" }],
    });
    expect(callArgs.contents[2]).toEqual({
      role: "user",
      parts: [{ text: "Can you explain closures with an example?" }],
    });
    expect(callArgs.config.systemInstruction).toContain("AI Mentor");
    expect(callArgs.config.systemInstruction).toContain("System Development");
  });

  it("allows advisory AI reviews for Premium students with assignment context", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: "Strengths: Good component structure. Advisory Rating: 88/100.",
    });

    const result = await askAI(premiumStudent, {
      mode: "review",
      prompt: "Review my submission draft",
      assignmentId: "task-101",
      code: "Repository: https://github.com/test/repo",
    });

    expect(result).toEqual({
      text: "Strengths: Good component structure. Advisory Rating: 88/100.",
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.config.systemInstruction).toContain("Test Assignment");
  });

  it("enforces strict rate limits: platform daily cap and 15 requests per student", async () => {
    const { limit } = await import("../src/server/supabase");
    mockGenerateContent.mockResolvedValueOnce({ text: "Hello" });

    await askAI(premiumStudent, {
      mode: "mentor",
      prompt: "Quick question",
    });

    expect(limit).toHaveBeenCalledWith(
      "platform-global",
      "ai-platform-daily",
      300,
      86400,
      expect.stringContaining("platform AI quota"),
    );

    expect(limit).toHaveBeenCalledWith(
      premiumStudent.id,
      "ai-day",
      15,
      86400,
      expect.stringContaining("15"),
    );

    expect(limit).toHaveBeenCalledWith(
      premiumStudent.id,
      "ai-minute",
      2,
      60,
      expect.any(String),
    );
  });

  it("rejects oversized prompt inputs to prevent high token usage", async () => {
    const hugePrompt = "a".repeat(15000);
    await expect(
      askAI(premiumStudent, {
        mode: "mentor",
        prompt: hugePrompt,
      }),
    ).rejects.toThrow();
  });
});
