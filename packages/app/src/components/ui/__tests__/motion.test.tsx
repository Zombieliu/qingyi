import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageTransition, Stagger, StaggerItem, MotionCard } from "../motion";

describe("PageTransition", () => {
  it("renders children", () => {
    render(
      <PageTransition routeKey="test">
        <p>Page content</p>
      </PageTransition>
    );
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("applies motion-page className to the wrapper", () => {
    render(
      <PageTransition routeKey="test" className="extra">
        <p>Content</p>
      </PageTransition>
    );
    const content = screen.getByText("Content");
    const wrapper = content.closest(".motion-page");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper!.className).toContain("extra");
  });
});

describe("Stagger", () => {
  it("renders children", () => {
    render(
      <Stagger>
        <p>Stagger child</p>
      </Stagger>
    );
    expect(screen.getByText("Stagger child")).toBeInTheDocument();
  });
});

describe("StaggerItem", () => {
  it("renders children", () => {
    render(
      <StaggerItem>
        <p>Item content</p>
      </StaggerItem>
    );
    expect(screen.getByText("Item content")).toBeInTheDocument();
  });
});

describe("MotionCard", () => {
  it("renders children", () => {
    render(
      <MotionCard>
        <p>Card content</p>
      </MotionCard>
    );
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <MotionCard className="my-card" data-testid="motion-card">
        <p>Styled</p>
      </MotionCard>
    );
    const card = screen.getByTestId("motion-card");
    expect(card.className).toContain("my-card");
  });
});
