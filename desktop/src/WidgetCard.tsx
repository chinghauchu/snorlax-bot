// SPDX-License-Identifier: Apache-2.0
import { KeyboardEvent, useState } from "react";
import {
  isPickedValue,
  optionValue,
  type QuestionWidget,
  type WidgetOption,
} from "./widget";

type Props = {
  messageId: string;
  widget: QuestionWidget;
  status?: string | null;
  values?: string[] | null;
  disabled?: boolean;
  onReply: (id: string, values: string[]) => void;
  onDismiss: (id: string) => void;
};

export function WidgetCard({
  messageId,
  widget,
  status,
  values,
  disabled = false,
  onReply,
  onDismiss,
}: Props) {
  const pending = (status || "pending") === "pending";
  const resolved = status === "resolved";
  const dismissed = status === "dismissed";
  const pickedValues = values || [];
  const multi = Boolean(widget.multiSelect);
  const [checked, setChecked] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const options = (widget.options || []).slice(0, 6);
  const interactive = pending && !disabled;

  function toggle(value: string) {
    setChecked((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

  function submitCustom() {
    const value = custom.trim();
    if (!value || !interactive) return;
    if (multi) {
      if (!checked.includes(value)) setChecked((prev) => [...prev, value]);
      setCustom("");
      return;
    }
    onReply(messageId, [value]);
  }

  function onCustomKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitCustom();
    }
  }

  return (
    <div className={`widget-card${dismissed ? " dismissed" : ""}`}>
      {interactive ? (
        <button
          type="button"
          className="widget-dismiss"
          aria-label="Dismiss"
          onClick={() => onDismiss(messageId)}
        >
          ×
        </button>
      ) : null}
      <p className="widget-prompt">{widget.prompt}</p>
      {widget.helpText ? <p className="widget-help">{widget.helpText}</p> : null}
      {dismissed ? <p className="widget-dismissed-label">Dismissed</p> : null}
      <div className="widget-options">
        {options.map((option) => {
          const value = optionValue(option);
          const picked = resolved && isPickedValue(pickedValues, value);
          const muted = resolved && !picked;
          if (multi && interactive) {
            return (
              <label
                key={value}
                className={`widget-option multi style-${optionStyle(option)}${checked.includes(value) ? " selected" : ""}`}
              >
                <input
                  type="checkbox"
                  className="widget-check"
                  checked={checked.includes(value)}
                  onChange={() => toggle(value)}
                />
                <span className="widget-option-copy">
                  <span className="widget-option-label">{option.label}</span>
                  {option.description ? (
                    <span className="widget-option-desc">{option.description}</span>
                  ) : null}
                </span>
              </label>
            );
          }
          return (
            <button
              key={value}
              type="button"
              className={`widget-option style-${optionStyle(option)}${picked ? " picked" : ""}${muted ? " muted" : ""}`}
              disabled={!interactive || multi}
              onClick={() => {
                if (!interactive || multi) return;
                onReply(messageId, [value]);
              }}
            >
              <span className="widget-option-copy">
                <span className="widget-option-label">{option.label}</span>
                {option.description ? (
                  <span className="widget-option-desc">{option.description}</span>
                ) : null}
              </span>
              {picked ? <span className="widget-picked-mark" aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
      </div>
      {widget.allowCustom && interactive ? (
        <input
          className="widget-custom"
          type="text"
          value={custom}
          placeholder="Or type your own"
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={onCustomKey}
        />
      ) : null}
      {multi && interactive ? (
        <button
          type="button"
          className="widget-done"
          disabled={checked.length === 0 && !custom.trim()}
          onClick={() => {
            const values = [...checked];
            const extra = custom.trim();
            if (extra && !values.includes(extra)) values.push(extra);
            if (values.length === 0) return;
            onReply(messageId, values);
          }}
        >
          Done
        </button>
      ) : null}
    </div>
  );
}

function optionStyle(option: WidgetOption): "default" | "primary" | "danger" {
  const style = option.style || "default";
  if (style === "primary" || style === "danger") return style;
  return "default";
}
