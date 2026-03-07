import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH ||
  join(process.env.HOME || '/tmp', '.google-mcp', 'credentials.json');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SECRET_NAME = process.env.GOOGLE_TOKEN_SECRET || 'google-mcp-oauth-tokens';

if (!CLIENT_ID || !CLIENT_SECRET) {
  process.stderr.write(
    'ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required.\n' +
    'See README.md for setup instructions.\n'
  );
  process.exit(1);
}

function tryLoadFromSecretManager() {
  try {
    const raw = execSync(
      `gcloud secrets versions access latest --secret=${SECRET_NAME} 2>/dev/null`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();
    const tokens = JSON.parse(raw);
    if (tokens.refresh_token) {
      writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      process.stderr.write(`Loaded fresh tokens from Secret Manager (${SECRET_NAME})\n`);
      return tokens;
    }
  } catch {
    // Secret Manager not available or secret doesn't exist - that's OK
  }
  return null;
}

function saveToSecretManager(tokens) {
  try {
    const json = JSON.stringify(tokens);
    execSync(
      `printf '%s' '${json.replace(/'/g, "'\\''")}' | gcloud secrets versions add ${SECRET_NAME} --data-file=- 2>/dev/null`,
      { timeout: 10000 }
    );
  } catch {
    // Best-effort - don't fail if Secret Manager is unavailable
  }
}

let oauth2Client = null;
let refreshFailed = false;

export function getAuth() {
  if (oauth2Client) return oauth2Client;

  oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);

  let tokens = null;
  if (existsSync(TOKEN_PATH)) {
    try {
      tokens = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
    } catch (e) {
      process.stderr.write(`Warning: Could not parse token file: ${e.message}\n`);
    }
  }

  // If no local tokens or no refresh token, try Secret Manager
  if (!tokens?.refresh_token) {
    tokens = tryLoadFromSecretManager();
  }

  if (tokens) {
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
      // Also save to Secret Manager for cross-session persistence
      saveToSecretManager(updated);
    } catch (e) {
      process.stderr.write(`Token save error: ${e.message}\n`);
    }
  });

  // Intercept refresh failures to try Secret Manager as fallback
  const originalRefresh = oauth2Client.refreshAccessToken.bind(oauth2Client);
  oauth2Client.refreshAccessToken = async function(callback) {
    try {
      return await originalRefresh(callback);
    } catch (e) {
      if (!refreshFailed && e.message?.includes('invalid_grant')) {
        refreshFailed = true;
        process.stderr.write('Token refresh failed, trying Secret Manager fallback...\n');
        const smTokens = tryLoadFromSecretManager();
        if (smTokens?.refresh_token && smTokens.refresh_token !== tokens?.refresh_token) {
          oauth2Client.setCredentials({
            access_token: smTokens.access_token,
            refresh_token: smTokens.refresh_token,
            token_type: smTokens.token_type || 'Bearer',
            expiry_date: smTokens.expiry_date,
          });
          refreshFailed = false;
          return await originalRefresh(callback);
        }
      }
      throw e;
    }
  };

  return oauth2Client;
}
