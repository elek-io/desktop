// What a Core schema says about one of its fields, read through zod's public
// API so Desktop never repeats a limit Core sets.
//
// It holds no words and no React, which is what lets it be read without a
// window. The words a field shows are built from what this answers, in
// lib/fieldRules.ts.
//
// See contributing/renderer/forms.md#the-field-shell.

/**
 * The parts of a zod schema the walk below reads.
 *
 * Declared structurally rather than taken from zod's own types, because the
 * base `ZodType` types `def` as the one key every schema shares and narrowing
 * it needs the concrete class. Read structurally, one walk covers every shape
 * a Core schema is built from and nothing depends on which copy of zod built
 * it.
 */
interface SchemaNode {
  def: {
    type: string;
    shape?: unknown;
    element?: unknown;
    valueType?: unknown;
    innerType?: unknown;
    in?: unknown;
    out?: unknown;
    options?: unknown;
    getter?: unknown;
  };
  minLength?: unknown;
  maxLength?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  isOptional: () => boolean;
  isNullable: () => boolean;
}

/** What a Core schema says a field has to hold. */
export interface FieldConstraints {
  /** Whether the field has to be filled for Core to take the object. */
  required: boolean;
  /** The fewest characters a string field takes. */
  minLength?: number;
  /** The most characters a string field takes. */
  maxLength?: number;
  /** The smallest number a number field takes. */
  minValue?: number;
  /** The largest number a number field takes. */
  maxValue?: number;
}

function isSchemaNode(value: unknown): value is SchemaNode {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate: {
    def?: unknown;
    isOptional?: unknown;
    isNullable?: unknown;
  } = value;
  return (
    typeof candidate.isOptional === 'function' &&
    typeof candidate.isNullable === 'function' &&
    typeof candidate.def === 'object' &&
    candidate.def !== null &&
    'type' in candidate.def
  );
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== 'number') {
    // zod answers `null` for a length a schema does not bound.
    return undefined;
  }
  // Three answers are the type's own reach rather than a rule somebody set,
  // and none of them is worth a word beside a label: an unbounded number
  // schema answers with an infinity, and an integer one with the largest
  // integer JavaScript counts exactly.
  return Number.isFinite(value) && Math.abs(value) !== Number.MAX_SAFE_INTEGER
    ? value
    : undefined;
}

/** A wrapper's inner schema, or `null` where this is not a wrapper. */
function unwrapped(node: SchemaNode): SchemaNode | null {
  const { type } = node.def;
  // `in` rather than `out`: a form holds what somebody types, which is the
  // schema's input side, and Core's generated schemas pipe that to a strict
  // output. `prefault` and `default` fill a missing input, so what the field
  // itself takes sits inside them.
  const inner =
    type === 'pipe'
      ? node.def.in
      : type === 'lazy'
        ? // Recursive schemas, such as a Collection's field definitions, name
          // themselves through a getter.
          (typeof node.def.getter === 'function'
            ? node.def.getter
            : () => null)()
        : type === 'optional' ||
            type === 'nullable' ||
            type === 'nonoptional' ||
            type === 'default' ||
            type === 'prefault' ||
            type === 'readonly' ||
            type === 'catch'
          ? node.def.innerType
          : null;

  return isSchemaNode(inner) ? inner : null;
}

/** The schema behind every wrapper around it. */
function unwrapAll(node: SchemaNode): SchemaNode {
  let current = node;
  let inner = unwrapped(current);
  // A schema cannot wrap itself without the getter answering a new node, so the
  // walk ends. The bound guards a schema that does.
  for (let step = 0; inner !== null && step < 20; step += 1) {
    current = inner;
    inner = unwrapped(current);
  }
  return current;
}

/** What a schema bounds its Value by, leaving out what it does not bound. */
type Bounds = Omit<FieldConstraints, 'required'>;

/** The tighter of two bounds, key by key. */
function tighter(one: Bounds, other: Bounds): Bounds {
  const lower = (a?: number, b?: number): number | undefined =>
    a === undefined ? b : b === undefined ? a : Math.max(a, b);
  const upper = (a?: number, b?: number): number | undefined =>
    a === undefined ? b : b === undefined ? a : Math.min(a, b);

  const minLength = lower(one.minLength, other.minLength);
  const maxLength = upper(one.maxLength, other.maxLength);
  const minValue = lower(one.minValue, other.minValue);
  const maxValue = upper(one.maxValue, other.maxValue);

  return {
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(minValue === undefined ? {} : { minValue }),
    ...(maxValue === undefined ? {} : { maxValue }),
  };
}

/**
 * What the schema at `node` bounds its Value by, through every wrapper around
 * it.
 *
 * A pipe is read on both sides and the tighter bound of the two wins, because
 * a form is checked against the whole pipe. Core's reports are the case: the
 * message somebody types is a bare string whose length Core bounds on the
 * other side of the pipe.
 */
function boundsIn(node: SchemaNode, step = 0): Bounds {
  const own: Bounds = (() => {
    const minLength = asNumber(node.minLength);
    const maxLength = asNumber(node.maxLength);
    const minValue = asNumber(node.minValue);
    const maxValue = asNumber(node.maxValue);
    return {
      ...(minLength === undefined ? {} : { minLength }),
      ...(maxLength === undefined ? {} : { maxLength }),
      ...(minValue === undefined ? {} : { minValue }),
      ...(maxValue === undefined ? {} : { maxValue }),
    };
  })();

  if (step >= 20) {
    return own;
  }

  const inner = unwrapped(node);
  const sides = [inner, node.def.type === 'pipe' ? node.def.out : null].filter(
    (side): side is SchemaNode => isSchemaNode(side)
  );

  return sides.reduce<Bounds>(
    (bounds, side) => tighter(bounds, boundsIn(side, step + 1)),
    own
  );
}

/** The schema of one segment below `node`, or `null` where it has none. */
function child(node: SchemaNode, segment: string): unknown {
  const { type, shape, element, valueType } = node.def;

  if (type === 'object' && typeof shape === 'object' && shape !== null) {
    const fields: Record<string, unknown> = { ...shape };
    return fields[segment];
  }
  // A record keys every language the same way, so the segment is the language
  // and the schema below it is the record's value.
  if (type === 'record') {
    return valueType;
  }
  if (type === 'array') {
    return element;
  }
  return null;
}

function constraintsOf(
  node: SchemaNode,
  optionalAbove: boolean
): FieldConstraints {
  const leafType = unwrapAll(node).def.type;
  // Two shapes say nothing about being required, however strictly Core asks
  // for the key:
  //
  // - A list. The fewest items it takes is the rule somebody in front of the
  //   field could break, and zod's public API carries no minimum for an array.
  //   A list that really has to hold something says so through the prop the
  //   shell takes, see `AppField`.
  // - A boolean. It is true or false and can never be empty, so Required would
  //   name a rule nobody can break.
  const alwaysFilled = leafType === 'array' || leafType === 'boolean';

  return {
    required:
      alwaysFilled === false &&
      optionalAbove === false &&
      node.isOptional() === false &&
      node.isNullable() === false,
    ...boundsIn(node),
  };
}

/** The one value every member of a union agrees on, or nothing. */
function agreed<T>(
  members: FieldConstraints[],
  read: (member: FieldConstraints) => T
): T | undefined {
  const [first, ...rest] = members;
  if (first === undefined) {
    return undefined;
  }
  const value = read(first);
  return rest.every((member) => read(member) === value) ? value : undefined;
}

/**
 * What a union says about a field, which is what every one of its members
 * agrees on.
 *
 * Core writes a few objects as a union of their kinds, a User as a local and a
 * Cloud one for instance, and a key both kinds declare the same way is a limit
 * Core sets either way. A key they disagree about is left unsaid rather than
 * guessed.
 */
function unionConstraints(
  options: unknown,
  path: string[],
  optionalAbove: boolean
): FieldConstraints | null {
  if (Array.isArray(options) === false) {
    return null;
  }

  const members: FieldConstraints[] = [];
  for (const option of options) {
    const member = walk(option, path, optionalAbove);
    if (member === null) {
      return null;
    }
    members.push(member);
  }
  if (members.length === 0) {
    return null;
  }

  const required = agreed(members, (member) => member.required);
  const minLength = agreed(members, (member) => member.minLength);
  const maxLength = agreed(members, (member) => member.maxLength);
  const minValue = agreed(members, (member) => member.minValue);
  const maxValue = agreed(members, (member) => member.maxValue);

  return {
    // A key one kind demands and another does not is not a rule of the object,
    // so the field says nothing rather than claiming one.
    required: required ?? false,
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(minValue === undefined ? {} : { minValue }),
    ...(maxValue === undefined ? {} : { maxValue }),
  };
}

function walk(
  schema: unknown,
  path: string[],
  optionalAbove: boolean
): FieldConstraints | null {
  if (isSchemaNode(schema) === false) {
    return null;
  }

  const [segment, ...rest] = path;
  if (segment === undefined) {
    return constraintsOf(schema, optionalAbove);
  }

  // A field below something the object may leave out, such as a description
  // that may be null, is not required either, however strict the leaf is.
  const optionalHere =
    optionalAbove || schema.isOptional() || schema.isNullable();
  const node = unwrapAll(schema);

  if (node.def.type === 'union') {
    return unionConstraints(node.def.options, path, optionalHere);
  }

  return walk(child(node, segment), rest, optionalHere);
}

/**
 * What `schema` says about the field at `path`, or `null` where it cannot say.
 *
 * `null` is the answer for a path the schema does not describe, and for one it
 * describes in a shape the walk cannot follow, such as inside a union whose
 * members disagree about the object they hold. A field that gets `null` says
 * what its caller passes instead, see `AppField`.
 *
 * @param path A dot path, as react-hook-form names a field
 */
export function constraintsAt(
  schema: unknown,
  path: string
): FieldConstraints | null {
  return walk(schema, path.split('.'), false);
}
