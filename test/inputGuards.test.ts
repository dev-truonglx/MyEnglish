import { describe, it, expect } from "vitest";
import { applyRawInputAttributes, RAW_INPUT_PROPS } from "@/lib/inputGuards";

function createMockElement(tagName: string, type?: string) {
  const attrs: Record<string, string> = {};
  if (type) attrs["type"] = type;

  return {
    tagName: tagName.toUpperCase(),
    type,
    getAttribute(name: string) {
      return attrs[name] ?? null;
    },
    setAttribute(name: string, value: string) {
      attrs[name] = value;
    },
    hasAttribute(name: string) {
      return name in attrs;
    },
    attrs,
  };
}

describe("inputGuards (enforce raw keyboard typing)", () => {
  it("exposes standard RAW_INPUT_PROPS", () => {
    expect(RAW_INPUT_PROPS.autoComplete).toBe("off");
    expect(RAW_INPUT_PROPS.autoCorrect).toBe("off");
    expect(RAW_INPUT_PROPS.autoCapitalize).toBe("off");
    expect(RAW_INPUT_PROPS.spellCheck).toBe(false);
    expect(RAW_INPUT_PROPS["data-gramm"]).toBe("false");
    expect(RAW_INPUT_PROPS["data-lpignore"]).toBe("true");
    expect(RAW_INPUT_PROPS["data-1p-ignore"]).toBe("true");
    expect(RAW_INPUT_PROPS["data-form-type"]).toBe("other");
  });

  it("applies raw input attributes to text input", () => {
    const input = createMockElement("input", "text");
    applyRawInputAttributes(input);

    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("autocorrect")).toBe("off");
    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(input.getAttribute("data-gramm")).toBe("false");
    expect(input.getAttribute("data-enable-grammarly")).toBe("false");
    expect(input.getAttribute("data-lpignore")).toBe("true");
    expect(input.getAttribute("data-1p-ignore")).toBe("true");
    expect(input.getAttribute("data-form-type")).toBe("other");
  });

  it("applies raw input attributes to textarea", () => {
    const textarea = createMockElement("textarea");
    applyRawInputAttributes(textarea);

    expect(textarea.getAttribute("autocomplete")).toBe("off");
    expect(textarea.getAttribute("autocorrect")).toBe("off");
    expect(textarea.getAttribute("autocapitalize")).toBe("off");
    expect(textarea.getAttribute("spellcheck")).toBe("false");
    expect(textarea.getAttribute("data-gramm")).toBe("false");
    expect(textarea.getAttribute("data-enable-grammarly")).toBe("false");
    expect(textarea.getAttribute("data-lpignore")).toBe("true");
    expect(textarea.getAttribute("data-1p-ignore")).toBe("true");
    expect(textarea.getAttribute("data-form-type")).toBe("other");
  });

  it("does not apply text attributes to checkbox or file input", () => {
    const checkbox = createMockElement("input", "checkbox");
    applyRawInputAttributes(checkbox);

    expect(checkbox.hasAttribute("autocomplete")).toBe(false);
    expect(checkbox.hasAttribute("autocorrect")).toBe(false);

    const file = createMockElement("input", "file");
    applyRawInputAttributes(file);

    expect(file.hasAttribute("autocomplete")).toBe(false);
  });

  it("applies autocomplete='off' to forms", () => {
    const form = createMockElement("form");
    applyRawInputAttributes(form);

    expect(form.getAttribute("autocomplete")).toBe("off");
  });
});
