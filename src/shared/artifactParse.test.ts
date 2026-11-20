import { describe, expect, it } from "vitest";
import { fileNameFor, marker, parseReply, splitStored } from "./artifactParse";

describe("parseReply", () => {
  it("separates prose from tagged artifacts", () => {
    const parts = parseReply(
      'Here you go.\n\n<artifact identifier="shop page" type="html" title="Shop page">\n<h1>Hi</h1>\n</artifact>\nAnything else?',
    );
    expect(parts).toHaveLength(3);
    expect(parts[1]).toEqual({
      type: "artifact",
      artifact: { identifier: "shop-page", title: "Shop page", kind: "html", language: "", content: "<h1>Hi</h1>" },
    });
  });

  it("treats a reply without tags as text and reads code languages", () => {
    expect(parseReply("Just text")).toEqual([{ type: "text", text: "Just text" }]);
    const [part] = parseReply('<artifact title="Sum" language="python">print(1)</artifact>');
    expect(part).toMatchObject({ artifact: { kind: "code", identifier: "sum", language: "python" } });
  });
});

describe("stored markers", () => {
  it("round-trips a marker between text", () => {
    expect(splitStored(`Intro\n${marker("abc", 2)}\nOutro`)).toEqual([
      { type: "text", text: "Intro" },
      { type: "artifact", id: "abc", version: 2 },
      { type: "text", text: "Outro" },
    ]);
  });

  it("names downloads by kind", () => {
    expect(fileNameFor({ title: "Shop page", kind: "html", language: "" })).toBe("shop-page.html");
    expect(fileNameFor({ title: "Notes", kind: "document", language: "" })).toBe("notes.md");
    expect(fileNameFor({ title: "Sum", kind: "code", language: "python" })).toBe("sum.py");
  });
});
