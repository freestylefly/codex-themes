/**
 * JSON Schema for the Theme Generation Recipe, used as the
 * `outputSchema` parameter on `turn/start` and for runtime reference.
 */

export const RECIPE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "name",
    "description",
    "tagline",
    "tags",
    "layout",
    "hero",
    "wallpaper",
    "appearance",
    "effects",
    "copy",
    "paletteIntent",
  ],
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    name: { type: "string", maxLength: 80 },
    description: { type: "string", maxLength: 160 },
    tagline: { type: "string", maxLength: 160 },
    tags: { type: "array", maxItems: 16, items: { type: "string", maxLength: 32 } },
    layout: {
      type: "string",
      enum: [
        "dream-banner",
        "split-studio",
        "full-canvas",
        "terminal-grid",
        "paper-board",
        "minimal-focus",
        "retro-messenger",
      ],
    },
    hero: {
      type: "object",
      additionalProperties: false,
      required: ["fit", "focusX", "focusY", "zoom", "height", "textAlign", "scrim"],
      properties: {
        fit: { type: "string", enum: ["cover", "contain"] },
        focusX: { type: "number", minimum: 0, maximum: 1 },
        focusY: { type: "number", minimum: 0, maximum: 1 },
        zoom: { type: "number", minimum: 0.5, maximum: 2 },
        height: { type: "number", minimum: 200, maximum: 360 },
        textAlign: { type: "string", enum: ["left", "center", "right"] },
        scrim: { type: "number", minimum: 0, maximum: 0.85 },
      },
    },
    wallpaper: {
      type: "object",
      additionalProperties: false,
      required: ["enabled", "focusX", "focusY", "opacity", "blur"],
      properties: {
        enabled: { type: "boolean" },
        focusX: { type: "number", minimum: 0, maximum: 1 },
        focusY: { type: "number", minimum: 0, maximum: 1 },
        opacity: { type: "number", minimum: 0, maximum: 1 },
        blur: { type: "number", minimum: 0, maximum: 32 },
      },
    },
    appearance: {
      type: "object",
      additionalProperties: false,
      required: ["radius", "density", "fontPreset", "glass", "shadow", "decoration"],
      properties: {
        radius: { type: "string", enum: ["none", "sm", "md", "lg", "xl"] },
        density: { type: "string", enum: ["compact", "normal", "spacious"] },
        fontPreset: { type: "string", enum: ["system", "rounded", "mono"] },
        glass: { type: "boolean" },
        shadow: { type: "string", enum: ["none", "sm", "md", "lg"] },
        decoration: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    effects: {
      type: "object",
      additionalProperties: false,
      required: ["particles", "aurora", "glow", "noise", "grid", "float"],
      properties: {
        particles: { type: "number", minimum: 0, maximum: 1 },
        aurora: { type: "number", minimum: 0, maximum: 1 },
        glow: { type: "number", minimum: 0, maximum: 1 },
        noise: { type: "number", minimum: 0, maximum: 1 },
        grid: { type: "number", minimum: 0, maximum: 1 },
        float: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    copy: {
      type: "object",
      additionalProperties: false,
      required: ["brandSubtitle", "projectPrefix", "projectLabel", "statusText", "quote"],
      properties: {
        brandSubtitle: { type: "string", maxLength: 80 },
        projectPrefix: { type: "string", maxLength: 80 },
        projectLabel: { type: "string", maxLength: 80 },
        statusText: { type: "string", maxLength: 80 },
        quote: { type: "string", maxLength: 80 },
      },
    },
    paletteIntent: {
      type: "object",
      additionalProperties: false,
      required: ["appearance", "contrast", "temperature"],
      properties: {
        appearance: { type: "string", enum: ["light", "dark"] },
        contrast: { type: "string", enum: ["soft", "normal", "high"] },
        temperature: { type: "string", enum: ["cool", "neutral", "warm"] },
      },
    },
  },
} as const;
