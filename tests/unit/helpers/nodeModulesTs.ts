/**
 * Lets `node --test` import the TypeScript-source packages SMOL ships to the
 * browser (passkey-kit@0.12.0 → passkey-kit-sdk / sac-sdk all publish `src/*.ts`).
 * Node refuses to strip types under node_modules, and those sources use
 * parameter properties + enums, so they are transpiled with the project's own
 * TypeScript compiler. Extensionless relative specifiers resolve to `.ts`.
 */
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const isNodeModulesTs = (url: string) => url.startsWith('file:') && url.includes('/node_modules/') && url.endsWith('.ts');

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const fromNodeModulesTs = context.parentURL ? isNodeModulesTs(context.parentURL) : false;
      const isPackageSubpath = /^passkey-kit\//.test(specifier);
      if (!fromNodeModulesTs && !isPackageSubpath) throw error;
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return nextResolve(specifier + suffix, context);
        } catch {
          // try next suffix
        }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (!isNodeModulesTs(url)) return nextLoad(url, context);
    const source = readFileSync(fileURLToPath(url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: false,
        isolatedModules: true,
      },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  },
});
