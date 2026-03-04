type NoopOptions = Record<string, unknown> | undefined;

export function init(options?: NoopOptions): void {
  void options;
}

export function captureException(error: unknown, context?: NoopOptions): void {
  void error;
  void context;
}

export function captureMessage(
  message: string,
  levelOrContext?: string | NoopOptions,
  context?: NoopOptions
): void {
  void message;
  void levelOrContext;
  void context;
}

export function addBreadcrumb(breadcrumb: NoopOptions): void {
  void breadcrumb;
}

export function replayIntegration(options?: NoopOptions): Record<string, never> {
  void options;
  return {};
}

export function withSentryConfig<T>(config: T, options?: NoopOptions): T {
  void options;
  return config;
}
