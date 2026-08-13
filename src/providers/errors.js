export class ProviderUnavailableError extends Error {
  constructor({ provider, reason, status }) {
    const statusSuffix = status === undefined ? "" : ` (${status})`;
    super(`${provider} unavailable: ${reason}${statusSuffix}`);
    this.name = "ProviderUnavailableError";
    this.provider = provider;
    this.reason = reason;
    this.status = status;
  }
}
