export type ConvMessage = {
  role: string;
  content: string;
  timestamp?: string;
  source?: string;
};

export type ConvRow = {
  id: string;
  signal_chat_id: string;
  thread_type: string;
  messages: unknown;
  is_processing: boolean;
};
