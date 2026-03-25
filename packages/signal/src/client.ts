// Wraps signal-cli REST API (bbernhard/signal-cli-rest-api)
// Base URL from env: SIGNAL_CLI_API_URL (default: http://signal-cli.railway.internal:8080)

import WebSocket, { type MessageEvent } from 'ws';
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

  /**
   * Subscribe to incoming Signal messages via WebSocket (required for json-rpc mode).
   * The callback is called for each message as it arrives. Automatically reconnects
   * on connection loss. Returns a cleanup function that stops the subscription.
   */
  subscribe(
    onMessage: (msg: IncomingMessage) => Promise<void> | void,
    onError?: (err: Error) => void,
  ): () => void {
    const wsUrl = this.baseUrl
      .replace(/^http:\/\//, 'ws://')
      .replace(/^https:\/\//, 'wss://');
    const account = this.account;
    let stopped = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = (): void => {
      if (stopped) return;
      ws = new WebSocket(`${wsUrl}/v1/receive/${encodeURIComponent(account)}`);

      ws.addEventListener('message', (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data.toString()) as IncomingMessage;
          Promise.resolve(onMessage(msg)).catch((err: unknown) => {
            onError?.(err instanceof Error ? err : new Error(String(err)));
          });
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      });

      ws.addEventListener('error', () => {
        onError?.(new Error('Signal WebSocket connection error'));
      });

      ws.addEventListener('close', () => {
        ws = null;
        if (!stopped) {
          reconnectTimer = setTimeout(connect, 5_000);
        }
      });
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      ws?.close();
      ws = null;
    };
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
