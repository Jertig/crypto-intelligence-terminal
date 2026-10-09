export function loadLocalEnvironment() {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
}
