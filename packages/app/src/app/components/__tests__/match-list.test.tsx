import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

vi.mock("./lobby-card", () => ({
  LobbyCard: (props: { title: string }) => <div data-testid="lobby-card">{props.title}</div>,
}));

import { MatchList } from "../match-list";

describe("MatchList", () => {
  it("renders the section heading", () => {
    render(<MatchList />);
    expect(screen.getByText("ui.match-list.495")).toBeInTheDocument();
  });

  it("renders Live Lobbies label", () => {
    render(<MatchList />);
    expect(screen.getByText("Live Lobbies")).toBeInTheDocument();
  });

  it("renders the publish room button", () => {
    render(<MatchList />);
    expect(screen.getByText("发布房间")).toBeInTheDocument();
  });

  it("renders lobby cards", () => {
    const { container } = render(<MatchList />);
    // Should render 3 lobbies
    expect(container.querySelector(".space-y-3")).toBeInTheDocument();
  });
});
