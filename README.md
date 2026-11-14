# Dart Browser Compiler (Experimental Subset)

A browser-only lexer, parser, and tree-walking interpreter for a deliberately small subset of Dart, with a limited `dart:io` emulation backed by IndexedDB. It is an experiment—not the Dart SDK, not a complete compiler, and not a fully conforming Dart analyzer or interpreter.

## Run it

Open the project through any static HTTP(S) host (for example, GitHub Pages). The page uses native JavaScript modules and fetches the example manifest, so opening `index.html` directly via `file://` is not supported by browsers that block module/fetch access. No backend service or build/install step is required once hosted. Press **Run** or use Ctrl/Cmd+Enter. The AST tab shows the parsed syntax tree; errors include line and column when available.

## Implemented subset

- Lexer for comments, identifiers, numeric literals, quoted strings, and common operators.
- Parser for `main`, basic typed/`var`/`final`/`const` declarations, functions, simple positional and named parameters, closures/arrow functions, list/map/set literals, string interpolation of simple identifiers, arithmetic and comparison, assignments, if/else, switch, for, for-in, while, do-while, return, break, and continue.
- Interpreter for a limited selection of numbers, strings, booleans, null, lists, maps, sets, selected collection/string methods, and functions/closures.
- `dart:io` subset: `print`, `stdout.write`, `stdout.writeln`, browser-prompt `stdin.readLineSync`, a browser-valued `Platform` subset, and selected synchronous `File`/`Directory` operations. File and directory entries persist in IndexedDB within the current browser profile. `Directory.listSync` is supported; stream-returning `Directory.list` is not.
- `Process`, sockets, `HttpServer`, and `HttpClient` operations fail with an explicit unsupported error rather than silently substituting a different API.

The supported subset is intentionally narrower than the prompt. It is not a static analyzer: declared types are not type-checked, and accepting a program does not establish that the program is valid Dart. A method name or behavior not listed here must not be assumed to match the SDK.

## Not implemented / known differences

- Full Dart grammar or specification compatibility; sound null safety, generic/type inference checks, records, patterns, extensions, class declarations/inheritance/mixins, getters/setters, constructors, exceptions, cascades, and full parameter semantics.
- `async`/`await`, `Future`, `Stream`, generators, event-loop/microtask scheduling, timers, and asynchronous `dart:io` method semantics.
- Most of `dart:core` and all substantial implementation of `dart:math`, `dart:convert`, `dart:collection`, `dart:typed_data`, and other libraries. Imports other than `dart:io` and `dart:core` are rejected explicitly.
- Full `dart:io`: `Link`, async `Directory.list`, binary access, metadata, file modes/encodings, permissions, symlinks, process execution, network access, and many overloads/options.
- Complete SDK-equivalent exception types, argument validation, type system, object model, numeric behavior, and collection semantics. The implementation currently uses JavaScript runtime values internally and will differ in edge cases.
- No conformance comparison against the official Dart SDK has been completed. Do not rely on it for production, security-sensitive, or untrusted programs.

The browser cannot expose the host file system or spawn processes. The virtual file system is isolated from the operating system, but IndexedDB contents are local to the browser profile and can be cleared by the user. The interpreter is not a hardened sandbox: do not paste/run untrusted code.

## Tests and examples

Run `npm test` with Node.js 18 or later. There are 21 curated example programs under `examples/`, including `dart:io` examples. These exercise only the documented subset; they are not an SDK conformance suite.

## Official references

- [Dart language overview](https://dart.dev/language)
- [Dart language documentation](https://dart.dev/language)
- [`dart:io` overview](https://dart.dev/libraries/dart-io) — the official documentation notes that `dart:io` is for non-web apps, command-line scripts, and servers, not web apps.
- [Dart API reference: `File`](https://api.dart.dev/dart-io/File-class.html)

## License

MIT. The supplied logo image is included as a project asset; consult its source/owner for any separate rights or redistribution terms.
