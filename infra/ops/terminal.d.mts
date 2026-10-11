export function retainedBackups(names: string[]): string[];
export function operationDirectory(qa?: boolean): string;
export function validateProduction(
  config: Record<string, string>,
  qa?: boolean,
  privateAccess?: boolean,
  publicIp?: boolean,
): boolean;
export function main(args?: string[]): Promise<void>;
