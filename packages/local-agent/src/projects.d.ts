import type { CompanyProject } from "./executor.js";

export function loadProjectsFromCLI(
  companyId: string,
  runExecFileSync?: (
    file: string,
    args: readonly string[],
    options: { encoding: BufferEncoding; timeout: number },
  ) => string,
): CompanyProject[];
