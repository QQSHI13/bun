import { file, spawn } from "bun";
import { describe, expect, it } from "bun:test";
import { bunEnv, bunExe } from "harness";
import { join } from "node:path";

it("should log to console correctly", async () => {
  const { stdout, stderr, exited } = spawn({
    cmd: [bunExe(), join(import.meta.dir, "console-log.js")],
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
    env: bunEnv,
  });
  const exitCode = await exited;
  const err = (await stderr.text()).replaceAll("\r\n", "\n");
  const out = (await stdout.text()).replaceAll("\r\n", "\n");
  const expected = (await new Response(file(join(import.meta.dir, "console-log.expected.txt"))).text()).replaceAll(
    "\r\n",
    "\n",
  );

  const errMatch = err === "uh oh\n";
  const outmatch = out === expected;

  if (errMatch && outmatch && exitCode === 0) {
    expect().pass();
    return;
  }

  console.error(err);
  console.log("Length of output:", out.length);
  console.log("Length of expected:", expected.length);
  console.log("Exit code:", exitCode);

  expect(out).toBe(expected);
  expect(err).toBe("uh oh\n");
  expect(exitCode).toBe(0);
});

it("long arrays get cutoff", () => {
  // console.log(x) === Bun.inspect(x) + "\n" written to stdout.
  expect(Bun.inspect(Array(1000).fill(0))).toEqual(
    "[\n" +
      "  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,\n" +
      "  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,\n" +
      "  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,\n" +
      "  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,\n" +
      "  ... 900 more items\n" +
      "]",
  );
});

it("long arrays get cutoff at a nested indent", () => {
  const row = "          4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,\n";
  expect(Bun.inspect([[[[Array(1000).fill(4)]]]], { depth: 5 })).toEqual(
    "[\n  [\n    [\n      [\n        [\n" +
      row +
      row +
      row +
      row +
      "          4, 4, 4, 4,\n" +
      "          ... 900 more items\n" +
      "        ]\n      ]\n    ]\n  ]\n]",
  );
});

it("console.group", async () => {
  const filepath = join(import.meta.dir, "console-group.fixture.js").replaceAll("\\", "/");
  const proc = Bun.spawnSync({
    cmd: [bunExe(), filepath],
    env: { ...bunEnv, "BUN_JSC_showPrivateScriptsInStackTraces": "0" },
    stdio: ["inherit", "pipe", "pipe"],
  });
  expect(proc.exitCode).toBe(0);
  let stdout = proc.stdout
    .toString("utf8")
    .replaceAll("\r\n", "\n")
    .replaceAll("\\", "/")
    .trim()
    .replaceAll(filepath, "<file>");
  let stderr = proc.stderr
    .toString("utf8")
    .replaceAll("\r\n", "\n")
    .replaceAll("\\", "/")
    .trim()
    .replaceAll(filepath, "<file>")
    // Normalize line numbers for consistency between debug and release builds
    .replace(/\(\d+:\d+\)/g, "(N:NN)")
    .replace(/<file>:\d+:\d+/g, "<file>:NN:NN");
  expect(stdout).toMatchInlineSnapshot(`
"Basic group
  Inside basic group
Outer group
  Inside outer group
  Inner group
    Inside inner group
  Back to outer group
Level 1
  Level 2
    Level 3
      Deep inside
undefined
Empty nested
Test extra end
  Inside
Different logs
  Regular log
  Info log
  Debug log
Complex types
  {
    a: 1,
    b: 2,
  }
  [ 1, 2, 3 ]
null
  undefined
    0
      false
        
          Inside falsy groups
🎉 Unicode!
  Inside unicode group
  Tab\tNewline
Quote"Backslash
    Special chars"
`);
  expect(stderr).toMatchInlineSnapshot(`
"Warning log
  warn: console.warn an error
      at <file>:NN:NN

  52 | console.group("Different logs");
53 | console.log("Regular log");
54 | console.info("Info log");
55 | console.warn("Warning log");
56 | console.warn(new Error("console.warn an error"));
57 | console.error(new Error("console.error an error"));
                       ^
error: console.error an error
      at <file>:NN:NN

  53 | console.log("Regular log");
54 | console.info("Info log");
55 | console.warn("Warning log");
56 | console.warn(new Error("console.warn an error"));
57 | console.error(new Error("console.error an error"));
58 | console.error(new NamedError("console.error a named error"));
                   ^
NamedError: console.error a named error
      at <file>:NN:NN

  NamedError: console.warn a named error
      at <file>:NN:NN

  Error log"
`);
});

describe("console %s follows util.format", () => {
  async function run(script: string, env: NodeJS.Dict<string> = bunEnv) {
    await using proc = spawn({ cmd: [bunExe(), "-e", script], env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    return { stdout, stderr, exitCode };
  }

  it.each([
    ["NO_COLOR", bunEnv],
    ["FORCE_COLOR", { ...bunEnv, NO_COLOR: undefined, FORCE_COLOR: "1" }],
  ])("prints a Symbol and an object with no toString, and inspects the other objects (%s)", async (_, env) => {
    const { stdout, exitCode } = await run(
      `
      import util from "node:util";
      const values = [
        Symbol("id"),
        /(?<year>[0-9]{4})-(?<month>[0-9]{2})/.exec("2026-10").groups,
        util.parseArgs({ args: ["--port", "80"], options: { port: { type: "string" } } }).values,
        Object.groupBy([1, 2, 3], n => (n % 2 ? "odd" : "even")),
        [Symbol("in array")],
        { a: 1 },
        [1, 2],
        -0,
        42n,
        new Date(1700000000000),
        new Map([[1, 2]]),
        new String("boxed"),
        /re/g,
      ];
      for (const value of values) console.log("v %s", value);
    `,
      env,
    );
    expect({ stdout, exitCode }).toEqual({
      stdout:
        [
          "v Symbol(id)",
          "v [Object: null prototype] { year: '2026', month: '10' }",
          "v [Object: null prototype] { port: '80' }",
          "v [Object: null prototype] { odd: [Array], even: [Array] }",
          "v [ Symbol(in array) ]",
          "v { a: 1 }",
          "v [ 1, 2 ]",
          "v -0",
          "v 42n",
          "v 2023-11-14T22:13:20.000Z",
          "v Map(1) { 1 => 2 }",
          "v [String: 'boxed']",
          "v /re/g",
        ].join("\n") + "\n",
      exitCode: 0,
    });
  });

  it("keeps String(value) for primitives, functions and objects with their own toString", async () => {
    const { stdout, exitCode } = await run(`
      class Money { toString() { return "$12.34"; } }
      console.log("%s|%s|%s|%s|%s|%s|%s", "a string", 42, 1.5, true, null, undefined, function named() {});
      console.log("%s|%s", new URL("http://example.com/a"), Buffer.from("ab"));
      console.log("%s|%s", new Money(), { [Symbol.toPrimitive]() { return "primitive"; } });
      try {
        console.log("%s", { toString() { throw new Error("from toString"); } });
      } catch (e) {
        console.log("caught " + e.message);
      }
    `);
    expect({ stdout, exitCode }).toEqual({
      stdout:
        "a string|42|1.5|true|null|undefined|function named() {}\n" +
        "http://example.com/a|ab\n" +
        "$12.34|primitive\n" +
        "caught from toString\n",
      exitCode: 0,
    });
  });

  it("every console entry point prints what util.format returns", async () => {
    const { stdout, stderr, exitCode } = await run(`
      import util from "node:util";
      const values = [
        Symbol("id"),
        /(?<year>[0-9]{4})/.exec("2026").groups,
        { a: 1 },
        [Symbol("in array")],
        -0,
        42n,
        new (class Point { x = 1 })(),
        new URL("http://example.com/a"),
        import.meta,
        { [util.inspect.custom]() { return "custom inspect"; } },
        new ReadableStream(),
      ];
      const entries = {
        log: (format, value) => console.log(format, value),
        info: (format, value) => console.info(format, value),
        debug: (format, value) => console.debug(format, value),
        warn: (format, value) => console.warn(format, value),
        error: (format, value) => console.error(format, value),
        trace: (format, value) => console.trace(format, value),
        assert: (format, value) => console.assert(false, format, value),
        group: (format, value) => (console.group(format, value), console.groupEnd()),
        groupCollapsed: (format, value) => (console.groupCollapsed(format, value), console.groupEnd()),
        dirxml: (format, value) => console.dirxml(format, value),
        table: (format, value) => console.table(format, [value]),
        notFirstArgument: (format, value) => console.log(0, format, value),
        regExpAsFormat: (format, value) => console.log(new RegExp(format), value),
        stringObjectAsFormat: (format, value) => console.log(new String(format), value),
      };
      const alone = values.map(value => util.format("%s", value));
      const inArray = values.map(value => util.format("%s", [value]));
      const expected = {};
      for (const name in entries) {
        values.forEach((value, i) => entries[name]("@@<" + name + "." + i + ":%s>@@", value));
        expected[name] = name === "table" ? inArray : alone;
      }
      const error = new RangeError("boom");
      console.error("@@<errorWithStack.0:%s>@@", error);
      expected.errorWithStack = [util.format("%s", error)];
      console.log("@@EXPECTED" + JSON.stringify(expected));
    `);
    const printed: Record<string, string[]> = {};
    for (const [, entry, i, text] of (stdout + stderr).matchAll(/@@<(\w+)\.(\d+):([\s\S]*?)>@@/g)) {
      (printed[entry] ??= [])[Number(i)] = text;
    }
    expect(printed).toEqual(JSON.parse(stdout.slice(stdout.lastIndexOf("@@EXPECTED") + "@@EXPECTED".length)));
    expect(printed.errorWithStack?.[0]).toStartWith("RangeError: boom\n    at ");
    expect(exitCode).toBe(0);
  });

  it("indents every line of an object under console.group", async () => {
    const { stdout, exitCode } = await run(`
      const wide = { a: Buffer.alloc(40, "x").toString(), b: Buffer.alloc(40, "y").toString() };
      console.group("outer");
      console.log("wide %s end", wide);
      console.group("inner");
      console.log("%s", wide);
      console.groupEnd();
      console.groupEnd();
      console.log("%s", wide);
    `);
    const x = Buffer.alloc(40, "x").toString();
    const y = Buffer.alloc(40, "y").toString();
    expect({ stdout, exitCode }).toEqual({
      stdout:
        "outer\n" +
        `  wide {\n    a: '${x}',\n    b: '${y}'\n  } end\n` +
        "  inner\n" +
        `    {\n      a: '${x}',\n      b: '${y}'\n    }\n` +
        `{\n  a: '${x}',\n  b: '${y}'\n}\n`,
      exitCode: 0,
    });
  });

  it("loads no module for a primitive and not the inspector for an object with its own toString", async () => {
    const { stdout, exitCode } = await run(`
      import { heapStats } from "bun:jsc";
      const functionExecutables = () => {
        Bun.gc(true);
        return heapStats().objectTypeCounts.FunctionExecutable ?? 0;
      };
      const url = new URL("http://example.com/a");
      const symbol = Symbol("s");
      console.log("warm %s", "up");
      functionExecutables();
      const before = functionExecutables();
      console.log("%s %s %s %s %s %s %s %s", "a string", 42, 1.5, -0, 42n, symbol, true, null);
      const afterPrimitives = functionExecutables();
      console.log("%s", url);
      const afterOwnToString = functionExecutables();
      console.log("%s", {});
      const afterInspected = functionExecutables();
      console.log(JSON.stringify({
        primitives: afterPrimitives - before,
        ownToStringLoadsLessThanInspected: afterOwnToString - afterPrimitives < afterInspected - afterOwnToString,
        inspectedLoadsTheInspector: afterInspected - afterOwnToString > 50,
      }));
    `);
    expect({ stdout, exitCode }).toEqual({
      stdout:
        "warm up\n" +
        "a string 42 1.5 -0 42n Symbol(s) true null\n" +
        "http://example.com/a\n" +
        "{}\n" +
        JSON.stringify({ primitives: 0, ownToStringLoadsLessThanInspected: true, inspectedLoadsTheInspector: true }) +
        "\n",
      exitCode: 0,
    });
  });

  // The first use loads a JS module. With no stack left for JS that load throws a RangeError.
  it.each([
    [
      "%s of an object",
      [`console.log("%s", { a: 1 })`, `console.log("%s", stream)`],
      ["{ a: 1 }", "ReadableStream [Object]"],
    ],
    [
      "an object with a native inspect hook",
      [`console.log(stream)`],
      ["ReadableStream { locked: false, state: 'readable', supportsBYOB: false }"],
    ],
  ])("survives a first use at an exhausted stack: %s", async (_, logs, lines) => {
    // The catch block calls the native console function directly: a JS call would itself overflow.
    const atExhaustedStackThenAgain = (log: string) => `{
      let attempted = false;
      (function recurse() {
        try {
          recurse();
        } catch {
          if (attempted) return;
          attempted = true;
          ${log};
        }
      })();
      ${log};
    }`;
    const { stdout, exitCode } = await run(`
      const stream = new ReadableStream();
      ${logs.map(atExhaustedStackThenAgain).join("\n")}
      console.log("done");
    `);
    // The attempt at the exhausted stack prints the same line, or throws.
    const printed = stdout.split("\n").filter((line, i, all) => line !== all[i - 1]);
    expect({ printed, exitCode }).toEqual({ printed: [...lines, "done", ""], exitCode: 0 });
  });

  it("inspects with the original util.inspect after the public export is replaced", async () => {
    const { stdout, exitCode } = await run(`
      require("node:util").inspect = 123;
      console.log(new ReadableStream());
      console.log("%s", new ReadableStream());
    `);
    expect({ stdout, exitCode }).toEqual({
      stdout:
        "ReadableStream { locked: false, state: 'readable', supportsBYOB: false }\n" + "ReadableStream [Object]\n",
      exitCode: 0,
    });
  });

  it("covers console.table's fall-through, a Worker and a ShadowRealm", async () => {
    const { stdout, exitCode } = await run(`
      console.table("table %s", [Symbol("t")]);
      const source = 'console.log("worker %s %s", Symbol("w"), { a: 1 }); postMessage(0);';
      const worker = new Worker(URL.createObjectURL(new Blob([source])));
      await new Promise(resolve => (worker.onmessage = resolve));
      worker.terminate();
      new ShadowRealm().evaluate('console.log("realm %s %s", Symbol("r"), { a: 1 })');
    `);
    expect({ stdout, exitCode }).toEqual({
      stdout: "table [ Symbol(t) ]\n" + "worker Symbol(w) { a: 1 }\n" + "realm Symbol(r) { a: 1 }\n",
      exitCode: 0,
    });
  });
});

it("console.log with SharedArrayBuffer", () => {
  // console.log(x) === Bun.inspect(x) + "\n" written to stdout.
  expect(Bun.inspect(new ArrayBuffer(0))).toBe("ArrayBuffer(0) []");
  expect(Bun.inspect(new SharedArrayBuffer(0))).toBe("SharedArrayBuffer(0) []");
  expect(Bun.inspect(new ArrayBuffer(3))).toBe("ArrayBuffer(3) [ 0, 0, 0 ]");
  expect(Bun.inspect(new SharedArrayBuffer(3))).toBe("SharedArrayBuffer(3) [ 0, 0, 0 ]");
});
