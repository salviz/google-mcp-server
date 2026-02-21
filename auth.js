import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH ||
  join(process.env.HOME || '/tmp', '.google-mcp', 'credentials.json');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  process.stderr.write(
    'ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required.\n' +
    'See README.md for setup instructions.\n'
  );
  process.exit(1);
}

let oauth2Client = null;

export function getAuth() {
  if (oauth2Client) return oauth2Client;

  oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);

  if (existsSync(TOKEN_PATH)) {
    const tokens = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || 'Bearer',
      expiry_date: tokens.expiry_date,
    });
  }

  oauth2Client.on('tokens', (newTokens) => {
    try {
      const existing = existsSync(TOKEN_PATH)
        ? JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'))
        : {};
      const updated = { ...existing, ...newTokens };
      writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2));
    } catch (e) {
      process.stderr.write(`Token save error: ${e.message}\n`);
    }
  });

  return oauth2Client;
}
