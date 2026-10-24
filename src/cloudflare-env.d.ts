interface IntegrationKvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}
interface CloudflareEnv {
  INTEGRATIONS?: IntegrationKvNamespace;
  INTEGRATION_ENCRYPTION_KEY?: string;
}
