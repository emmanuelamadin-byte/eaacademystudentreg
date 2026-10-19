import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ViewerWatermark } from "../src/components/viewer-watermark";

describe("ViewerWatermark component", () => {
  it("renders nothing when name is not provided or empty", () => {
    const htmlEmpty = renderToString(React.createElement(ViewerWatermark, { name: "" }));
    expect(htmlEmpty).toBe("");

    const htmlUndefined = renderToString(React.createElement(ViewerWatermark));
    expect(htmlUndefined).toBe("");

    const htmlWhitespace = renderToString(React.createElement(ViewerWatermark, { name: "   " }));
    expect(htmlWhitespace).toBe("");
  });

  it("renders non-intrusive watermark containing the student's name", () => {
    const html = renderToString(React.createElement(ViewerWatermark, { name: "Emmanuel Amadin" }));
    expect(html).toContain("Emmanuel Amadin");
    expect(html).toContain("viewer-watermark");
    expect(html).toContain("pointer-events:none");
    expect(html).toContain("opacity:0.2");
  });
});
