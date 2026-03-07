# Google Workspace MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server providing **240 tools** for Google Workspace: **Gmail**, **Drive**, **Docs**, **Slides**, **Sheets**, **Calendar**, **Contacts**, and **Tasks**.

Built with [`googleapis`](https://www.npmjs.com/package/googleapis) and [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

## Features

| Service | Tools | Highlights |
|---------|-------|------------|
| **Gmail** | 75 | Send/read/reply/forward, drafts, labels, threads, attachments, filters, settings, S/MIME, CSE, delegates, watch, HTML link extraction |
| **Drive** | 47 | Search, CRUD, upload/download, export, trash, share, permissions, revisions, comments, replies, shared drives, labels, access proposals |
| **Calendar** | 30 | Events CRUD, search, quick add, import, recurring instances, free/busy, ACL, calendar management, watch, settings |
| **Sheets** | 17 | Read, write, create, append, clear, batch operations, data filters, developer metadata, copy sheet |
| **Contacts** | 22 | CRUD, batch operations, photos, contact groups, other contacts, directory search |
| **Tasks** | 14 | Tasks and task lists CRUD, complete, move/reorder, clear |
| **Docs** | 7 | Create, read, insert text/tables/images, batch update, find & replace |
| **Slides** | 8 | Create, read, add slides, get page, thumbnails, insert text, replace text, batch update |

## Prerequisites

- **Node.js 18+**
- A **Google Cloud Platform** project with OAuth 2.0 credentials (Desktop app type)
- The following **APIs enabled**:
  - Gmail API
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
| `GOOGLE_TOKEN_SECRET` | No | Google Secret Manager secret name for token fallback (default: `google-mcp-oauth-tokens`) |

## Token File Format

```json
{
  "access_token": "ya29...",
  "refresh_token": "1//...",
  "token_type": "Bearer",
  "expiry_date": 1700000000000
}
```

The server automatically refreshes expired tokens and persists updates to disk. If Google Cloud Secret Manager is available, tokens are also stored there as a cross-session fallback.

## Tools (240)

### Gmail (75)

| Tool | Description |
|------|-------------|
| `gmail_profile` | Get Gmail profile info (email, messages/threads total, history ID) |
| `gmail_send` | Send a new email (plain text or HTML) |
| `gmail_read` | Read a message with full body text, HTML link extraction, and attachment info |
| `gmail_reply` | Reply to a message (keeps thread) |
| `gmail_forward` | Forward a message to another recipient |
| `gmail_list` | List recent messages |
| `gmail_search` | Search messages using Gmail query syntax |
| `gmail_mark_read` | Mark a message as read |
| `gmail_mark_unread` | Mark a message as unread |
| `gmail_modify_labels` | Add or remove labels from a message |
| `gmail_trash` | Move a message to trash |
| `gmail_untrash` | Remove a message from trash |
| `gmail_delete` | Permanently delete a message |
| `gmail_batch_modify` | Modify labels on multiple messages at once |
| `gmail_batch_delete` | Permanently delete multiple messages |
| `gmail_insert_message` | Insert a message directly into the mailbox |
| `gmail_import_message` | Import a message (similar to receiving via SMTP) |
| `gmail_get_attachment` | Download an attachment from a message |
| `gmail_list_threads` | List message threads |
| `gmail_get_thread` | Get all messages in a thread |
| `gmail_thread_modify` | Modify labels on a thread |
| `gmail_thread_trash` | Move a thread to trash |
| `gmail_thread_untrash` | Restore a thread from trash |
| `gmail_thread_delete` | Permanently delete a thread |
| `gmail_create_draft` | Create a new draft |
| `gmail_list_drafts` | List all drafts |
| `gmail_get_draft` | Get a specific draft |
| `gmail_update_draft` | Update an existing draft |
| `gmail_delete_draft` | Delete a draft |
| `gmail_send_draft` | Send a draft |
| `gmail_list_labels` | List all labels |
| `gmail_get_label` | Get a specific label |
| `gmail_create_label` | Create a new label |
| `gmail_update_label` | Update a label |
| `gmail_delete_label` | Delete a label |
| `gmail_list_history` | List mailbox changes since a history ID |
| `gmail_get_auto_forwarding` | Get auto-forwarding settings |
| `gmail_update_auto_forwarding` | Update auto-forwarding settings |
| `gmail_get_imap` | Get IMAP settings |
| `gmail_update_imap` | Update IMAP settings |
| `gmail_get_pop` | Get POP settings |
| `gmail_update_pop` | Update POP settings |
| `gmail_get_language` | Get language settings |
| `gmail_update_language` | Update language settings |
| `gmail_get_vacation` | Get vacation responder settings |
| `gmail_update_vacation` | Update vacation responder settings |
| `gmail_list_send_as` | List send-as aliases |
| `gmail_get_send_as` | Get a send-as alias |
| `gmail_create_send_as` | Create a send-as alias |
| `gmail_update_send_as` | Update a send-as alias |
| `gmail_delete_send_as` | Delete a send-as alias |
| `gmail_verify_send_as` | Send verification for a send-as alias |
| `gmail_list_filters` | List email filters |
| `gmail_get_filter` | Get a specific filter |
| `gmail_create_filter` | Create a new filter |
| `gmail_delete_filter` | Delete a filter |
| `gmail_list_forwarding_addresses` | List forwarding addresses |
| `gmail_get_forwarding_address` | Get a forwarding address |
| `gmail_create_forwarding_address` | Create a forwarding address |
| `gmail_delete_forwarding_address` | Delete a forwarding address |
| `gmail_list_delegates` | List mail delegates |
| `gmail_get_delegate` | Get a mail delegate |
| `gmail_create_delegate` | Create a mail delegate |
| `gmail_delete_delegate` | Delete a mail delegate |
| `gmail_list_smime` | List S/MIME certificates |
| `gmail_get_smime` | Get an S/MIME certificate |
| `gmail_insert_smime` | Insert an S/MIME certificate |
| `gmail_delete_smime` | Delete an S/MIME certificate |
| `gmail_set_default_smime` | Set default S/MIME certificate |
| `gmail_list_cse_identities` | List CSE identities |
| `gmail_get_cse_identity` | Get a CSE identity |
| `gmail_create_cse_identity` | Create a CSE identity |
| `gmail_patch_cse_identity` | Patch a CSE identity |
| `gmail_delete_cse_identity` | Delete a CSE identity |
| `gmail_list_cse_keypairs` | List CSE key pairs |
| `gmail_get_cse_keypair` | Get a CSE key pair |
| `gmail_create_cse_keypair` | Create a CSE key pair |
| `gmail_enable_cse_keypair` | Enable a CSE key pair |
| `gmail_disable_cse_keypair` | Disable a CSE key pair |
| `gmail_obliterate_cse_keypair` | Permanently delete a CSE key pair |
| `gmail_watch` | Set up push notifications via Pub/Sub |
| `gmail_stop_watch` | Stop push notifications |

### Google Drive (47)

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
| `drive_get_permission` | Get a specific permission |
| `drive_update_permission` | Update a sharing permission |
| `drive_remove_permission` | Remove a sharing permission |
| `drive_about` | Get storage quota and user info |
| `drive_upload_file` | Upload a binary file from local filesystem |
| `drive_download_file` | Download a file to local filesystem |
| `drive_get_comments` | List comments on a file |
| `drive_get_comment` | Get a specific comment |
| `drive_add_comment` | Add a comment to a file |
| `drive_update_comment` | Update a comment |
| `drive_delete_comment` | Delete a comment |
| `drive_create_reply` | Reply to a comment |
| `drive_list_replies` | List replies to a comment |
| `drive_get_reply` | Get a specific reply |
| `drive_update_reply` | Update a reply |
| `drive_delete_reply` | Delete a reply |
| `drive_export_file` | Export Google Workspace files (PDF, DOCX, CSV, etc.) |
| `drive_get_revisions` | List file revision history |
| `drive_get_revision` | Get a specific revision |
| `drive_update_revision` | Update revision metadata |
| `drive_delete_revision` | Delete a revision |
| `drive_empty_trash` | Permanently empty all trash |
| `drive_get_changes_start_token` | Get starting page token for changes |
| `drive_list_changes` | List file changes since a page token |
| `drive_watch_file` | Watch a file for changes (webhook) |
| `drive_watch_changes` | Watch for file changes (webhook) |
| `drive_stop_channel` | Stop a watch channel |
| `drive_generate_ids` | Generate file IDs for uploads |
| `drive_list_labels` | List labels on a file |
| `drive_modify_labels` | Modify labels on a file |
| `drive_list_access_proposals` | List access proposals for a file |
| `drive_get_access_proposal` | Get a specific access proposal |
| `drive_resolve_access_proposal` | Accept or deny an access proposal |
| `drive_list_apps` | List installed Drive apps |
| `drive_get_app` | Get a specific Drive app |
| `drive_get_operation` | Get a long-running operation status |
| `drive_create_shared_drive` | Create a shared drive |
| `drive_list_shared_drives` | List shared drives |
| `drive_get_shared_drive` | Get a shared drive |
| `drive_update_shared_drive` | Update a shared drive |
| `drive_hide_shared_drive` | Hide a shared drive |
| `drive_unhide_shared_drive` | Unhide a shared drive |
| `drive_delete_shared_drive` | Delete a shared drive |

### Google Calendar (30)

| Tool | Description |
|------|-------------|
| `calendar_list_events` | List upcoming events with optional time range |
| `calendar_search_events` | Search events by text |
| `calendar_create_event` | Create an event (supports all-day) |
| `calendar_update_event` | Update an existing event |
| `calendar_delete_event` | Delete an event |
| `calendar_get_event` | Get detailed event info |
| `calendar_move_event` | Move event between calendars |
| `calendar_quick_add` | Create event from natural language |
| `calendar_import_event` | Import an event by iCal UID |
| `calendar_recurring_instances` | List instances of a recurring event |
| `calendar_freebusy` | Check free/busy time for calendars |
| `calendar_list_calendars` | List all accessible calendars |
| `calendar_create_calendar` | Create a new calendar |
| `calendar_get_calendar` | Get calendar details |
| `calendar_update_calendar` | Update calendar properties |
| `calendar_delete_calendar` | Delete a calendar |
| `calendar_clear` | Clear all events from a calendar |
| `calendar_list_get` | Get calendar list entry |
| `calendar_list_update` | Update calendar list entry |
| `calendar_list_insert` | Subscribe to a calendar |
| `calendar_list_delete` | Unsubscribe from a calendar |
| `calendar_acl_list` | List calendar access control rules |
| `calendar_acl_get` | Get a specific ACL rule |
| `calendar_acl_insert` | Add an ACL rule |
| `calendar_acl_update` | Update an ACL rule |
| `calendar_acl_delete` | Delete an ACL rule |
| `calendar_get_colors` | Get available calendar/event colors |
| `calendar_list_settings` | List all user settings |
| `calendar_get_setting` | Get a specific setting |
| `calendar_acl_watch` | Watch ACL changes (webhook) |
| `calendar_watch_events` | Watch event changes (webhook) |
| `calendar_list_watch` | Watch calendar list changes (webhook) |
| `calendar_watch_settings` | Watch settings changes (webhook) |
| `calendar_stop_channel` | Stop a watch channel |

### Google Sheets (17)

| Tool | Description |
|------|-------------|
| `sheets_read` | Read data from a spreadsheet range |
| `sheets_write` | Write data to a range |
| `sheets_create` | Create a new spreadsheet |
| `sheets_append` | Append rows after existing data |
| `sheets_clear` | Clear values from a range |
| `sheets_batch_clear` | Clear multiple ranges at once |
| `sheets_batch_get` | Read multiple ranges at once |
| `sheets_batch_update` | Structural operations (add sheets, merge cells, charts) |
| `sheets_batch_update_values` | Write to multiple ranges at once |
| `sheets_get_info` | Get spreadsheet metadata |
| `sheets_copy_sheet` | Copy a sheet to another spreadsheet |
| `sheets_get_by_data_filter` | Get spreadsheet data using data filters |
| `sheets_batch_get_by_data_filter` | Get values using data filters |
| `sheets_batch_update_values_by_data_filter` | Update values using data filters |
| `sheets_batch_clear_by_data_filter` | Clear ranges using data filters |
| `sheets_developer_metadata_search` | Search developer metadata |
| `sheets_developer_metadata_get` | Get developer metadata by ID |

### Google Contacts (22)

| Tool | Description |
|------|-------------|
| `contacts_list` | List contacts with optional search |
| `contacts_get` | Get a specific contact |
| `contacts_create` | Create a new contact |
| `contacts_update` | Update an existing contact |
| `contacts_delete` | Delete a contact |
| `contacts_batch_create` | Create multiple contacts at once |
| `contacts_batch_update` | Update multiple contacts at once |
| `contacts_batch_get` | Get multiple contacts at once |
| `contacts_batch_delete` | Delete multiple contacts at once |
| `contacts_update_photo` | Upload a contact photo |
| `contacts_delete_photo` | Delete a contact photo |
| `contacts_groups_list` | List contact groups |
| `contacts_group_create` | Create a contact group |
| `contacts_group_get` | Get a contact group |
| `contacts_group_update` | Update a contact group |
| `contacts_group_delete` | Delete a contact group |
| `contacts_group_batch_get` | Get multiple contact groups |
| `contacts_group_modify_members` | Add or remove members from a group |
| `contacts_other_list` | List "other contacts" (auto-saved) |
| `contacts_other_search` | Search other contacts |
| `contacts_other_copy` | Copy an other contact to my contacts |
| `contacts_search_directory` | Search organization directory (Workspace) |
| `contacts_list_directory` | List directory contacts (Workspace) |

### Google Tasks (14)

| Tool | Description |
|------|-------------|
| `tasks_list` | List all task lists |
| `tasks_get_list` | Get a specific task list |
| `tasks_create_list` | Create a new task list |
| `tasks_delete_list` | Delete a task list |
| `tasks_list_tasks` | List tasks in a task list |
| `tasks_get` | Get a specific task |
| `tasks_create` | Create a new task |
| `tasks_update` | Update a task |
| `tasks_complete` | Mark a task as completed |
| `tasks_delete` | Delete a task |
| `tasks_move` | Move or reorder a task |
| `tasks_clear` | Clear completed tasks from a list |

### Google Docs (7)

| Tool | Description |
|------|-------------|
| `docs_create` | Create a new document with optional content and folder |
| `docs_read` | Read full document content as plain text |
| `docs_insert_text` | Insert text at a position |
| `docs_batch_update` | Apply batch update requests |
| `docs_insert_table` | Insert a table |
| `docs_insert_image` | Insert an inline image from a URL |
| `docs_find_replace` | Find and replace text |

### Google Slides (8)

| Tool | Description |
|------|-------------|
| `slides_create` | Create a new presentation |
| `slides_read` | Read all slide content |
| `slides_add_slide` | Add a new slide |
| `slides_get_page` | Get details of a specific slide |
| `slides_get_thumbnail` | Generate a thumbnail image URL for a slide |
| `slides_insert_text` | Insert text into a shape or text box |
| `slides_replace_all_text` | Find and replace text across all slides |
| `slides_batch_update` | Apply batch update requests |

## Setup Guide

### 1. Create a Google Cloud Project

Go to the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.

### 2. Enable APIs

In **APIs & Services > Library**, enable: Gmail, Drive, Docs, Slides, Sheets, Calendar, People, and Tasks APIs.

### 3. Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Select **Desktop app**
4. Note the `client_id` and `client_secret`

### 4. Obtain Tokens

Use the included re-authorization helper:

```bash
GOOGLE_CLIENT_ID=your-client-id GOOGLE_CLIENT_SECRET=your-client-secret node reauth.js
```

This starts a local server, opens an auth URL, and saves tokens after you authorize.

**Required OAuth scopes:**
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.settings.basic`
- `https://www.googleapis.com/auth/gmail.settings.sharing`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/contacts`
- `https://www.googleapis.com/auth/tasks`
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/presentations`

### 5. Save Tokens

```bash
mkdir -p ~/.google-mcp
# Tokens are automatically saved to ~/.google-mcp/credentials.json by reauth.js
```

## Testing

Run the comprehensive test suite (tests all 240 tools):

```bash
GOOGLE_CLIENT_ID=your-id GOOGLE_CLIENT_SECRET=your-secret node test-all.js
```

## Project Structure

```
google-mcp-server/
  index.js              # Server entry point, registers all tool modules
  auth.js               # OAuth 2.0 client, token management, Secret Manager fallback
  reauth.js             # OAuth re-authorization helper
  test-all.js           # Comprehensive test suite for all 240 tools
  tools/
    gmail.js            # 75 Gmail tools
    drive.js            # 47 Google Drive tools
    docs.js             # 7 Google Docs tools
    slides.js           # 8 Google Slides tools
    calendar.js         # 30 Google Calendar tools
    extras.js           # 36 tools: Contacts (22), Tasks (14), Sheets (17 - in sheets section)
  package.json
```

## Security

- **No hardcoded credentials** -- all secrets via environment variables
- **Tokens stored locally** -- never transmitted except to Google's OAuth APIs
- **Automatic token refresh** -- expired tokens refreshed silently
- **Secret Manager fallback** -- optionally stores tokens in Google Cloud Secret Manager for resilience
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
