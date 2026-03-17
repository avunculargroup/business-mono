// Wraps signal-cli REST API (bbernhard/signal-cli-rest-api)
// Base URL from env: SIGNAL_CLI_API_URL (default: http://signal-cli.railway.internal:8080)

import type {
  SendMessageParams,
  SendGroupMessageParams,
  SendMessageResult,
  IncomingMessage,
  SignalGroup,
  SignalContact,
  ReactionParams,
  AttachmentParams,
} from './types.js';

export class SignalClient {
  private baseUrl: string;
  private account: string; // Simon's registered number, e.g. "+61400000000"

  constructor(config?: { baseUrl?: string; account?: string }) {
    this.baseUrl = config?.baseUrl ?? process.env['SIGNAL_CLI_API_URL'] ?? 'http://signal-cli.railway.internal:8080';
    this.account = config?.account ?? process.env['SIGNAL_CLI_NUMBER'] ?? '';
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`signal-cli API error ${res.status}: ${text}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return res.json() as Promise<T>;
    }

    return undefined as unknown as T;
  }

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    return this.request<SendMessageResult>('POST', `/v2/send`, {
      number: this.account,
      recipients: params.recipients,
      message: params.message,
      ...(params.attachments ? { base64_attachments: params.attachments } : {}),
    });
  }

  async sendGroupMessage(params: SendGroupMessageParams): Promise<SendMessageResult> {
    return this.request<SendMessageResult>('POST', `/v2/send`, {
      number: this.account,
      recipients: [params.groupId],
      message: params.message,
      ...(params.attachments ? { base64_attachments: params.attachments } : {}),
    });
  }

  async receiveMessages(): Promise<IncomingMessage[]> {
    return this.request<IncomingMessage[]>('GET', `/v1/receive/${encodeURIComponent(this.account)}`);
  }

  async listGroups(): Promise<SignalGroup[]> {
    return this.request<SignalGroup[]>('GET', `/v1/groups/${encodeURIComponent(this.account)}`);
  }

  async getContacts(): Promise<SignalContact[]> {
    return this.request<SignalContact[]>('GET', `/v1/contacts/${encodeURIComponent(this.account)}`);
  }

  async sendReaction(params: ReactionParams): Promise<void> {
    await this.request<void>('POST', `/v1/reactions/${encodeURIComponent(this.account)}`, {
      recipient: params.recipient,
      reaction: params.reaction,
      target_author: params.targetAuthor,
      timestamp: params.targetTimestamp,
    });
  }

  async sendAttachment(params: AttachmentParams): Promise<SendMessageResult> {
    return this.request<SendMessageResult>('POST', `/v2/send`, {
      number: this.account,
      recipients: params.recipients,
      message: params.message ?? '',
      base64_attachments: [
        `${params.contentType}:${params.filename}:${params.base64Attachment}`,
      ],
    });
  }
}
