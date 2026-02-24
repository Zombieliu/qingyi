import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Textarea } from "../textarea";

describe("Textarea", () => {
  it("renders a textarea element", () => {
    render(<Textarea data-testid="textarea" />);
    expect(screen.getByTestId("textarea")).toBeInTheDocument();
    expect(screen.getByTestId("textarea").tagName).toBe("TEXTAREA");
  });

  it("renders with placeholder text", () => {
    render(<Textarea placeholder="Write something..." />);
    expect(screen.getByPlaceholderText("Write something...")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is set", () => {
    render(<Textarea disabled data-testid="textarea" />);
    expect(screen.getByTestId("textarea")).toBeDisabled();
  });

  it("calls onChange handler when value changes", () => {
    const handleChange = vi.fn();
    render(<Textarea onChange={handleChange} data-testid="textarea" />);
    fireEvent.change(screen.getByTestId("textarea"), { target: { value: "hello" } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it("merges custom className", () => {
    render(<Textarea className="my-custom" data-testid="textarea" />);
    const el = screen.getByTestId("textarea");
    expect(el.className).toContain("my-custom");
    expect(el.className).toContain("min-h-[100px]");
  });
});
