import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

import { ConfirmDialog, PromptDialog } from "../confirm-dialog";

describe("ConfirmDialog", () => {
  const baseProps = {
    open: true,
    title: "确认删除",
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders nothing when open is false", () => {
    const { container } = render(<ConfirmDialog {...baseProps} open={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog with title when open", () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("确认删除")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<ConfirmDialog {...baseProps} description="此操作不可撤销" />);
    expect(screen.getByText("此操作不可撤销")).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.queryByText("此操作不可撤销")).not.toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);
    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find((b) => b.classList.contains("primary"))!;
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} onClose={onClose} />);
    const buttons = screen.getAllByRole("button");
    const cancelBtn = buttons.find((b) => !b.classList.contains("primary"))!;
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables buttons when busy is true", () => {
    render(<ConfirmDialog {...baseProps} busy={true} />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("renders children content", () => {
    render(
      <ConfirmDialog {...baseProps}>
        <p>自定义内容</p>
      </ConfirmDialog>
    );
    expect(screen.getByText("自定义内容")).toBeInTheDocument();
  });
});

describe("PromptDialog", () => {
  const baseProps = {
    open: true,
    title: "输入备注",
    value: "",
    onChange: vi.fn(),
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders a textarea with placeholder", () => {
    render(<PromptDialog {...baseProps} placeholder="请输入..." />);
    expect(screen.getByPlaceholderText("请输入...")).toBeInTheDocument();
  });

  it("calls onChange when textarea value changes", () => {
    const onChange = vi.fn();
    render(<PromptDialog {...baseProps} onChange={onChange} placeholder="输入" />);
    fireEvent.change(screen.getByPlaceholderText("输入"), {
      target: { value: "新内容" },
    });
    expect(onChange).toHaveBeenCalledWith("新内容");
  });
});
