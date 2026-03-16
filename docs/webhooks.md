# Webhook Endpoints

All endpoints are exposed on the Mastra agent server (Railway). Base URL: `https://{your-railway-app}.railway.app`

## POST /webhooks/telnyx

**Source**: Telnyx Voice API
**Event**: `call.recording.saved`
**Authentication**: Verify `telnyx-signature-ed25519` header against your Telnyx public key. Compatible with Standard Webhooks spec.

### Payload (relevant fields)

```json
{
  "data": {
    "event_type": "call.recording.saved",
    "payload": {
      "call_control_id": "v3:...",
      "connection_id": "...",
      "call_leg_id": "uuid",
      "call_session_id": "uuid",
      "recording_id": "uuid",
      "recording_urls": {
        "mp3": "https://...",
        "wav": "https://..."
      },
      "channels": "dual",
      "duration_secs": 300,
      "from": "+61412345678",
      "to": "+61298765432"
    }
  }
}
```

### Handler Logic

1. Verify signature
2. Extract `recording_urls.mp3`, `from`, `to`, `duration_secs`, `recording_id`
3. Download recording from URL
4. Match `from`/`to` against `team_members.signal_number` to identify which channel is the director
5. Send to Deepgram with `callback=/webhooks/deepgram` and `multichannel=true`
6. Store `request_id` → `recording_id` mapping for correlation
7. Start Recorder workflow (suspends at transcription step)

---

## POST /webhooks/zoom

**Source**: Zoom Marketplace App (internal-only)
**Event**: `recording.completed`
**Authentication**: Verify Zoom webhook verification token.

### Payload (relevant fields)

```json
{
  "event": "recording.completed",
  "payload": {
    "object": {
      "uuid": "meeting-uuid",
      "topic": "Call with Acme Corp",
      "start_time": "2026-03-16T10:00:00Z",
      "duration": 45,
      "recording_files": [
        {
          "recording_type": "audio_only",
          "download_url": "https://zoom.us/rec/download/...",
          "file_type": "MP4",
          "file_size": 15000000
        }
      ],
      "participant_audio_files": []
    }
  }
}
```

### Handler Logic

1. Verify Zoom token
2. Extract `download_url`, `topic`, `duration`, `start_time`
3. Download recording (append `?access_token=...` to URL)
4. Send to Deepgram with `callback=/webhooks/deepgram` (standard diarisation, not multichannel)
5. Store `request_id` mapping
6. Start Recorder workflow

---

## POST /webhooks/deepgram

**Source**: Deepgram API (callback from async transcription)
**Authentication**: Verify `dg-token` header matches your Deepgram API key identifier.

### Payload

Full Deepgram transcription response. Key fields:

```json
{
  "metadata": {
    "request_id": "uuid",
    "duration": 300.5,
    "channels": 2
  },
  "results": {
    "channels": [
      {
        "alternatives": [
          {
            "transcript": "full transcript text...",
            "confidence": 0.95,
            "words": [
              {
                "word": "hello",
                "start": 0.5,
                "end": 0.8,
                "confidence": 0.99,
                "speaker": 0
              }
            ],
            "paragraphs": { ... }
          }
        ]
      }
    ]
  }
}
```

### Handler Logic

1. Verify `dg-token` header
2. Match `request_id` to the suspended Recorder workflow
3. Extract transcript text, word-level timestamps, speaker labels
4. For multichannel (Telnyx): channel 0 = director, channel 1 = external party
5. For single-channel (Zoom/manual): use Deepgram's speaker diarisation labels
6. Resume Recorder workflow with transcript data

---

## Retry Behaviour

- **Deepgram**: Retries callback up to 10 times with 30-second delays on non-2xx response
- **Telnyx**: Standard Webhooks retry behaviour
- **Zoom**: Retries for 3 days on failure

All webhook handlers should return 200 immediately after validation and enqueue processing asynchronously.
