#!/usr/bin/env node
// Re-authorize OAuth2 tokens with all required scopes
import { google } from 'googleapis';
import { readFileSync, writeFileSync } from 'fs';
import { createServer } from 'http';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || (process.env.HOME + '/.google-mcp/credentials.json');
const PORT = process.env.REAUTH_PORT || 8085;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
  process.exit(1);
}

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, `http://localhost:${PORT}`);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n=== OAUTH RE-AUTHORIZATION ===');
console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for callback on port ' + PORT + '...\n');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h1>No code received</h1>');
    return;
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log('Tokens saved to ' + TOKEN_PATH);
    console.log('Scopes:', tokens.scope);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Authorization successful!</h1><p>You can close this tab.</p>');
  } catch (e) {
    console.error('Token exchange failed:', e.message);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end('<h1>Error: ' + e.message + '</h1>');
  }
  setTimeout(() => { server.close(); process.exit(0); }, 1000);
});

server.listen(PORT, () => {
  console.log('Listening on port ' + PORT);
});
