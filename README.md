# Google Workspace MCP Server

A custom [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that provides **50 tools** for interacting with Google Workspace services: **Drive**, **Calendar**, **Contacts/People**, **Tasks**, and **Sheets**.

Built with the official `@modelcontextprotocol/sdk`, `googleapis`, and `zod` for schema validation.

---

## Features

| Service | Tools | Capabilities |
|---------|-------|-------------|
| **Google Drive** | 16 | Search, read, list, file info, create folders/files, update, delete, trash/untrash, copy, move, share, manage permissions, storage quota |
| **Google Calendar** | 13 | List/create/update/delete/get events, quick add, move events, recurring instances, free/busy, create/delete/clear calendars |
| **Google Contacts** | 6 | List, get, create, update, delete contacts, list contact groups |
| **Google Tasks** | 9 | List/create/complete/update/delete tasks, create/delete task lists, move/reorder tasks |
| **Google Sheets** | 6 | Read, write, create spreadsheets, append rows, clear ranges, get spreadsheet metadata |

**Total: 50 tools**

---

## Prerequisites

- **Node.js** 18 or later
- A **Google Cloud Platform** project with OAuth 2.0 credentials (Desktop application type)
- The following **Google APIs** enabled in your project:
  - Google Drive API
  - Google Calendar API
  - People API (Contacts)
  - Tasks API
  - Google Sheets API
- A **token file** containing a valid `refresh_token`

---

## Quick Install (Claude Code)

### One-liner

```bash
claude mcp add google-workspace -- node /path/to/google-mcp-server/index.js
```

### Full configuration (claude_desktop_config.json or .mcp.json)

```json
{
  "mcpServers": {
    "google-workspace": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/google-mcp-server/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "your-client-secret",
        "GOOGLE_TOKEN_PATH": "/path/to/credentials.json"
      }
    }
  }
}
```

Replace `/path/to/google-mcp-server` with the actual directory where this server is installed.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 client secret from Google Cloud Console |
| `GOOGLE_TOKEN_PATH` | No | Path to the token JSON file. Defaults to `~/.google-mcp/credentials.json` |

---

## Token File Format

The token file must be valid JSON with the following structure:

```json
{
  "access_token": "ya29.a0AfH6SM...",
  "refresh_token": "1//0eXx...",
  "token_type": "Bearer",
  "expiry_date": 1700000000000
}
```

The server automatically refreshes expired access tokens using the `refresh_token` and writes updated tokens back to the file.

---

## Setup Guide

### 1. Create a Google Cloud Project

- Go to the [Google Cloud Console](https://console.cloud.google.com/)
- Create a new project or select an existing one

### 2. Enable APIs

Enable the following APIs in **APIs & Services > Library**:

- Google Drive API
- Google Calendar API
- People API
- Tasks API
- Google Sheets API

### 3. Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Select **Desktop app** as the application type
4. Download the credentials JSON file
5. Note the `client_id` and `client_secret`

### 4. Obtain Initial Tokens

Run an OAuth 2.0 authorization flow to get your initial `access_token` and `refresh_token`. You can use a tool like [Google's OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) or write a small script using `googleapis`:

```javascript
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'urn:ietf:wg:oauth:2.0:oob'
);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});

console.log('Authorize this app by visiting:', url);
// After authorization, exchange the code for tokens
```

### 5. Save the Token File

Save the tokens to your chosen path (default: `~/.google-mcp/credentials.json`):

```bash
mkdir -p ~/.google-mcp
cat > ~/.google-mcp/credentials.json << 'EOF'
{
  "access_token": "ya29...",
  "refresh_token": "1//...",
  "token_type": "Bearer",
  "expiry_date": 1700000000000
}
EOF
```

### 6. Configure Claude Code

Set the environment variables and add the MCP server to Claude Code as shown in the [Quick Install](#quick-install-claude-code) section.

---

## All Tools Reference

### Google Drive (16 tools)

| # | Tool | Description |
|---|------|-------------|
| 1 | `drive_search` | Search for files in Google Drive using a query string |
| 2 | `drive_read` | Read file content; exports Google Docs/Sheets/Slides as text/CSV |
| 3 | `drive_list` | List files in a specific folder |
| 4 | `drive_file_info` | Get detailed metadata about a file |
| 5 | `drive_create_folder` | Create a new folder |
| 6 | `drive_create_file` | Create a new text file |
| 7 | `drive_update_file` | Update file metadata and/or content |
| 8 | `drive_delete` | Permanently delete a file |
| 9 | `drive_trash` | Move a file to trash |
| 10 | `drive_untrash` | Restore a file from trash |
| 11 | `drive_copy` | Copy a file |
| 12 | `drive_move` | Move a file to a different folder |
| 13 | `drive_share` | Share a file with a user, group, or domain |
| 14 | `drive_list_permissions` | List sharing permissions on a file |
| 15 | `drive_remove_permission` | Remove a sharing permission from a file |
| 16 | `drive_about` | Get Drive storage quota and user info |

### Google Calendar (13 tools)

| # | Tool | Description |
|---|------|-------------|
| 1 | `calendar_list_events` | List upcoming events with optional time range filter |
| 2 | `calendar_create_event` | Create a new event with start/end times |
| 3 | `calendar_update_event` | Update an existing event (partial update) |
| 4 | `calendar_delete_event` | Delete an event |
| 5 | `calendar_list_calendars` | List all accessible calendars |
| 6 | `calendar_quick_add` | Create an event from natural language (e.g., "Meeting tomorrow at 3pm") |
| 7 | `calendar_get_event` | Get detailed information about a specific event |
| 8 | `calendar_move_event` | Move an event from one calendar to another |
| 9 | `calendar_recurring_instances` | List instances of a recurring event |
| 10 | `calendar_freebusy` | Check free/busy time for one or more calendars |
| 11 | `calendar_create_calendar` | Create a new calendar |
| 12 | `calendar_delete_calendar` | Delete a calendar (cannot delete primary) |
| 13 | `calendar_clear` | Clear all events from a calendar |

### Google Contacts (6 tools)

| # | Tool | Description |
|---|------|-------------|
| 1 | `contacts_list` | List contacts or search by query |
| 2 | `contacts_get` | Get a specific contact by resource name |
| 3 | `contacts_create` | Create a new contact |
| 4 | `contacts_update` | Update an existing contact |
| 5 | `contacts_delete` | Delete a contact |
| 6 | `contacts_groups_list` | List contact groups (labels) |

### Google Tasks (9 tools)

| # | Tool | Description |
|---|------|-------------|
| 1 | `tasks_list` | List all task lists |
| 2 | `tasks_list_tasks` | List tasks in a specific task list |
| 3 | `tasks_create` | Create a new task |
| 4 | `tasks_complete` | Mark a task as completed |
| 5 | `tasks_update` | Update a task (title, notes, due date, status) |
| 6 | `tasks_delete` | Delete a task |
| 7 | `tasks_create_list` | Create a new task list |
| 8 | `tasks_delete_list` | Delete a task list |
| 9 | `tasks_move` | Move or reorder a task (set parent or position) |

### Google Sheets (6 tools)

| # | Tool | Description |
|---|------|-------------|
| 1 | `sheets_read` | Read data from a spreadsheet range |
| 2 | `sheets_write` | Write data to a spreadsheet range |
| 3 | `sheets_create` | Create a new spreadsheet |
| 4 | `sheets_append` | Append rows to a spreadsheet |
| 5 | `sheets_clear` | Clear values from a range |
| 6 | `sheets_get_info` | Get spreadsheet metadata (title, sheets, dimensions) |

---

## Security

- **No hardcoded credentials** -- all secrets are passed via environment variables
- **Tokens stored locally** -- the token file is only read/written on the local filesystem and never transmitted except to Google's OAuth APIs
- **OAuth client credentials** are passed via `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables, never embedded in source
- **Automatic token refresh** -- expired access tokens are silently refreshed using the stored refresh token, and the updated token is persisted to disk
- **Stdio transport only** -- the server communicates exclusively over stdin/stdout with no network listener

---

## Project Structure

```
google-mcp-server/
  index.js          # Server entry point, registers all tool modules
  auth.js           # OAuth 2.0 client setup and token management
  package.json      # Dependencies and metadata
  tools/
    drive.js        # 16 Google Drive tools
    calendar.js     # 13 Google Calendar tools
    extras.js       # 21 tools: Contacts (6), Tasks (9), Sheets (6)
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework and stdio transport |
| `googleapis` | Official Google APIs client library |
| `zod` | Schema validation for tool parameters |

---

## License

MIT
