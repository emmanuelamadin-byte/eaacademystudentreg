import { describe, it, expect } from "vitest";
import { readLimitedBody } from "../src/server/request-body";
describe("request body limits", () => {
  it("reads a normal request", async () => {
    const bytes = await readLimitedBody(
      new Request("https://example.com", { method: "POST", body: "hello" }),
      10,
    );
    expect(new TextDecoder().decode(bytes)).toBe("hello");
  });
  it("rejects oversized input even without a content-length header", async () => {
    await expect(
      readLimitedBody(
        new Request("https://example.com", {
          method: "POST",
          body: "01234567890",
        }),
        10,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
