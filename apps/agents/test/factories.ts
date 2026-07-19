// Tiny object builders for common shapes used across the test suite.
// Every field has a sensible default; tests override only what matters.

export function buildTelnyxRecordingEvent(overrides: {
  eventType?: string;
  callControlId?: string;
  mp3?: string;
  wav?: string;
} = {}): { data: { event_type: string; payload: { call_control_id: string; recording_urls: { mp3?: string; wav?: string } } } } {
  return {
    data: {
      event_type: overrides.eventType ?? 'call.recording.saved',
      payload: {
        call_control_id: overrides.callControlId ?? 'call_test_001',
        recording_urls: {
          ...(overrides.mp3 !== undefined ? { mp3: overrides.mp3 } : { mp3: 'https://example.com/rec.mp3' }),
          ...(overrides.wav !== undefined ? { wav: overrides.wav } : {}),
        },
      },
    },
  };
}

export function buildZoomRecordingEvent(overrides: {
  event?: string;
  uuid?: string;
  fileType?: string;
  downloadUrl?: string;
  plainToken?: string;
} = {}): {
  event: string;
  payload: {
    plainToken?: string;
    object: { uuid: string; recording_files: Array<{ file_type: string; download_url: string }> };
  };
} {
  return {
    event: overrides.event ?? 'recording.completed',
    payload: {
      ...(overrides.plainToken ? { plainToken: overrides.plainToken } : {}),
      object: {
        uuid: overrides.uuid ?? 'zoom_meeting_uuid_001',
        recording_files: [
          {
            file_type: overrides.fileType ?? 'MP4',
            download_url: overrides.downloadUrl ?? 'https://zoom.example.com/rec.mp4',
          },
        ],
      },
    },
  };
}

export function buildDeepgramCallbackEvent(overrides: {
  requestId?: string;
  utterances?: Array<{ transcript: string; speaker?: number; channel?: number; start?: number; end?: number }>;
} = {}): {
  metadata: { request_id: string };
  results: {
    channels: unknown;
    utterances: Array<{ transcript: string; speaker?: number; channel?: number; start: number; end: number }>;
  };
} {
  return {
    metadata: { request_id: overrides.requestId ?? 'req_001' },
    results: {
      channels: [],
      utterances: (overrides.utterances ?? [
        { transcript: 'Hello there', speaker: 0, start: 0, end: 1 },
        { transcript: 'Hi back', speaker: 1, start: 1, end: 2 },
      ]).map((u) => ({ start: 0, end: 1, ...u })),
    },
  };
}

export function buildJmapEmail(overrides: {
  id?: string;
  subject?: string | null;
  from?: Array<{ name?: string; email: string }>;
  to?: Array<{ name?: string; email: string }>;
  cc?: Array<{ name?: string; email: string }>;
  receivedAt?: string;
  textBody?: string;
  htmlBody?: string;
  headers?: Array<{ name: string; value: string }>;
  attachments?: Array<{ type?: string | null; name?: string | null; disposition?: string | null; size?: number }>;
} = {}) {
  const textPartId = 't1';
  const htmlPartId = 'h1';
  return {
    id: overrides.id ?? 'email_001',
    subject: overrides.subject ?? 'Test subject',
    from: overrides.from ?? [{ name: 'Sender', email: 'sender@example.com' }],
    to: overrides.to ?? [{ name: 'Recipient', email: 'recipient@example.com' }],
    cc: overrides.cc ?? [],
    receivedAt: overrides.receivedAt ?? '2026-01-01T00:00:00.000Z',
    bodyValues: {
      [textPartId]: { value: overrides.textBody ?? 'plain text body' },
      [htmlPartId]: { value: overrides.htmlBody ?? '<p>html body</p>' },
    },
    textBody: overrides.textBody === '' ? [] : [{ partId: textPartId }],
    htmlBody: [{ partId: htmlPartId }],
    headers: overrides.headers ?? [],
    attachments: overrides.attachments ?? [],
  };
}

export function buildAgentActivityRow(overrides: Partial<{
  id: string;
  proposed_actions: Array<{ agent: string; message: string; context?: Record<string, unknown> }>;
}> = {}): { id: string; proposed_actions: unknown } {
  return {
    id: overrides.id ?? 'activity_001',
    proposed_actions: overrides.proposed_actions ?? [],
  };
}

export function buildRoutine(overrides: Partial<{
  id: string;
  name: string;
  agent_name: string;
  action_type: string;
  action_config: Record<string, unknown>;
  frequency: string;
  time_of_day: string;
  timezone: string;
}> = {}) {
  return {
    id: overrides.id ?? 'routine_001',
    name: overrides.name ?? 'Test Routine',
    agent_name: overrides.agent_name ?? 'rex',
    action_type: overrides.action_type ?? 'research_digest',
    action_config: overrides.action_config ?? {},
    frequency: overrides.frequency ?? 'daily',
    time_of_day: overrides.time_of_day ?? '08:00',
    timezone: overrides.timezone ?? 'Australia/Melbourne',
  };
}

// A scored-or-unscored finding for the findings-engine tests. Defaults model the
// spec's worked example: an 8% overnight hash-rate drop, persistence 1.
export function buildFinding(
  overrides: Partial<import('@platform/shared').Finding> = {},
): import('@platform/shared').Finding {
  return {
    id: 'anomaly:hash_rate:2026-07-18',
    finding_type: 'anomaly',
    metric_key: 'hash_rate',
    metric_group: 'network_security',
    period: 'day',
    as_of: '2026-07-18',
    window_days: 90,
    observed: -8,
    baseline: { mean: 0.1, sd: 1.2, p05: -2.1, p50: 0.1, p95: 2.2 },
    unusualness: 0.96,
    magnitude_norm: 0.8,
    persistence_periods: 1,
    direction: 'down',
    materiality: 0,
    compliance_class: 'informational',
    allowed_vocab: ['hash rate', 'difficulty'],
    narration_hint: { means: 'Hash rate fell 8.0% over the day', verdict_allowed: false },
    evidence_refs: ['view:v_onchain_series', 'key:hash_rate', 'date:2026-07-18'],
    ...overrides,
  };
}
