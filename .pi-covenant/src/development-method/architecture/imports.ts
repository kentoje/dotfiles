import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import ts from "typescript";

import type { ModuleContract } from "./model.js";

/** Resolve literal imports with TypeScript, including aliases, re-exports and require calls. */
export async function checkModuleImports(
  root: string,
  name: string,
  module: ModuleContract,
  files: readonly string[]
) {
  const config = ts.readConfigFile(
    resolve(root, "tsconfig.json"),
    ts.sys.readFile
  );
  if (config.error) {
    throw new Error(
      "TSCONFIG_INVALID: unable to read module resolution options"
    );
  }
  const { options } = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    root
  );
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
      await readFile(file, "utf-8"),
      ts.ScriptTarget.Latest,
      true
    );
    const imports: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        imports.push(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        const [argument] = node.arguments;
        if (argument && ts.isStringLiteralLike(argument)) {
          imports.push(argument.text);
        }
      }
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression &&
        ts.isStringLiteralLike(node.moduleReference.expression)
      ) {
        imports.push(node.moduleReference.expression.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const specifier of imports) {
      const resolved = ts.resolveModuleName(
        specifier,
        file,
        options,
        ts.sys
      ).resolvedModule;
      if (!resolved) {
        if (specifier.startsWith(".")) {
          throw new Error(`UNRESOLVED_IMPORT: ${file}: ${specifier}`);
        }
        continue;
      }
      if (resolved.isExternalLibraryImport) {
        continue;
      }
      const path = relative(
        resolve(root, "src"),
        resolve(resolved.resolvedFileName)
      );
      if (path.startsWith(`..${sep}`) || path === "..") {
        throw new Error(`IMPORT_ESCAPE: ${file}: ${specifier}`);
      }
      const parts = path.split(sep);
      const [provider] = parts;
      if (!provider || provider === name) {
        continue;
      }
      if (!module.dependencies.includes(provider)) {
        throw new Error(`UNDECLARED_IMPORT: ${name} -> ${provider}`);
      }
      if (parts.length !== 2 || parts[1] !== "module-port.ts") {
        throw new Error(`PRIVATE_MODULE_IMPORT: ${file}: ${specifier}`);
      }
    }
  }
}
