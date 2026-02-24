import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockTrackEvent = vi.fn();
vi.mock("@/lib/services/analytics", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    className,
    onClick,
    children,
  }: {
    href: string;
    className?: string;
    onClick?: () => void;
    children: React.ReactNode;
  }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

import TrackedLink from "../tracked-link";

describe("TrackedLink", () => {
  it("renders an anchor with correct href and children", () => {
    render(
      <TrackedLink href="/about" event="nav_click">
        关于我们
      </TrackedLink>
    );
    const link = screen.getByRole("link", { name: "关于我们" });
    expect(link).toHaveAttribute("href", "/about");
  });

  it("applies className to the link", () => {
    render(
      <TrackedLink href="/about" event="nav_click" className="my-link">
        关于
      </TrackedLink>
    );
    expect(screen.getByRole("link")).toHaveClass("my-link");
  });

  it("calls trackEvent with event name and href on click", () => {
    render(
      <TrackedLink href="/pricing" event="pricing_click">
        价格
      </TrackedLink>
    );
    fireEvent.click(screen.getByRole("link"));
    expect(mockTrackEvent).toHaveBeenCalledWith("pricing_click", {
      href: "/pricing",
    });
  });

  it("passes extra meta to trackEvent", () => {
    render(
      <TrackedLink href="/pricing" event="pricing_click" meta={{ source: "header" }}>
        价格
      </TrackedLink>
    );
    fireEvent.click(screen.getByRole("link"));
    expect(mockTrackEvent).toHaveBeenCalledWith("pricing_click", {
      href: "/pricing",
      source: "header",
    });
  });
});
