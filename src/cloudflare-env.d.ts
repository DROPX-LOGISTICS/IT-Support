interface IntegrationKvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
interface CloudflareEnv {
  INTEGRATIONS?: IntegrationKvNamespace;
  INTEGRATION_ENCRYPTION_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}
