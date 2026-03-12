export interface PluginConfig {
  enabled: boolean;
  /**
   * Model to use for knowledge extraction. Format: "providerID/modelID"
   * Example: "minimax/MiniMax-M2.1", "openai/gpt-4o"
   * If not specified, uses OpenCode's default model.
   */
  extractionModel?: string;
  /**
   * Max token budget for extraction context.
   * Default: 16000
   */
  extractionMaxTokens?: number;
}
