# Google Workspace MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server providing **73 tools** for Google Workspace: **Drive**, **Docs**, **Slides**, **Sheets**, **Calendar**, **Contacts**, and **Tasks**.

Built with [`googleapis`](https://www.npmjs.com/package/googleapis) and [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

## Features

| Service | Tools | Highlights |
|---------|-------|------------|
| **Drive** | 23 | Search, CRUD, upload/download binary files, export, trash, share, permissions, revisions, comments |
| **Docs** | 7 | Create, read, insert text/tables/images, batch update, find & replace |
| **Slides** | 6 | Create, read, add slides, insert text, replace text, batch update |
| **Sheets** | 7 | Read, write, create, append, clear, batch update, get info |
| **Calendar** | 15 | Events CRUD, search, quick add, recurring instances, free/busy, calendar management, all-day events |
| **Contacts** | 6 | List, get, create, update, delete, contact groups |
| **Tasks** | 9 | Tasks and task lists CRUD, complete, move/reorder |

## Prerequisites

- **Node.js 18+**
- A **Google Cloud Platform** project with OAuth 2.0 credentials (Desktop app type)
- The following **APIs enabled**:
  - Google Drive API
  - Google Docs API
  - Google Slides API
  - Google Sheets API
  - Google Calendar API
  - People API (Contacts)
  - Tasks API

## Quick Install

```bash
git clone https://github.com/salviz/google-mcp-server.git
cd google-mcp-server
npm install
```

### Register with Claude Code

CLI:

```bash
claude mcp add google-workspace -- node /path/to/google-mcp-server/index.js
```

Or add to your MCP config (`~/.claude/claude_desktop_config.json` or `.mcp.json`):

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

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 client secret |
| `GOOGLE_TOKEN_PATH` | No | Path to token JSON file (default: `~/.google-mcp/credentials.json`) |

## Token File Format

```json
{
  "access_token": "ya29...",
  "refresh_token": "1//...",
  "token_type": "Bearer",
  "expiry_date": 1700000000000
}
```

The server automatically refreshes expired tokens and persists updates to disk.

## Tools (68)

### Google Drive (23)

| Tool | Description |
|------|-------------|
| `drive_search` | Search files using Drive query syntax |
| `drive_read` | Read file content (detects binary, suggests download) |
| `drive_list` | List files in a folder |
| `drive_file_info` | Get detailed file metadata |
| `drive_create_folder` | Create a new folder |
| `drive_create_file` | Create a new text file |
| `drive_update_file` | Update file name, content, or description |
| `drive_delete` | Permanently delete a file |
| `drive_trash` | Move a file to trash |
| `drive_untrash` | Restore a file from trash |
| `drive_copy` | Copy a file |
| `drive_move` | Move a file to a different folder |
| `drive_share` | Share a file (user, group, domain, or anyone) |
| `drive_list_permissions` | List sharing permissions |
| `drive_remove_permission` | Remove a sharing permission |
| `drive_about` | Get storage quota and user info |
| `drive_upload_file` | Upload a binary file from local filesystem |
| `drive_download_file` | Download a file to local filesystem |
| `drive_get_comments` | List comments on a file |
| `drive_add_comment` | Add a comment to a file |
| `drive_export_file` | Export Google Workspace files (PDF, DOCX, CSV, etc.) |
| `drive_get_revisions` | List file revision history |
| `drive_empty_trash` | Permanently empty all trash |

### Google Docs (7)

| Tool | Description |
|------|-------------|
| `docs_create` | Create a new document with optional content and folder |
| `docs_read` | Read full document content as plain text |
| `docs_insert_text` | Insert text at a position with optional segment targeting |
| `docs_batch_update` | Apply batch update requests (formatting, structure, etc.) |
| `docs_insert_table` | Insert a table with specified rows and columns |
| `docs_insert_image` | Insert an inline image from a URL with optional dimensions |
| `docs_find_replace` | Find and replace text across the document |

### Google Slides (6)

| Tool | Description |
|------|-------------|
| `slides_create` | Create a new presentation with optional title slide |
| `slides_read` | Read all slide content as structured text |
| `slides_add_slide` | Add a new slide with optional layout and position |
| `slides_insert_text` | Insert text into a shape or text box by object ID |
| `slides_replace_all_text` | Find and replace text across all slides |
| `slides_batch_update` | Apply batch update requests (create shapes, format, etc.) |

### Google Sheets (7)

| Tool | Description |
|------|-------------|
| `sheets_read` | Read data from a spreadsheet range |
| `sheets_write` | Write data to a range |
| `sheets_create` | Create a new spreadsheet |
| `sheets_append` | Append rows after existing data |
| `sheets_clear` | Clear values from a range |
| `sheets_batch_update` | Structural operations (add sheets, merge cells, charts, borders) |
| `sheets_get_info` | Get spreadsheet metadata (title, sheets, dimensions) |

### Google Calendar (15)

| Tool | Description |
|------|-------------|
| `calendar_list_events` | List upcoming events with optional time range |
| `calendar_search_events` | Search events by text (summary, description, location) |
| `calendar_create_event` | Create an event (supports all-day with date-only format) |
| `calendar_update_event` | Update an existing event |
| `calendar_delete_event` | Delete an event |
| `calendar_list_calendars` | List all accessible calendars |
| `calendar_quick_add` | Create event from natural language |
| `calendar_get_event` | Get detailed event info |
| `calendar_move_event` | Move event between calendars |
| `calendar_recurring_instances` | List instances of a recurring event |
| `calendar_freebusy` | Check free/busy time for calendars |
| `calendar_create_calendar` | Create a new calendar |
| `calendar_update_calendar` | Update calendar name, description, or timezone |
| `calendar_delete_calendar` | Delete a calendar (not primary) |
| `calendar_clear` | Clear all events from a calendar |

### Google Contacts (6)

| Tool | Description |
|------|-------------|
| `contacts_list` | List contacts or search by query |
| `contacts_get` | Get a specific contact by resource name |
| `contacts_create` | Create a new contact |
| `contacts_update` | Update an existing contact |
| `contacts_delete` | Delete a contact |
| `contacts_groups_list` | List contact groups (labels) |

### Google Tasks (9)

| Tool | Description |
|------|-------------|
| `tasks_list` | List all task lists |
| `tasks_list_tasks` | List tasks in a task list |
| `tasks_create` | Create a new task |
| `tasks_complete` | Mark a task as completed |
| `tasks_update` | Update task title, notes, due date, or status |
| `tasks_delete` | Delete a task |
| `tasks_create_list` | Create a new task list |
| `tasks_delete_list` | Delete a task list |
| `tasks_move` | Move or reorder a task (set parent or position) |

## Setup Guide

### 1. Create a Google Cloud Project

Go to the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.

### 2. Enable APIs

In **APIs & Services > Library**, enable: Drive, Docs, Slides, Sheets, Calendar, People, and Tasks APIs.

### 3. Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Select **Desktop app**
4. Note the `client_id` and `client_secret`

### 4. Obtain Tokens

Use [Google's OAuth Playground](https://developers.google.com/oauthplayground/) or a script:

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
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/presentations',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/tasks',
  ],
});

console.log('Authorize at:', url);
```

### 5. Save Tokens

```bash
mkdir -p ~/.google-mcp
# Save the token JSON to ~/.google-mcp/credentials.json
```

## Project Structure

```
google-mcp-server/
  index.js              # Server entry point, registers all tool modules
  auth.js               # OAuth 2.0 client, token management
  tools/
    drive.js            # 23 Google Drive tools
    docs.js             # 7 Google Docs tools
    slides.js           # 6 Google Slides tools
    calendar.js         # 15 Google Calendar tools
    extras.js           # 22 tools: Contacts (6), Tasks (9), Sheets (7)
  package.json
```

## Security

- **No hardcoded credentials** -- all secrets via environment variables
- **Tokens stored locally** -- never transmitted except to Google's OAuth APIs
- **Automatic token refresh** -- expired tokens refreshed silently
- **Stdio transport only** -- no network server exposed
- **Token file parsing** wrapped in try-catch for resilience

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework |
| `googleapis` | Official Google APIs client |
| `zod` | Schema validation for tool parameters |

## License

MIT
