import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "../badge";

describe("Badge", () => {
  it("renders with children text", () => {
    render(<Badge>Status</Badge>);
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("applies secondary variant by default", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    expect(badge.className).toContain("bg-slate-100");
    expect(badge.className).toContain("text-slate-700");
  });

  it("applies default variant classes", () => {
    render(<Badge variant="default">Primary</Badge>);
    const badge = screen.getByText("Primary");
    expect(badge.className).toContain("bg-slate-900");
    expect(badge.className).toContain("text-white");
  });

  it("applies outline variant classes", () => {
    render(<Badge variant="outline">Outline</Badge>);
    const badge = screen.getByText("Outline");
    expect(badge.className).toContain("border-slate-200");
    expect(badge.className).not.toContain("bg-slate-900");
    expect(badge.className).not.toContain("bg-slate-100");
  });

  it("merges custom className", () => {
    render(<Badge className="custom-class">Custom</Badge>);
    const badge = screen.getByText("Custom");
    expect(badge.className).toContain("custom-class");
    expect(badge.className).toContain("inline-flex");
  });
});
