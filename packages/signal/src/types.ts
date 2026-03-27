export interface SendMessageParams {
  recipients: string[];      // phone numbers in E.164 format
  message: string;
  attachments?: string[];    // base64 encoded
}

export interface SendGroupMessageParams {
  groupId: string;
  message: string;
  attachments?: string[];
}

export interface SendMessageResult {
  timestamp: string;
}

export interface IncomingMessage {
  envelope: {
    source: string;          // sender's phone number
    sourceNumber: string;
    sourceName: string;
    timestamp: number;
    dataMessage?: {
      message: string;
      timestamp: number;
      groupInfo?: {
        groupId: string;
        type: string;
      };
      attachments?: Array<{
        contentType: string;
        filename: string;
        id: string;
        size: number;
      }>;
    };
  };
}

export interface SignalGroup {
  id: string;
  name: string;
  members: string[];
}

export interface SignalContact {
  number: string;
  name: string;
}

export interface ReactionParams {
  recipient: string;
  reaction: string;          // emoji
  targetAuthor: string;
  targetTimestamp: number;
}

export interface AttachmentParams {
  recipients: string[];
  message?: string;
  base64Attachment: string;
  filename: string;
  contentType: string;
}

export interface UpdateProfileParams {
  name: string;            // given name — required by signal-cli REST API
  about?: string;          // max ~140 chars
  base64Avatar?: string;   // pre-encoded PNG/JPG
}
