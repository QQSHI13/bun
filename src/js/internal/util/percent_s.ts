// The object half of Node's `%s` rule: formatWithOptionsInternal, case 115, in
// https://github.com/nodejs/node/blob/main/lib/internal/util/inspect.js
// util.format, console.Console and the native global console all call `format`.
// No module-scope requires: `%s` of an object that prints through its own
// toString (a URL, a Buffer) must not load internal/util/inspect.

const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const hasOwnProperty = Object.prototype.hasOwnProperty;
const SymbolToPrimitive = Symbol.toPrimitive;

function ObjectPrototypeHasOwnProperty(object, key: PropertyKey): boolean {
  return hasOwnProperty.$call(object, key);
}

// Node.js computes this from `globalThis` at bootstrap, before any host globals
// (Buffer, URL, ...) are installed. Bun's globalThis already has them when this
// module loads, so hardcode the names Node observes instead of scraping.
// prettier-ignore
const builtInObjects = new Set([
  "AggregateError", "Array", "ArrayBuffer", "Atomics", "BigInt", "BigInt64Array",
  "BigUint64Array", "Boolean", "DataView", "Date", "Error", "EvalError",
  "FinalizationRegistry", "Float32Array", "Float64Array", "Function", "Infinity",
  "Int16Array", "Int32Array", "Int8Array", "Intl", "Iterator", "JSON", "Map",
  "Math", "NaN", "Number", "Object", "Promise", "Proxy", "RangeError",
  "ReferenceError", "Reflect", "RegExp", "Set", "String", "Symbol", "SyntaxError",
  "TypeError", "URIError", "Uint16Array", "Uint32Array", "Uint8Array",
  "Uint8ClampedArray", "WeakMap", "WeakRef", "WeakSet",
]);

function getProxyDetails(proxy, withHandler = true) {
  const isProxy = $isProxyObject(proxy);
  if (!isProxy) return undefined;
  const handler = $getProxyInternalField(proxy, $proxyFieldHandler);
  // if handler is null, the proxy is revoked
  const target = handler === null ? null : $getProxyInternalField(proxy, $proxyFieldTarget);
  if (withHandler) return [target, handler];
  else return target;
}

function returnFalse() {
  return false;
}

function hasBuiltInToString(value) {
  // Prevent triggering proxy traps.
  const getFullProxy = false;
  const proxyTarget = getProxyDetails(value, getFullProxy);
  if (proxyTarget !== undefined) {
    if (proxyTarget === null) {
      return true;
    }
    return hasBuiltInToString(proxyTarget);
  }

  let hasOwnToString = ObjectPrototypeHasOwnProperty;
  let hasOwnToPrimitive = ObjectPrototypeHasOwnProperty;

  // Count objects without `toString` and `Symbol.toPrimitive` function as built-in.
  if (typeof value.toString !== "function") {
    if (typeof value[SymbolToPrimitive] !== "function") {
      return true;
    } else if (ObjectPrototypeHasOwnProperty(value, SymbolToPrimitive)) {
      return false;
    }
    hasOwnToString = returnFalse;
  } else if (ObjectPrototypeHasOwnProperty(value, "toString")) {
    return false;
  } else if (typeof value[SymbolToPrimitive] !== "function") {
    hasOwnToPrimitive = returnFalse;
  } else if (ObjectPrototypeHasOwnProperty(value, SymbolToPrimitive)) {
    return false;
  }

  // Find the object that has the `toString` property or `Symbol.toPrimitive` property
  // as own property in the prototype chain.
  let pointer = value;
  do {
    pointer = ObjectGetPrototypeOf(pointer);
    // `import.meta` has a callable `toString` that no object on its chain owns.
    if (pointer === null) {
      return true;
    }
  } while (!hasOwnToString(pointer, "toString") && !hasOwnToPrimitive(pointer, SymbolToPrimitive));

  // Check closer if the object is a built-in.
  const descriptor = ObjectGetOwnPropertyDescriptor(pointer, "constructor");
  return (
    descriptor !== undefined && typeof descriptor.value === "function" && builtInObjects.$has(descriptor.value.name)
  );
}

type Inspect = (value: unknown, options: object) => string;
let lazyInspect: Inspect | undefined;

// `%s` of a non-null `typeof value === "object"` argument. The native console passes `value` alone.
function format(value: object, inspectOptions?: object, inspect?: Inspect): string {
  if (!hasBuiltInToString(value)) {
    return String(value);
  }
  inspect ??= lazyInspect ??= require("internal/util/inspect").inspect as Inspect;
  return inspect(value, {
    ...inspectOptions,
    compact: 3,
    colors: false,
    depth: 0,
  });
}

export default { builtInObjects, getProxyDetails, format };
