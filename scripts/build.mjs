#!/usr/bin/env node

import { mkdir, readdir, readFile, rm, chmod, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import process from 'node:process';

import ts from 'typescript';

const projectRoot = process.cwd();
const srcDir = resolve(projectRoot, 'src');
const outDir = resolve(projectRoot, 'build');

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectTypeScriptFiles(entryPath);
      }

      return extname(entry.name) === '.ts' ? [entryPath] : [];
    }),
  );

  return files.flat();
}

async function transpileFile(filePath) {
  const source = await readFile(filePath, 'utf8');
  const relativePath = relative(srcDir, filePath);
  const outputPath = resolve(outDir, relativePath.replace(/\.ts$/u, '.js'));
  const outputDir = dirname(outputPath);

  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
    },
    fileName: filePath,
    reportDiagnostics: true,
  });

  if (diagnostics && diagnostics.length > 0) {
    const host = {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => projectRoot,
      getNewLine: () => '\n',
    };
    const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, host);
    throw new Error(message);
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, outputText);
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  const files = await collectTypeScriptFiles(srcDir);
  await Promise.all(files.map((filePath) => transpileFile(filePath)));

  const topLevelEntries = await readdir(outDir, { withFileTypes: true });
  await Promise.all(
    topLevelEntries
      .filter((entry) => entry.isFile() && extname(entry.name) === '.js')
      .map((entry) => chmod(join(outDir, entry.name), 0o755)),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
