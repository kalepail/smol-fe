function isScalarLike(value: unknown): value is string | number | bigint {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  );
}

function normalizeScalar(value: unknown, label: string): string {
  if (Array.isArray(value)) {
    if (value.length === 1) return normalizeScalar(value[0], label);
    throw new Error(`Invalid ${label}: expected a single value, got ${value.length}.`);
  }

  if (!isScalarLike(value)) {
    throw new Error(`Invalid ${label}: expected a scalar value.`);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`Invalid ${label}: expected an integer.`);
    }
    return String(value);
  }

  const asString = value.toString();
  // If this came from an accidental array `.toString()`, it'll look like "0,1".
  if (asString.includes(",")) {
    throw new Error(`Invalid ${label}: expected a single value (no commas).`);
  }

  return asString;
}

export function normalizeCircomScalar(value: unknown, label: string): string {
  return normalizeScalar(value, label);
}

