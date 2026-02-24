import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/i18n/i18n-client", () => ({
  useI18n: () => ({
    t: (k: string) => `translated:${k}`,
  }),
}));

import AutoTranslate from "../auto-translate";

describe("AutoTranslate", () => {
  it("translates string children", () => {
    render(<AutoTranslate>hello.key</AutoTranslate>);
    expect(screen.getByText("translated:hello.key")).toBeInTheDocument();
  });

  it("translates nested element children", () => {
    render(
      <AutoTranslate>
        <span>nested.key</span>
      </AutoTranslate>
    );
    expect(screen.getByText("translated:nested.key")).toBeInTheDocument();
  });

  it("translates translatable props on elements with children", () => {
    render(
      <AutoTranslate>
        <div placeholder="placeholder.key">
          <span>child.key</span>
        </div>
      </AutoTranslate>
    );
    // The placeholder prop is translated on elements that have children
    expect(screen.getByText("translated:child.key")).toBeInTheDocument();
  });

  it("does not translate props on childless elements", () => {
    render(
      <AutoTranslate>
        <input placeholder="placeholder.key" />
      </AutoTranslate>
    );
    // Elements without children are returned as-is
    const input = screen.getByPlaceholderText("placeholder.key");
    expect(input).toBeInTheDocument();
  });

  it("translates title prop", () => {
    render(
      <AutoTranslate>
        <div title="title.key">content</div>
      </AutoTranslate>
    );
    const el = screen.getByTitle("translated:title.key");
    expect(el).toBeInTheDocument();
  });

  it("passes through non-string children unchanged", () => {
    render(
      <AutoTranslate>
        <span>{42}</span>
      </AutoTranslate>
    );
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("handles null children gracefully", () => {
    const { container } = render(<AutoTranslate>{null}</AutoTranslate>);
    expect(container.innerHTML).toBe("");
  });

  it("translates array children inside an element", () => {
    render(
      <AutoTranslate>
        <div>
          {"first.key"}
          {"second.key"}
        </div>
      </AutoTranslate>
    );
    expect(screen.getByText(/translated:first\.key/)).toBeInTheDocument();
    expect(screen.getByText(/translated:second\.key/)).toBeInTheDocument();
  });

  it("translates aria-label prop", () => {
    render(
      <AutoTranslate>
        <button aria-label="label.key">click</button>
      </AutoTranslate>
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-label", "translated:label.key");
  });

  it("translates alt prop on element with children", () => {
    render(
      <AutoTranslate>
        <div alt="alt.key">
          <span>child</span>
        </div>
      </AutoTranslate>
    );
    // The div with children gets alt translated
    expect(screen.getByText("translated:child")).toBeInTheDocument();
  });

  it("does not translate non-string prop values", () => {
    render(
      <AutoTranslate>
        <div title={42 as unknown as string}>content</div>
      </AutoTranslate>
    );
    expect(screen.getByText("translated:content")).toBeInTheDocument();
  });
});
