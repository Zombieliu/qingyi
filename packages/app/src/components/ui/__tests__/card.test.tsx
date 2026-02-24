import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardHeader, CardContent } from "../card";

describe("Card", () => {
  it("renders Card with children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies default Card classes", () => {
    render(<Card data-testid="card">Content</Card>);
    const card = screen.getByTestId("card");
    expect(card.className).toContain("rounded-xl");
    expect(card.className).toContain("border");
    expect(card.className).toContain("bg-white");
    expect(card.className).toContain("shadow-sm");
  });

  it("renders CardHeader with children", () => {
    render(<CardHeader data-testid="header">Header text</CardHeader>);
    const header = screen.getByTestId("header");
    expect(header).toHaveTextContent("Header text");
    expect(header.className).toContain("flex");
    expect(header.className).toContain("items-center");
  });

  it("renders CardContent with children", () => {
    render(<CardContent data-testid="content">Body text</CardContent>);
    const content = screen.getByTestId("content");
    expect(content).toHaveTextContent("Body text");
    expect(content.className).toContain("text-sm");
    expect(content.className).toContain("text-slate-600");
  });

  it("composes Card with header and content", () => {
    render(
      <Card data-testid="card">
        <CardHeader data-testid="header">Title</CardHeader>
        <CardContent data-testid="content">Description</CardContent>
      </Card>
    );
    const card = screen.getByTestId("card");
    expect(card).toContainElement(screen.getByTestId("header"));
    expect(card).toContainElement(screen.getByTestId("content"));
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
  });
});
