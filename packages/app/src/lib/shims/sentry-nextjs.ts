type NoopOptions = Record<string, unknown> | undefined;

export function init(_options?: NoopOptions): void {}

export function captureException(_error: unknown, _context?: NoopOptions): void {}

export function captureMessage(
  _message: string,
  _levelOrContext?: string | NoopOptions,
  _context?: NoopOptions
): void {}

export function addBreadcrumb(_breadcrumb: NoopOptions): void {}

export function replayIntegration(_options?: NoopOptions): Record<string, never> {
  return {};
}

export function withSentryConfig<T>(config: T, _options?: NoopOptions): T {
  return config;
}
