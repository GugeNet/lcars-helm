/**
 * The slice of the Signal K plugin API this plugin actually uses, typed by hand
 * rather than depending on `@signalk/server-api` (which would pull in `express`
 * types purely for `registerWithRouter`'s router parameter). Verified against the
 * running server in node_modules/signalk-server/dist/interfaces/plugins.js:
 * `getSelfPath`, `getDataDirPath`, `setPluginStatus`, `setPluginError` and
 * `registerWithRouter` are exactly what is offered and exactly what is needed.
 */
export interface SignalKPathValue {
  value: unknown
  timestamp: string
  $source?: string
}

export interface ServerApi {
  getSelfPath(path: string): SignalKPathValue | undefined
  getDataDirPath(): string
  setPluginStatus(message: string): void
  setPluginError(message: string): void
}

export interface RouterRequest {
  body?: unknown
}

export interface RouterResponse {
  status(code: number): RouterResponse
  json(body: unknown): void
}

export interface PluginRouter {
  get(path: string, handler: (req: RouterRequest, res: RouterResponse) => void): void
  put(path: string, handler: (req: RouterRequest, res: RouterResponse) => void): void
}

export interface PluginDefinition {
  id: string
  name: string
  schema: () => Record<string, unknown>
  start: (options: Record<string, unknown>) => void
  stop: () => void
  registerWithRouter: (router: PluginRouter) => void
}
