import { z } from 'zod';

// Models occasionally emit JSON `null` (or omit / mistype) a field that a step's
// strict Zod schema declares as a required string/number/boolean. The newsletter
// step schemas double as the Mastra step-boundary contract, which is validated
// strictly — and structuredOutput's errorStrategy: 'fallback' only catches a
// *total* parse failure, not a structurally-valid object carrying a stray null.
// One such null used to crash the whole run from WorkflowEventProcessor with
// "Expected string, received null".
//
// coerceToSchema walks the (strict) schema and the model's value together,
// replacing any bad leaf with a type-appropriate default. We coerce rather than
// discard so the model's good fields survive a single stray null. Kept pure and
// scoped to the primitives the newsletter LLM-output schemas actually use
// (object / array / string / number / boolean / enum / optional).

export function coerceToSchema<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return walk(schema, value) as z.infer<T>;
}

function walk(schema: z.ZodTypeAny, value: unknown): unknown {
  if (schema instanceof z.ZodOptional) {
    // An absent or null optional stays absent; otherwise coerce the inner type.
    return value == null ? undefined : walk(schema._def.innerType as z.ZodTypeAny, value);
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const source = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const coerced = walk(fieldSchema, source[key]);
      if (coerced !== undefined) out[key] = coerced;
    }
    return out;
  }

  if (schema instanceof z.ZodArray) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => walk(schema.element as z.ZodTypeAny, item));
  }

  if (schema instanceof z.ZodString) {
    return typeof value === 'string' ? value : '';
  }

  if (schema instanceof z.ZodNumber) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  if (schema instanceof z.ZodBoolean) {
    return typeof value === 'boolean' ? value : false;
  }

  if (schema instanceof z.ZodEnum) {
    const options = schema.options as readonly string[];
    return options.includes(value as string) ? value : options[0];
  }

  // Any schema kind we don't special-case (none in the newsletter LLM schemas)
  // passes through untouched.
  return value;
}
