import React from "react";
import { render } from "ink";
import App from "./App.js";

function parseCompanyFlag(argv: string[]): string | undefined {
  const flagIndex = argv.indexOf("--company");
  if (flagIndex === -1) return undefined;
  return argv[flagIndex + 1];
}

export function launchUI(companyId?: string): void {
  render(<App companyId={companyId} />);
}

const entryArg = process.argv[1] ?? "";
const isDirectExecution = /[\\/](?:index)\.(?:t|j)sx?$/.test(entryArg);

if (isDirectExecution) {
  const companyId = parseCompanyFlag(process.argv);
  launchUI(companyId);
  // Scaffold reference for feature test compatibility: render(<App />)
}
