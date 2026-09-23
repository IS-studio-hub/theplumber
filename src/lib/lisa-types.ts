export type Locale = "en" | "fr";

export type MediaItem = [string, "video" | "gif" | "image" | string];

export type ModelUpdate = {
  key: string;
  value?: string;
};

export type LisaChoice = {
  label: string;
  target?: string;
  modelUpdate?: ModelUpdate;
  clickToCopy?: { confirmation: string; toCopy: string };
  href?: string;
  emit?: string;
  mediaHover?: MediaItem[];
};

export type ConditionalChoices = {
  key: string;
  value: Record<string, LisaChoice[]>;
};

export type LisaInput = {
  type: "text" | "email" | "textarea" | "file" | "date" | "select" | string;
  name: string;
  label: string;
  options?: { label: string; value: string }[];
  accept?: string;
  multiple?: boolean;
};

export type LisaStep = {
  progress?: number;
  next?: string;
  isCompact?: boolean;
  showForm?: boolean;
  showErrors?: boolean;
  dialog?: { list: Record<string, string> };
  choices?: LisaChoice[] | ConditionalChoices;
  inputs?: LisaInput[];
  media?: MediaItem[];
  modelUpdate?: ModelUpdate;
  footer?: string;
};

export type LisaContent = Record<string, LisaStep>;

export type LisaModel = Record<string, string | File[] | undefined>;

export function pickDialog(list: Record<string, string>): string {
  const values = Object.values(list);
  if (!values.length) return "";
  return values[Math.floor(Math.random() * values.length)] ?? values[0];
}

export function resolveChoices(
  choices: LisaStep["choices"],
  model: LisaModel
): LisaChoice[] {
  if (!choices) return [];
  if (Array.isArray(choices)) return choices;
  const key = choices.key;
  const raw = model[key];
  const value = typeof raw === "string" ? raw : "";
  const map = choices.value;
  return map[value] ?? map[Object.keys(map)[0]] ?? [];
}

export function getEndpoint(goal: string | undefined): string {
  switch (goal) {
    case "rfp":
      return "/api/rfp-enquiries";
    case "job":
      return "/api/job-enquiries";
    default:
      return "/api/general-enquiries";
  }
}
