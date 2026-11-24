// Test utility: reduces a JSON Schema (the contract file, or one generated from zod) to a
// canonical tree so two schemas can be compared for meaning, not spelling.
// Handles $ref/$defs, `type: [x, "null"]` vs `anyOf [x, {type: null}]`, enum-with-null,
// and const. Descriptions, titles and $id are ignored. Shared by the app contract test
// (T046) and the Deno schema test.
type J = Record<string, unknown>;

const KEEP = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
] as const;

export function canonical(schema: J): unknown {
  const defs = (schema.$defs ?? schema.definitions ?? {}) as Record<string, J>;
  const resolve = (s: J): J => {
    if (typeof s.$ref === 'string') {
      const name = s.$ref.replace(/^#\/(\$defs|definitions)\//, '');
      const target = defs[name];
      if (!target) throw new Error(`unresolved $ref ${s.$ref}`);
      return resolve(target);
    }
    return s;
  };

  const walk = (input: J): J => {
    const s = resolve(input);
    // anyOf [X, {type:null}] → X + nullable
    if (Array.isArray(s.anyOf)) {
      const parts = (s.anyOf as J[]).map(resolve);
      const nonNull = parts.filter((p) => p.type !== 'null');
      if (nonNull.length === 1 && parts.length === 2) return { ...walk(nonNull[0]!), nullable: true };
      return { anyOf: parts.map(walk) };
    }
    const out: J = {};
    let types = s.type === undefined ? [] : Array.isArray(s.type) ? [...(s.type as string[])] : [s.type as string];
    if (types.includes('null')) {
      out.nullable = true;
      types = types.filter((t) => t !== 'null');
    }
    if ('const' in s) return { ...out, const: s.const };
    if (Array.isArray(s.enum)) {
      const values = s.enum as unknown[];
      if (values.includes(null)) out.nullable = true;
      return {
        ...out,
        enum: values
          .filter((v) => v !== null)
          .map(String)
          .sort(),
      };
    }
    if (types.length) out.type = types.length === 1 ? types[0] : types.sort();
    for (const k of KEEP) if (k in s) out[k] = s[k];
    if (out.type === 'object' || s.properties) {
      out.type = 'object';
      out.strict = s.additionalProperties === false;
      out.required = [...((s.required as string[]) ?? [])].sort();
      const props = (s.properties ?? {}) as Record<string, J>;
      out.properties = Object.fromEntries(
        Object.keys(props)
          .sort()
          .map((k) => [k, walk(props[k]!)]),
      );
    }
    if (out.type === 'array' || s.items) {
      out.type = 'array';
      out.items = walk(s.items as J);
    }
    return out;
  };

  return walk(schema);
}
