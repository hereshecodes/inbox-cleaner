# Inbox Cleaner - Web App

Privacy-first Gmail cleanup tool. Deploy on Vercel.

## Setup

### 1. Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable the **Gmail API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback` (for local dev)
   - `https://your-app.vercel.app/api/auth/callback` (for production)
7. Copy the **Client ID** and **Client Secret**

### 2. Claude API (Optional, for AI classification)

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create an API key
3. This enables AI-powered sender classification

### 3. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
CLAUDE_API_KEY=sk-ant-...  # Optional
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-a-random-secret
```

### 4. Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

### 5. Deploy to Vercel

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Set root directory to `web-app`
4. Add environment variables in Vercel dashboard
5. Deploy

## How It Works

- OAuth 2.0 for Gmail access (tokens stored in HTTP-only cookies)
- All email data processed in browser
- Server only proxies Gmail API calls
- AI classification via Claude (optional)
