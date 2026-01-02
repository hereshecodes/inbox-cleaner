# Inbox Cleaner

Privacy-first Gmail cleanup Chrome extension. Mass unsubscribe, auto-organize, and bulk delete emails - all processing happens locally in your browser.

## Features

- **Mass Unsubscribe** - Detect newsletters and mailing lists, one-click unsubscribe
- **Auto-Organize** - Rule-based categorization (newsletters, promotions, social, etc.)
- **Bulk Delete** - Delete old emails, large attachments, or entire categories
- **Privacy First** - All processing happens locally. No data sent to external servers.

## Installation

### From Source (Development)

1. Clone this repository
2. Go to `chrome://extensions/` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `inbox-cleaner` folder

### Google Cloud Setup (Required for OAuth)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the **Gmail API**
4. Go to **Credentials** > **Create Credentials** > **OAuth client ID**
5. Select "Chrome Extension" as the application type
6. Copy your extension ID from `chrome://extensions/` and add it
7. Copy the Client ID and update `manifest.json`:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     ...
   }
   ```

## Usage

1. Click the extension icon in Chrome
2. Click "Connect Gmail" and authorize
3. Click "Scan Inbox" to analyze your emails
4. Use the popup for quick actions or open the Dashboard for detailed management

## Privacy

- **No external servers** - All email processing happens in your browser
- **No data collection** - We don't track or collect any data
- **Minimal permissions** - Only requests necessary Gmail API scopes
- **Open source** - Audit the code yourself

## Tech Stack

- Chrome Extension (Manifest V3)
- Gmail API with OAuth 2.0
- Vanilla JavaScript
- Pip-Boy terminal theme

## License

MIT
