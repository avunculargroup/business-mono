import { createHmac } from 'crypto';
import { mastra } from '../mastra/index.js';

const ZOOM_WEBHOOK_SECRET_TOKEN = process.env['ZOOM_WEBHOOK_SECRET_TOKEN'] ?? '';

function verifyZoomWebhook(body: string, timestamp: string, signature: string): boolean {
  const message = `v0:${timestamp}:${body}`;
  const expected = 'v0=' + createHmac('sha256', ZOOM_WEBHOOK_SECRET_TOKEN)
    .update(message)
    .digest('hex');
  return expected === signature;
}

export async function handleZoomWebhook(req: Request): Promise<Response> {
  const body = await req.text();
  const timestamp = req.headers.get('x-zm-request-timestamp') ?? '';
  const signature = req.headers.get('x-zm-signature') ?? '';

  const event = JSON.parse(body) as ZoomWebhookEvent;

  // Zoom URL validation challenge (required during Marketplace app setup)
  if (event.event === 'endpoint.url_validation') {
    const hash = createHmac('sha256', ZOOM_WEBHOOK_SECRET_TOKEN)
      .update(event.payload?.plainToken ?? '')
      .digest('hex');
    return Response.json({
      plainToken: event.payload?.plainToken,
      encryptedToken: hash,
    });
  }

  if (!verifyZoomWebhook(body, timestamp, signature)) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (event.event !== 'recording.completed') {
    return new Response('OK', { status: 200 });
  }

  const { uuid, recording_files } = event.payload.object;
  const videoFile = recording_files?.find((f) => f.file_type === 'MP4');

  if (!videoFile?.download_url) {
    return new Response('No MP4 recording found', { status: 200 });
  }

  const recorderRun = await mastra.getWorkflow('recorder').createRun();
  await recorderRun.start({ inputData: {
    source: 'zoom',
    meetingUuid: uuid,
    recordingUrl: videoFile.download_url,
    channels: 'single',
  } });

  return new Response('OK', { status: 200 });
}

interface ZoomWebhookEvent {
  event: string;
  payload: {
    plainToken?: string;
    object: {
      uuid: string;
      recording_files: Array<{
        file_type: string;
        download_url: string;
      }>;
    };
  };
}
