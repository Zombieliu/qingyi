import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

import { LobbyCard } from "../lobby-card";

const defaultProps = {
  title: "测试房间",
  level: "SR 1600",
  mode: "排位",
  slots: "3/5",
  voice: true,
  verified: false,
};

describe("LobbyCard", () => {
  it("renders the title", () => {
    render(<LobbyCard {...defaultProps} />);
    expect(screen.getByText("测试房间")).toBeInTheDocument();
  });

  it("renders level and mode", () => {
    render(<LobbyCard {...defaultProps} />);
    expect(screen.getByText("SR 1600 · 排位")).toBeInTheDocument();
  });

  it("renders slots count", () => {
    render(<LobbyCard {...defaultProps} />);
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("shows voice indicator when voice is true", () => {
    render(<LobbyCard {...defaultProps} voice={true} />);
    expect(screen.getByText("语音中")).toBeInTheDocument();
  });

  it("hides voice indicator when voice is false", () => {
    render(<LobbyCard {...defaultProps} voice={false} />);
    expect(screen.queryByText("语音中")).not.toBeInTheDocument();
  });

  it("shows verified badge when verified", () => {
    render(<LobbyCard {...defaultProps} verified={true} />);
    expect(screen.getByText("认证")).toBeInTheDocument();
  });

  it("hides verified badge when not verified", () => {
    render(<LobbyCard {...defaultProps} verified={false} />);
    expect(screen.queryByText("认证")).not.toBeInTheDocument();
  });

  it("renders first 2 chars of title as avatar", () => {
    render(<LobbyCard {...defaultProps} title="大师房间" />);
    expect(screen.getByText("大师")).toBeInTheDocument();
  });

  it("renders join button", () => {
    render(<LobbyCard {...defaultProps} />);
    expect(screen.getByText("加入")).toBeInTheDocument();
  });
});
