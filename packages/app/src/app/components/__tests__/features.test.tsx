import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

import { Features } from "../features";

describe("Features", () => {
  it("renders a grid section", () => {
    const { container } = render(<Features />);
    expect(container.querySelector("section")).toBeInTheDocument();
  });

  it("renders 6 feature cards", () => {
    const { container } = render(<Features />);
    const cards = container.querySelectorAll("section > div");
    expect(cards.length).toBe(6);
  });

  it("renders feature titles as i18n keys", () => {
    render(<Features />);
    expect(screen.getByText("components.features.i080")).toBeInTheDocument();
    expect(screen.getByText("components.features.i082")).toBeInTheDocument();
    expect(screen.getByText("components.features.i084")).toBeInTheDocument();
  });

  it("renders feature descriptions as i18n keys", () => {
    render(<Features />);
    expect(screen.getByText("components.features.i081")).toBeInTheDocument();
    expect(screen.getByText("components.features.i083")).toBeInTheDocument();
  });

  it("renders icons inside each card", () => {
    const { container } = render(<Features />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(6);
  });
});
