import { createVerify } from 'crypto';
import { mastra } from '../mastra/index.js';

const TELNYX_PUBLIC_KEY = process.env['TELNYX_PUBLIC_KEY'];

function verifyTelnyxSignature(
  payload: string,
  timestamp: string,
  signature: string
): boolean {
  if (!TELNYX_PUBLIC_KEY) {
    console.warn('TELNYX_PUBLIC_KEY not set — skipping signature verification');
    return true;
  }

  const signedPayload = `${timestamp}|${payload}`;
  const verify = createVerify('SHA256');
  verify.update(signedPayload);

  try {
    return verify.verify(
      { key: TELNYX_PUBLIC_KEY, format: 'pem', type: 'spki' },
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

export async function handleTelnyxWebhook(req: Request): Promise<Response> {
  const body = await req.text();
  const timestamp = req.headers.get('telnyx-timestamp') ?? '';
  const signature = req.headers.get('telnyx-signature-ed25519-v1') ?? '';

  if (!verifyTelnyxSignature(body, timestamp, signature)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const event = JSON.parse(body) as TelnyxRecordingEvent;

  if (event.data?.event_type !== 'call.recording.saved') {
    return new Response('OK', { status: 200 });
  }

  const { call_control_id, recording_urls } = event.data.payload;

  // Trigger Recorder workflow
  await mastra.getWorkflow('recorder').execute({
    source: 'telnyx',
    callControlId: call_control_id,
    recordingUrl: recording_urls?.mp3 ?? recording_urls?.wav,
    channels: 'dual',
  });

  return new Response('OK', { status: 200 });
}

interface TelnyxRecordingEvent {
  data: {
    event_type: string;
    payload: {
      call_control_id: string;
      recording_urls: { mp3?: string; wav?: string };
    };
  };
}
