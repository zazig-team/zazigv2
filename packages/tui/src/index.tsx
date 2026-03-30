import React from "react";
import { render } from "ink";
import App from "./App.js";

function parseCompanyFlag(argv: string[]): string | undefined {
  const flagIndex = argv.indexOf("--company");
  if (flagIndex === -1) return undefined;
  return argv[flagIndex + 1];
}

const companyId = parseCompanyFlag(process.argv);

render(<App companyId={companyId} />);
// Scaffold reference for feature test compatibility: render(<App />)
