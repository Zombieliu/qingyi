import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "../input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input data-testid="input" />);
    expect(screen.getByTestId("input")).toBeInTheDocument();
    expect(screen.getByTestId("input").tagName).toBe("INPUT");
  });

  it("renders with placeholder text", () => {
    render(<Input placeholder="Enter text..." />);
    expect(screen.getByPlaceholderText("Enter text...")).toBeInTheDocument();
  });

  it("applies the correct type attribute", () => {
    render(<Input type="email" data-testid="input" />);
    expect(screen.getByTestId("input")).toHaveAttribute("type", "email");
  });

  it("is disabled when disabled prop is set", () => {
    render(<Input disabled data-testid="input" />);
    expect(screen.getByTestId("input")).toBeDisabled();
  });

  it("calls onChange handler when value changes", () => {
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} data-testid="input" />);
    fireEvent.change(screen.getByTestId("input"), { target: { value: "hello" } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });
});
