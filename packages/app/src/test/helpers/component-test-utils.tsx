/**
 * Component test utilities.
 * Provides renderWithProviders for components that need i18n + Jotai context.
 */
import React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { Provider as JotaiProvider } from "jotai";

function AllProviders({ children }: { children: React.ReactNode }) {
  return React.createElement(JotaiProvider, null, children);
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export { render } from "@testing-library/react";
