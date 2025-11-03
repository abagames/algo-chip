import type { SETemplate } from "./seTypes.js";
import seTemplatesJson from "../../motifs/se-templates.json" with { type: "json" };

export function loadSETemplates(): SETemplate[] {
  const json = seTemplatesJson as { templates: SETemplate[] };
  return json.templates;
}
