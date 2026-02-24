import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

import { Hero } from "../hero";

describe("Hero", () => {
  it("renders the section element", () => {
    const { container } = render(<Hero />);
    expect(container.querySelector("section")).toBeInTheDocument();
  });

  it("renders the main heading text", () => {
    render(<Hero />);
    expect(screen.getByText(/找到可靠队友、实时语音、战术指挥/)).toBeInTheDocument();
  });

  it("renders the tagline badge", () => {
    render(<Hero />);
    expect(screen.getByText(/专注《三角洲行动》陪玩/)).toBeInTheDocument();
  });

  it("renders the description paragraph", () => {
    render(<Hero />);
    expect(screen.getByText(/Delta Link 帮你在 PC/)).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    render(<Hero />);
    expect(screen.getByText("立即开黑")).toBeInTheDocument();
    expect(screen.getByText("下载到桌面")).toBeInTheDocument();
  });

  it("renders translated stat keys", () => {
    render(<Hero />);
    expect(screen.getByText("ui.hero.482")).toBeInTheDocument();
    expect(screen.getByText("ui.hero.483")).toBeInTheDocument();
  });
});
