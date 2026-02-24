import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StateBlock } from "../state-block";

describe("StateBlock", () => {
  it("renders title text", () => {
    render(<StateBlock title="加载完成" />);
    expect(screen.getByText("加载完成")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<StateBlock title="错误" description="请重试" />);
    expect(screen.getByText("请重试")).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    const { container } = render(<StateBlock title="信息" />);
    expect(container.querySelector(".state-copy")).not.toBeInTheDocument();
  });

  it("applies correct data-tone attribute (defaults to info)", () => {
    const { container } = render(<StateBlock title="默认" />);
    const block = container.querySelector(".state-block")!;
    expect(block.getAttribute("data-tone")).toBe("info");
  });

  it("applies custom tone, size, and align attributes", () => {
    const { container } = render(
      <StateBlock title="警告" tone="warning" size="compact" align="center" />
    );
    const block = container.querySelector(".state-block")!;
    expect(block.getAttribute("data-tone")).toBe("warning");
    expect(block.getAttribute("data-size")).toBe("compact");
    expect(block.getAttribute("data-align")).toBe("center");
  });

  it("renders actions slot when provided", () => {
    render(<StateBlock title="空" tone="empty" actions={<button>重试</button>} />);
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("renders custom icon when provided", () => {
    render(<StateBlock title="自定义" icon={<span data-testid="custom-icon" />} />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("appends custom className", () => {
    const { container } = render(<StateBlock title="样式" className="my-extra" />);
    const block = container.querySelector(".state-block")!;
    expect(block.className).toContain("my-extra");
  });
});
