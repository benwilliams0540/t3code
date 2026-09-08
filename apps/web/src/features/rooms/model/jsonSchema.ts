export interface JsonSchemaIssue {
  readonly path: string;
  readonly message: string;
}

type JsonObject = { readonly [key: string]: unknown };

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => deepEqual(value, right[index]))
    );
  }
  if (!isJsonObject(left) || !isJsonObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]))
  );
}

function childPath(path: string, key: string | number): string {
  return typeof key === "number" ? `${path}[${key}]` : `${path}.${key}`;
}

function schemaReference(root: unknown, reference: string): unknown {
  if (!reference.startsWith("#/")) return undefined;
  let current: unknown = root;
  for (const encodedPart of reference.slice(2).split("/")) {
    const part = encodedPart.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isJsonObject(current) || !Object.hasOwn(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case "object":
      return isJsonObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return false;
  }
}

function isRfc3339DateTime(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/u.exec(
      value,
    );
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  if (
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return false;
  }

  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  calendarDate.setUTCHours(0, 0, 0, 0);
  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day &&
    Number.isFinite(Date.parse(value))
  );
}

export function validateJsonSchema(
  rootSchema: unknown,
  document: unknown,
): readonly JsonSchemaIssue[] {
  const validate = (schemaValue: unknown, value: unknown, path: string): JsonSchemaIssue[] => {
    if (!isJsonObject(schemaValue)) {
      return [{ path, message: "references an invalid JSON schema node" }];
    }

    const reference = schemaValue.$ref;
    if (typeof reference === "string") {
      const resolved = schemaReference(rootSchema, reference);
      return resolved === undefined
        ? [{ path, message: `references unknown schema ${reference}` }]
        : validate(resolved, value, path);
    }

    const issues: JsonSchemaIssue[] = [];
    const allOf = schemaValue.allOf;
    if (Array.isArray(allOf)) {
      for (const branch of allOf) issues.push(...validate(branch, value, path));
    }

    const oneOf = schemaValue.oneOf;
    if (Array.isArray(oneOf)) {
      const matches = oneOf
        .map((branch) => validate(branch, value, path))
        .filter((branch) => branch.length === 0);
      if (matches.length !== 1) {
        issues.push({
          path,
          message: `must match exactly one closed union branch; matched ${matches.length}`,
        });
      }
    }

    const conditional = schemaValue.if;
    if (
      conditional !== undefined &&
      validate(conditional, value, path).length === 0 &&
      schemaValue.then !== undefined
    ) {
      issues.push(...validate(schemaValue.then, value, path));
    }

    if (Object.hasOwn(schemaValue, "const") && !deepEqual(value, schemaValue.const)) {
      issues.push({ path, message: `must equal ${JSON.stringify(schemaValue.const)}` });
    }
    if (
      Array.isArray(schemaValue.enum) &&
      !schemaValue.enum.some((candidate) => deepEqual(candidate, value))
    ) {
      issues.push({ path, message: "must use a declared enum value" });
    }

    const type = schemaValue.type;
    if (typeof type === "string" && !typeMatches(type, value)) {
      issues.push({ path, message: `must be ${type}` });
      return issues;
    }

    if (isJsonObject(value)) {
      const properties = isJsonObject(schemaValue.properties) ? schemaValue.properties : {};
      if (Array.isArray(schemaValue.required)) {
        for (const key of schemaValue.required) {
          if (typeof key === "string" && !Object.hasOwn(value, key)) {
            issues.push({ path: childPath(path, key), message: "is required" });
          }
        }
      }
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (Object.hasOwn(value, key))
          issues.push(...validate(propertySchema, value[key], childPath(path, key)));
      }
      if (schemaValue.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!Object.hasOwn(properties, key)) {
            issues.push({
              path: childPath(path, key),
              message: "is not allowed by this closed object",
            });
          }
        }
      }
    }

    if (Array.isArray(value)) {
      if (typeof schemaValue.minItems === "number" && value.length < schemaValue.minItems) {
        issues.push({ path, message: `must contain at least ${schemaValue.minItems} items` });
      }
      if (typeof schemaValue.maxItems === "number" && value.length > schemaValue.maxItems) {
        issues.push({ path, message: `must contain at most ${schemaValue.maxItems} items` });
      }
      if (schemaValue.uniqueItems === true) {
        for (let index = 0; index < value.length; index += 1) {
          if (value.slice(0, index).some((candidate) => deepEqual(candidate, value[index]))) {
            issues.push({
              path: childPath(path, index),
              message: "duplicates an earlier array item",
            });
          }
        }
      }
      if (schemaValue.items !== undefined) {
        value.forEach((item, index) =>
          issues.push(...validate(schemaValue.items, item, childPath(path, index))),
        );
      }
    }

    if (typeof value === "string") {
      if (typeof schemaValue.minLength === "number" && value.length < schemaValue.minLength) {
        issues.push({ path, message: `must contain at least ${schemaValue.minLength} characters` });
      }
      if (
        typeof schemaValue.pattern === "string" &&
        !new RegExp(schemaValue.pattern, "u").test(value)
      ) {
        issues.push({ path, message: `must match ${schemaValue.pattern}` });
      }
      if (schemaValue.format === "date-time" && !isRfc3339DateTime(value)) {
        issues.push({ path, message: "must be an RFC 3339 date-time" });
      }
      if (schemaValue.format === "uri") {
        if (!URL.canParse(value)) {
          issues.push({ path, message: "must be an absolute URI" });
        }
      }
    }

    if (typeof value === "number") {
      if (typeof schemaValue.minimum === "number" && value < schemaValue.minimum) {
        issues.push({ path, message: `must be at least ${schemaValue.minimum}` });
      }
      if (typeof schemaValue.maximum === "number" && value > schemaValue.maximum) {
        issues.push({ path, message: `must be at most ${schemaValue.maximum}` });
      }
    }

    return issues;
  };

  return validate(rootSchema, document, "$ ".trim());
}
