/**
 * Tiny Mustache-like renderer for agent instructions.
 * Supports {{var}}, {% if var %}...{% endif %}, {% for c in list %}...{% endfor %}.
 */
export function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  let out = template;

  out = out.replace(
    /\{%\s*for\s+(\w+)\s+in\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
    (_m, itemName: string, listName: string, body: string) => {
      const list = context[listName];
      if (!Array.isArray(list)) return "";
      return list
        .map((item) => {
          const local = { ...context, [itemName]: item };
          return renderTemplate(body, flattenItem(local, itemName, item));
        })
        .join("");
    },
  );

  out = out.replace(
    /\{%\s*if\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
    (_m, name: string, body: string) => {
      const value = context[name];
      const truthy =
        value !== undefined &&
        value !== null &&
        value !== "" &&
        value !== false;
      return truthy ? renderTemplate(body, context) : "";
    },
  );

  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const value = lookup(context, path);
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  });

  return out.trim();
}

function flattenItem(
  context: Record<string, unknown>,
  itemName: string,
  item: unknown,
): Record<string, unknown> {
  const next = { ...context, [itemName]: item };
  if (item && typeof item === "object" && !Array.isArray(item)) {
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      next[`${itemName}.${k}`] = v;
    }
  }
  return next;
}

function lookup(context: Record<string, unknown>, path: string): unknown {
  if (path in context) return context[path];
  const parts = path.split(".");
  let cur: unknown = context;
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}
