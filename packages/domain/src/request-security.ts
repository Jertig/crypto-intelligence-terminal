/** Origin must match the browser-facing Host, not Next's internal normalized URL. */
export function sameOriginRequest(request: Request, configuredOrigin?: string) {
  try {
    const header = request.headers.get('origin'),
      origin = new URL(header ?? '');
    if (
      origin.origin !== header ||
      origin.username ||
      origin.password ||
      origin.host.toLowerCase() !== request.headers.get('host')?.toLowerCase()
    )
      return false;
    return configuredOrigin
      ? header === new URL(configuredOrigin).origin
      : origin.protocol === 'http:' &&
          ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
  } catch {
    return false;
  }
}
