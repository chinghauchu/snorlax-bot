// SPDX-License-Identifier: Apache-2.0

export type WidgetOption = {
  label: string;
  value?: string;
  description?: string | null;
  style?: "default" | "primary" | "danger" | string;
};

export type QuestionWidget = {
  prompt: string;
  options: WidgetOption[];
  allowCustom?: boolean;
  multiSelect?: boolean;
  helpText?: string | null;
  dismissOnMoveOn?: boolean;
};

export type WidgetStatus = "pending" | "resolved" | "dismissed" | string;

export function isWidget(message: {
  kind?: string;
  widget?: QuestionWidget | null;
}): boolean {
  return message.kind === "widget" || Boolean(message.widget);
}

export function optionValue(option: WidgetOption): string {
  const value = (option.value || option.label || "").trim();
  return value || option.label;
}

export function widgetOf(message: {
  widget?: QuestionWidget | null;
}): QuestionWidget | null {
  const raw = message.widget;
  if (!raw || typeof raw !== "object") return null;
  if (!raw.prompt || !Array.isArray(raw.options)) return null;
  return raw;
}

export function widgetStatusOf(message: {
  widgetStatus?: WidgetStatus | null;
}): WidgetStatus {
  return message.widgetStatus || "pending";
}

export function widgetValuesOf(message: {
  widgetValues?: string[] | null;
}): string[] {
  return Array.isArray(message.widgetValues) ? message.widgetValues : [];
}

export function isPendingWidget(message: {
  kind?: string;
  widget?: QuestionWidget | null;
  widgetStatus?: WidgetStatus | null;
}): boolean {
  if (!isWidget(message) || !widgetOf(message)) return false;
  return widgetStatusOf(message) === "pending";
}

/** Latest pending card in this transcript. Clients render; they do not invent fields. */
export function pendingWidgetMessage(
  messages: {
    kind?: string;
    widget?: QuestionWidget | null;
    widgetStatus?: WidgetStatus | null;
    id?: string;
  }[],
): { id: string; widget: QuestionWidget } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || !isPendingWidget(message) || !message.id) continue;
    const widget = widgetOf(message);
    if (widget) return { id: message.id, widget };
  }
  return null;
}

export function isPickedValue(values: string[] | null | undefined, value: string): boolean {
  return (values || []).includes(value);
}
