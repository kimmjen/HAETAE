import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HaetaeLogo } from "./HaetaeLogo";

describe("HaetaeLogo", () => {
  it("renders an SVG root", () => {
    const { container } = render(<HaetaeLogo />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("defaults to 32px", () => {
    const { container } = render(<HaetaeLogo />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("32");
    expect(svg.getAttribute("height")).toBe("32");
  });

  it("honours the size prop", () => {
    const { container } = render(<HaetaeLogo size={48} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("48");
    expect(svg.getAttribute("height")).toBe("48");
  });

  it("merges custom classes through cn", () => {
    const { container } = render(<HaetaeLogo className="text-accent" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("text-accent");
  });
});
