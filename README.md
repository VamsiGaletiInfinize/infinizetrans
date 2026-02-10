# Infinize Trans – Real-time Multilingual Video Meeting

Browser-based video meetings with live two-way multilingual translation.

| Feature | AWS Service |
|---------|------------|
| Video / Audio (WebRTC) | Amazon Chime SDK Meetings |
| Speech → Text | Amazon Transcribe Streaming |
| Translation | Amazon Translate |
| Text → Speech | Amazon Polly |
| Meeting metadata | Amazon DynamoDB |

**Supported languages:** English (US), Spanish (US), Hindi.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | >= 18 |
| npm | >= 9 |
| AWS CLI | v2 (configured with credentials) |
| AWS CDK | `npm i -g aws-cdk` (v2) |

You need an AWS account with access to Chime SDK, Transcribe, Translate, Polly, and DynamoDB in **us-east-1** (configurable).

---

## Quick Start (Local Development)

### 1. Clone & install

```bash
git clone <repo-url> infinizeTrans
cd infinizeTrans

# Install root dependencies (concurrently)
npm install

# Install backend + frontend
npm run install:all
```

### 2. AWS credentials

Make sure your shell has valid AWS credentials. Either:

```bash
# Option A – environment variables
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...

# Option B – AWS CLI profile (recommended)
aws configure
```

### 3. Deploy infrastructure (CDK)

This creates the DynamoDB table and an IAM policy you can attach to your user/role.

```bash
# Bootstrap CDK (first time only)
cd backend
npx cdk bootstrap

# Deploy
npm run cdk:deploy        # or from root: npm run deploy
```

**CDK Outputs:**
- `MeetingsTableName` – the DynamoDB table name (default: `infinize-meetings`)
- `AppPolicyArn` – attach this managed policy to your IAM user/role

> If you skip CDK deploy, the backend will auto-fall-back to an **in-memory store** (single-instance only).

### 4. Configure environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit if needed (defaults work for local dev)

# Frontend (already has .env.local with defaults)
cp frontend/.env.example frontend/.env.local
```

### 5. Run locally

From the repo root:

```bash
npm run dev
```

This starts:
- **Backend** on `http://localhost:3001` (REST + WebSocket)
- **Frontend** on `http://localhost:3000` (Next.js)

### 6. Test with two participants

1. Open **Tab 1** → `http://localhost:3000`
   - Name: Alice, Speak: English, Target: Spanish
   - Click **Create Meeting**
   - Copy the Meeting ID shown at the top

2. Open **Tab 2** → `http://localhost:3000`
   - Name: Bob, Speak: Spanish, Target: English
   - Paste the Meeting ID, click **Join Meeting**

3. Speak in Tab 1 → captions appear in both tabs, translated to each participant's target language.

4. Toggle **Audio: ON** to hear translated speech via Amazon Polly.

---

## Architecture

```
┌────────────┐   WebRTC    ┌──────────────────┐
│  Browser 1 │◄───────────►│  Amazon Chime    │
│  (Next.js) │             │  SDK Meetings    │
└─────┬──────┘             └──────────────────┘
      │ PCM audio (WS)
      ▼
┌─────────────────────────────────────────────┐
│           Backend Server (Express + WS)      │
│                                              │
│  ┌─────────────┐  ┌────────────┐            │
│  │  Transcribe  │→│  Translate  │            │
│  │  Streaming   │  └─────┬──────┘            │
│  └─────────────┘        │                    │
│                    ┌─────▼──────┐            │
│                    │   Polly    │ (optional)  │
│                    └────────────┘            │
└──────────┬──────────────────────────────────┘
           │ captions + audio (WS)
           ▼
      Browser 1 & 2
```

**Data flow per utterance:**
1. Browser captures mic audio → PCM 16 kHz mono frames via Web Audio API
2. Frames sent to backend over WebSocket (binary)
3. Backend pipes into Amazon Transcribe Streaming → partial/final transcripts
4. Backend translates each transcript (grouped by target language to avoid duplicates)
5. Caption events sent to all meeting participants over WebSocket
6. (Optional) Final transcripts synthesized by Polly → MP3 audio sent to participants with "Translated Audio" enabled

---

## Project Structure

```
infinizeTrans/
├── package.json              # Root scripts (dev, deploy, destroy)
├── backend/
│   ├── package.json
│   ├── cdk.json              # CDK config
│   ├── bin/cdk-app.ts        # CDK entry
│   ├── lib/infra-stack.ts    # CDK stack (DynamoDB + IAM)
│   └── src/
│       ├── server.ts         # Express + WebSocket server
│       ├── config.ts
│       ├── types.ts
│       ├── routes/meetings.ts
│       ├── ws/
│       │   ├── connectionManager.ts
│       │   └── handler.ts    # WS message routing + translation pipeline
│       ├── services/
│       │   ├── chime.ts      # Chime SDK Meetings
│       │   ├── dynamodb.ts   # Meeting storage (+ in-memory fallback)
│       │   ├── transcribe.ts # Transcribe Streaming session
│       │   ├── translate.ts  # Amazon Translate
│       │   └── polly.ts      # Amazon Polly TTS
│       └── utils/languages.ts
└── frontend/
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx      # Join/Create form → Meeting view
        │   └── globals.css
        ├── components/
        │   ├── JoinForm.tsx
        │   ├── MeetingView.tsx
        │   ├── VideoTile.tsx
        │   ├── CaptionsPanel.tsx
        │   └── Controls.tsx
        ├── hooks/
        │   ├── useMeetingSession.ts  # Chime SDK lifecycle
        │   ├── useTranslationSocket.ts # WS for captions
        │   └── useAudioCapture.ts    # Mic → PCM frames
        ├── lib/
        │   ├── api.ts
        │   ├── audioPlayer.ts
        │   └── languages.ts
        └── types/index.ts
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend + frontend concurrently |
| `npm run deploy` | CDK deploy (DynamoDB + IAM policy) |
| `npm run destroy` | CDK destroy |
| `npm run install:all` | Install deps for backend + frontend |
| `npm run build` | Build both projects |

---

## IAM Permissions Required

The CDK stack creates a managed policy (`InfinizeTransAppPolicy`) with least-privilege access:

- `chime:CreateMeeting`, `chime:CreateAttendee`, `chime:GetMeeting`, `chime:DeleteMeeting`, `chime:DeleteAttendee`, `chime:ListAttendees`
- `transcribe:StartStreamTranscription`
- `translate:TranslateText`
- `polly:SynthesizeSpeech`
- `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:DeleteItem`, `dynamodb:Query` (scoped to `infinize-meetings` table)
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

Attach this policy to whatever IAM user or role runs the backend.

---

## Configuration

### Backend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region |
| `PORT` | `3001` | Server port |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `DYNAMODB_TABLE_NAME` | `infinize-meetings` | DynamoDB table name |

### Frontend (`.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:3001` | Backend REST URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001/ws` | Backend WebSocket URL |

---

## Known Limits

- **Single backend instance** – the WebSocket server runs as a single Node process. For production, deploy behind a load balancer with sticky sessions or migrate to API Gateway WebSocket + Lambda.
- **In-memory fallback** – if CDK is not deployed, meetings are stored in-memory and lost on restart.
- **Partial translation throttle** – partial transcripts are translated at most once per 300 ms per speaker to limit API cost.
- **Translated audio latency** – Polly synthesis is called only on final transcripts; there will be a noticeable delay before audio plays.
- **Browser compatibility** – uses `ScriptProcessorNode` (deprecated). Production should migrate to `AudioWorklet`.
- **No authentication** – this is an MVP. Add Cognito or similar for production use.
- **Chime SDK region** – the Chime meeting and media region must match `AWS_REGION`.

---

## Teardown

```bash
npm run destroy
```

This removes the DynamoDB table and IAM policy from your AWS account.
