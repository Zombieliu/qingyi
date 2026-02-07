"use client";

import { Children, cloneElement, isValidElement } from "react";
import type { ReactNode, ReactElement } from "react";
import { useI18n } from "@/lib/i18n-client";

function translateNode(node: ReactNode, tr: (text: string) => string): ReactNode {
  if (typeof node === "string") {
    return tr(node);
  }
  if (Array.isArray(node)) {
    return node.map((child) => translateNode(child, tr));
  }
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    if (!element.props.children) return element;
    return cloneElement(element, {
      children: translateNode(element.props.children, tr),
    });
  }
  return node;
}

export default function AutoTranslate({ children }: { children: ReactNode }) {
  const { tr } = useI18n();
  return <>{Children.map(children, (child) => translateNode(child, tr))}</>;
}
