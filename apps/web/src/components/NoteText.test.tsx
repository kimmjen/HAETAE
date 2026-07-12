import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoteText } from "./NoteText";

describe("NoteText", () => {
  it("drops [[ ]] brackets and uses the slug as the label", () => {
    const { container } = render(<NoteText content="see [[foo-bar]] now" />);
    expect(container.textContent).toBe("see foo-bar now");
  });

  it("uses the alias for [[slug|alias]]", () => {
    const { container } = render(<NoteText content="a [[x-y|별칭]] b" />);
    expect(container.textContent).toBe("a 별칭 b");
  });

  it("styles each wikilink as an accent span", () => {
    const { container } = render(<NoteText content="[[a]] and [[b]]" />);
    const spans = container.querySelectorAll("span.text-accent");
    expect(spans).toHaveLength(2);
    expect([...spans].map((s) => s.textContent)).toEqual(["a", "b"]);
  });

  it("leaves plain prose unchanged", () => {
    const { container } = render(<NoteText content="링크 없는 문장" />);
    expect(container.textContent).toBe("링크 없는 문장");
    expect(container.querySelectorAll("span.text-accent")).toHaveLength(0);
  });
});
