"use client";

import { useMemo, useState } from "react";
import type { LisaInput, LisaModel } from "@/lib/lisa-types";
import clsx from "clsx";

export function LisaInputs({
  inputs,
  model,
  onChange,
  onSubmit,
  submitting,
}: {
  inputs: LisaInput[];
  model: LisaModel;
  onChange: (name: string, value: string | File[]) => void;
  onSubmit: () => void;
  submitting?: boolean;
}) {
  const [touched, setTouched] = useState(false);

  const valid = useMemo(() => {
    return inputs.every((input) => {
      if (input.type === "file") return true;
      const value = model[input.name];
      if (typeof value !== "string") return false;
      if (!value.trim()) return false;
      if (input.type === "email") {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      }
      return true;
    });
  }, [inputs, model]);

  return (
    <form
      className="c-lisa-step_fields"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (valid) onSubmit();
      }}
    >
      {inputs.map((input) => {
        const value = model[input.name];
        if (input.type === "textarea") {
          return (
            <label key={input.name} className="c-lisa-field">
              <span className="u-screen-reader-text">{input.label}</span>
              <textarea
                name={input.name}
                placeholder={input.label}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => onChange(input.name, e.target.value)}
                required
              />
            </label>
          );
        }

        if (input.type === "file") {
          const files = Array.isArray(value) ? value : [];
          return (
            <label key={input.name} className="c-lisa-field_file">
              <span>{files.length ? `${files.length} file(s)` : input.label}</span>
              <input
                type="file"
                name={input.name}
                multiple={input.multiple ?? true}
                accept={input.accept}
                onChange={(e) =>
                  onChange(input.name, Array.from(e.target.files ?? []))
                }
              />
            </label>
          );
        }

        return (
          <label key={input.name} className="c-lisa-field">
            <span className="u-screen-reader-text">{input.label}</span>
            <input
              type={input.type === "email" ? "email" : input.type === "date" ? "date" : "text"}
              name={input.name}
              placeholder={input.label}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(input.name, e.target.value)}
              required={input.type !== "file"}
            />
          </label>
        );
      })}

      {touched && !valid ? (
        <p style={{ color: "#c00", fontSize: "0.85rem" }}>
          Please fill in the required fields.
        </p>
      ) : null}

      <button
        type="submit"
        className={clsx("c-lisa_button", "-primary", "-circle", "c-lisa-step_next")}
        aria-label="Next"
        disabled={submitting}
      >
        →
      </button>
    </form>
  );
}
