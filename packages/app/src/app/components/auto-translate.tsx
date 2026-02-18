"use client";

import { Children, cloneElement, isValidElement } from "react";
import type { ReactNode, ReactElement } from "react";
import { useI18n } from "@/lib/i18n/i18n-client";

const TRANSLATABLE_PROPS = ["placeholder", "title", "aria-label", "ariaLabel", "alt"];

function translateNode(node: ReactNode, t: (key: string) => string): ReactNode {
  if (typeof node === "string") {
    return t(node);
  }
  if (Array.isArray(node)) {
    return node.map((child) => translateNode(child, t));
  }
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode } & Record<string, unknown>>;
    if (!element.props.children) return element;
    const nextProps: Record<string, unknown> = {};
    TRANSLATABLE_PROPS.forEach((prop) => {
      const value = element.props[prop];
      if (typeof value === "string") {
        nextProps[prop] = t(value);
      }
    });
    return cloneElement(element, {
      children: translateNode(element.props.children, t),
      ...nextProps,
    });
  }
  return node;
}

export default function AutoTranslate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return <>{Children.map(children, (child) => translateNode(child, t))}</>;
}
