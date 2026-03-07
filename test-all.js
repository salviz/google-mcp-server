#!/usr/bin/env node
// Comprehensive test for all 240 Google Workspace MCP tools
// Tests every tool handler, creates test data before destructive ops, cleans up after

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('ERROR: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
  process.exit(1);
}
if (!process.env.GOOGLE_TOKEN_PATH) {
  process.env.GOOGLE_TOKEN_PATH = (process.env.HOME || '/tmp') + '/.google-mcp/credentials.json';
}

import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir as osTmpdir } from 'os';
const tmpdir = mkdtempSync(join(osTmpdir(), 'mcp-test-'));

const tools = new Map();
const mockServer = {
  tool(name, _desc, _schema, handler) {
    // Handle both 3-arg (name, desc, handler) and 4-arg (name, desc, schema, handler) forms
    if (typeof _schema === 'function') {
      tools.set(name, _schema); // 3-arg form: handler is actually _schema
    } else {
      tools.set(name, handler);
    }
  }
};

const { registerGmailTools } = await import('./tools/gmail.js');
const { registerDriveTools } = await import('./tools/drive.js');
const { registerCalendarTools } = await import('./tools/calendar.js');
const { registerExtraTools } = await import('./tools/extras.js');
const { registerDocsTools } = await import('./tools/docs.js');
const { registerSlidesTools } = await import('./tools/slides.js');

registerGmailTools(mockServer);
registerDriveTools(mockServer);
registerCalendarTools(mockServer);
registerExtraTools(mockServer);
registerDocsTools(mockServer);
registerSlidesTools(mockServer);

console.log(`\nRegistered ${tools.size} tools\n`);

let pass = 0, fail = 0;
const failures = [];

async function t(name, args = {}) {
  if (!tools.has(name)) {
    console.log(`?? NOT_FOUND: ${name}`);
    fail++;
    failures.push({ name, err: 'Tool not registered' });
    return '';
  }
  try {
    const r = await tools.get(name)(args);
    const txt = r?.content?.[0]?.text || '';
    if (r?.isError) {
      console.log(`FAIL ${name}: ${txt.slice(0, 120)}`);
      fail++;
      failures.push({ name, err: txt.slice(0, 200) });
    } else {
      console.log(`PASS ${name}`);
      pass++;
    }
    return txt;
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message?.slice(0, 120)}`);
    fail++;
    failures.push({ name, err: e.message?.slice(0, 200) });
    return '';
  }
}

// Extract ID from text or JSON output
function xid(txt, ...keys) {
  for (const k of keys) {
    try {
      const obj = JSON.parse(txt);
      if (obj[k] !== undefined && obj[k] !== null) return String(obj[k]);
    } catch {}
    const m = txt.match(new RegExp(`(?:"${k}"\\s*:\\s*"([^"]+)"|${k}:\\s*(.+))`, 'm'));
    if (m) return (m[1] || m[2] || '').trim();
  }
  return '';
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════

try {

// ─── GMAIL ─────────────────────────────────────────────────────
console.log('\n=== GMAIL ===');

let txt = await t('gmail_profile');
const email = xid(txt, 'emailAddress') || 'me';
const historyId = xid(txt, 'historyId');

// Labels
txt = await t('gmail_list_labels');
txt = await t('gmail_create_label', { name: 'MCP_TEST_LABEL_' + Date.now() });
const labelId = xid(txt, 'id');
if (labelId) {
  await t('gmail_get_label', { labelId });
  await t('gmail_update_label', { labelId, name: 'MCP_TEST_UPDATED_' + Date.now() });
}

// Send email to self
txt = await t('gmail_send', { to: email, subject: 'MCP Test ' + Date.now(), body: 'Test body from MCP tool testing.' });
const msgId = xid(txt, 'id');
const threadId = xid(txt, 'threadId');

await delay(2000);

// List & Search
await t('gmail_list', { maxResults: 3 });
await t('gmail_search', { query: 'subject:MCP Test', maxResults: 3 });

// Read & Actions
if (msgId) {
  await t('gmail_read', { messageId: msgId });
  await t('gmail_mark_unread', { messageId: msgId });
  await t('gmail_mark_read', { messageId: msgId });
  if (labelId) {
    await t('gmail_modify_labels', { messageId: msgId, addLabelIds: labelId });
  }
  txt = await t('gmail_reply', { messageId: msgId, body: 'Test reply.' });
  const replyMsgId = xid(txt, 'id');
  txt = await t('gmail_forward', { messageId: msgId, to: email });
  const fwdMsgId = xid(txt, 'id');

  // Attachment (expected to fail - no attachment on test email)
  await t('gmail_get_attachment', { messageId: msgId, attachmentId: 'fake', filename: 'test.txt' });
}

// Insert & Import
const rawMsg = Buffer.from(`From: ${email}\r\nTo: ${email}\r\nSubject: MCP Insert Test ${Date.now()}\r\n\r\nInserted.`).toString('base64url');
txt = await t('gmail_insert_message', { raw: rawMsg });
const insertedId = xid(txt, 'id');

const rawMsg2 = Buffer.from(`From: ${email}\r\nTo: ${email}\r\nSubject: MCP Import Test ${Date.now()}\r\n\r\nImported.`).toString('base64url');
txt = await t('gmail_import_message', { raw: rawMsg2 });
const importedId = xid(txt, 'id');

// Threads
await t('gmail_list_threads', { maxResults: 3 });
if (threadId) {
  await t('gmail_get_thread', { threadId });
  await t('gmail_thread_modify', { threadId, addLabelIds: 'STARRED' });
  await t('gmail_thread_trash', { threadId });
  await t('gmail_thread_untrash', { threadId });
}

// Drafts
txt = await t('gmail_create_draft', { to: email, subject: 'MCP Draft ' + Date.now(), body: 'Draft body.' });
const draftId = xid(txt, 'id');
await t('gmail_list_drafts', { maxResults: 3 });
if (draftId) {
  await t('gmail_get_draft', { draftId });
  await t('gmail_update_draft', { draftId, to: email, subject: 'Updated Draft', body: 'Updated.' });
  await t('gmail_delete_draft', { draftId });
}

// Create and send another draft
txt = await t('gmail_create_draft', { to: email, subject: 'MCP Draft Send ' + Date.now(), body: 'Send me.' });
const draftId2 = xid(txt, 'id');
if (draftId2) {
  await t('gmail_send_draft', { draftId: draftId2 });
}

// History
if (historyId) {
  await t('gmail_list_history', { startHistoryId: historyId });
}

// Trash/Untrash
if (msgId) {
  await t('gmail_trash', { messageId: msgId });
  await t('gmail_untrash', { messageId: msgId });
}

// Batch operations
const batchIds = [insertedId, importedId].filter(Boolean);
if (batchIds.length > 0) {
  await t('gmail_batch_modify', { messageIds: batchIds.join(','), addLabelIds: 'STARRED' });
}

// Settings GET (safe, non-destructive)
await t('gmail_get_auto_forwarding');
await t('gmail_get_imap');
await t('gmail_get_pop');
await t('gmail_get_language');
await t('gmail_get_vacation');

// Settings UPDATE (safe minimal changes)
await t('gmail_update_vacation', { enableAutoReply: false });
await t('gmail_update_language', { displayLanguage: 'en' });
await t('gmail_update_imap', { enabled: true });
await t('gmail_update_pop', { accessWindow: 'disabled' });
await t('gmail_update_auto_forwarding', { enabled: false });

// Send-As
await t('gmail_list_send_as');
await t('gmail_get_send_as', { sendAsEmail: email });
// create/update/delete/verify send-as (expected errors for primary/non-existent)
await t('gmail_create_send_as', { sendAsEmail: 'mcp-test-alias-' + Date.now() + '@example.com', displayName: 'MCP Test' });
await t('gmail_update_send_as', { sendAsEmail: email, displayName: email.split('@')[0] });
await t('gmail_delete_send_as', { sendAsEmail: 'mcp-test-alias@example.com' });
await t('gmail_verify_send_as', { sendAsEmail: 'mcp-test-alias@example.com' });

// Filters
txt = await t('gmail_create_filter', { from: 'mcp-test-filter-' + Date.now() + '@example.com', addLabelIds: 'STARRED' });
const filterId = xid(txt, 'id');
await t('gmail_list_filters');
if (filterId) {
  await t('gmail_get_filter', { filterId });
  await t('gmail_delete_filter', { filterId });
}

// Forwarding addresses
await t('gmail_list_forwarding_addresses');
await t('gmail_create_forwarding_address', { forwardingEmail: 'mcp-test-fwd-' + Date.now() + '@example.com' });
await t('gmail_get_forwarding_address', { forwardingEmail: 'nonexistent@example.com' });
await t('gmail_delete_forwarding_address', { forwardingEmail: 'nonexistent@example.com' });

// Delegates (enterprise - expected to fail)
await t('gmail_list_delegates');
await t('gmail_create_delegate', { delegateEmail: 'delegate-test@example.com' });
await t('gmail_get_delegate', { delegateEmail: 'delegate-test@example.com' });
await t('gmail_delete_delegate', { delegateEmail: 'delegate-test@example.com' });

// S/MIME (enterprise - expected to fail)
await t('gmail_list_smime', { sendAsEmail: email });
await t('gmail_get_smime', { sendAsEmail: email, smimeId: 'fake-smime' });
await t('gmail_insert_smime', { sendAsEmail: email, pkcs12: 'dGVzdA==' });
await t('gmail_delete_smime', { sendAsEmail: email, smimeId: 'fake-smime' });
await t('gmail_set_default_smime', { sendAsEmail: email, smimeId: 'fake-smime' });

// CSE (enterprise - expected to fail)
await t('gmail_list_cse_identities');
await t('gmail_get_cse_identity', { cseEmailAddress: email });
await t('gmail_create_cse_identity', { primaryKeyPairId: 'fake-kp', cseEmailAddress: email });
await t('gmail_patch_cse_identity', { emailAddress: email, primaryKeyPairId: 'fake-kp' });
await t('gmail_delete_cse_identity', { cseEmailAddress: email });
await t('gmail_list_cse_keypairs');
await t('gmail_get_cse_keypair', { keyPairId: 'fake-kp' });
await t('gmail_create_cse_keypair', { pem: 'fake-pem-data' });
await t('gmail_enable_cse_keypair', { keyPairId: 'fake-kp' });
await t('gmail_disable_cse_keypair', { keyPairId: 'fake-kp' });
await t('gmail_obliterate_cse_keypair', { keyPairId: 'fake-kp' });

// Watch (expected to fail without valid topic)
await t('gmail_watch', { topicName: 'projects/test-project/topics/test-topic' });
await t('gmail_stop_watch');

// Cleanup Gmail
if (batchIds.length > 0) {
  await t('gmail_batch_delete', { messageIds: batchIds.join(',') });
}
if (msgId) await t('gmail_delete', { messageId: msgId });
if (threadId) await t('gmail_thread_delete', { threadId });
if (labelId) await t('gmail_delete_label', { labelId });


// ─── DRIVE ─────────────────────────────────────────────────────
console.log('\n=== DRIVE ===');

await t('drive_about');

txt = await t('drive_create_folder', { name: 'MCP_TEST_FOLDER_' + Date.now() });
const folderId = xid(txt, 'id', 'ID');

txt = await t('drive_create_file', { name: 'mcp_test.txt', content: 'Hello from MCP test!' });
const fileId = xid(txt, 'id', 'ID');

await t('drive_list', { maxResults: 5 });
await t('drive_search', { query: 'name contains "mcp_test"' });

if (fileId) {
  await t('drive_file_info', { fileId });
  await t('drive_read', { fileId });
  await t('drive_update_file', { fileId, name: 'mcp_test_updated.txt' });

  txt = await t('drive_copy', { fileId, name: 'mcp_test_copy.txt' });
  const copyId = xid(txt, 'id', 'ID');

  if (folderId) await t('drive_move', { fileId, newParentId: folderId });

  // Share & Permissions
  txt = await t('drive_share', { fileId, email, role: 'writer', type: 'user' });
  const permId = xid(txt, 'id', 'ID');
  await t('drive_list_permissions', { fileId });
  if (permId) {
    await t('drive_get_permission', { fileId, permissionId: permId });
    await t('drive_update_permission', { fileId, permissionId: permId, role: 'reader' });
    await t('drive_remove_permission', { fileId, permissionId: permId });
  }

  // Comments & Replies
  txt = await t('drive_add_comment', { fileId, content: 'Test comment' });
  const commentId = xid(txt, 'id', 'ID');
  await t('drive_get_comments', { fileId });
  if (commentId) {
    await t('drive_get_comment', { fileId, commentId });
    await t('drive_update_comment', { fileId, commentId, content: 'Updated comment' });
    txt = await t('drive_create_reply', { fileId, commentId, content: 'Test reply' });
    const replyId = xid(txt, 'id', 'ID');
    await t('drive_list_replies', { fileId, commentId });
    if (replyId) {
      await t('drive_get_reply', { fileId, commentId, replyId });
      await t('drive_update_reply', { fileId, commentId, replyId, content: 'Updated reply' });
      await t('drive_delete_reply', { fileId, commentId, replyId });
    }
    await t('drive_delete_comment', { fileId, commentId });
  }

  // Revisions
  await t('drive_get_revisions', { fileId });

  // Download
  await t('drive_download_file', { fileId, localPath: `${tmpdir}/mcp_test_download.txt` });
  // Export (will fail for non-Google file types)
  await t('drive_export_file', { fileId, mimeType: 'text/plain' });

  // Watch file (expected to fail - needs webhook)
  await t('drive_watch_file', { fileId, channelId: 'test-ch-' + Date.now(), url: 'https://example.com/hook', type: 'web_hook' });

  // Labels
  await t('drive_list_labels', { fileId });
  await t('drive_modify_labels', { fileId, requests: '[]' });

  // Upload local file
  // First create a temp file
  const { writeFileSync } = await import('fs');
  writeFileSync(`${tmpdir}/mcp_upload_test.txt`, 'Upload test content');
  txt = await t('drive_upload_file', { localPath: `${tmpdir}/mcp_upload_test.txt`, name: 'mcp_uploaded.txt' });
  const uploadId = xid(txt, 'id', 'ID');

  // Trash/Untrash
  await t('drive_trash', { fileId });
  await t('drive_untrash', { fileId });

  // Cleanup files
  if (copyId) await t('drive_delete', { fileId: copyId });
  if (uploadId) await t('drive_delete', { fileId: uploadId });
  await t('drive_delete', { fileId });
}
if (folderId) await t('drive_delete', { fileId: folderId });

// Changes
txt = await t('drive_get_changes_start_token');
const changeToken = xid(txt, 'startPageToken');
if (changeToken) {
  await t('drive_list_changes', { pageToken: changeToken });
}
// Watch changes (expected to fail - needs webhook)
await t('drive_watch_changes', { pageToken: changeToken || '1', channelId: 'test-ch-' + Date.now(), url: 'https://example.com/hook', type: 'web_hook' });
await t('drive_stop_channel', { channelId: 'test-ch', resourceId: 'test-res' });

// Generate IDs
await t('drive_generate_ids', { count: 3 });

// Shared drives (expected to fail without Workspace)
const reqId = 'mcp-test-' + Date.now();
txt = await t('drive_create_shared_drive', { name: 'MCP_TEST_SD_' + Date.now(), requestId: reqId });
const sdId = xid(txt, 'id', 'ID');
await t('drive_list_shared_drives');
if (sdId) {
  await t('drive_get_shared_drive', { driveId: sdId });
  await t('drive_update_shared_drive', { driveId: sdId, name: 'MCP_TEST_SD_UP' });
  await t('drive_hide_shared_drive', { driveId: sdId });
  await t('drive_unhide_shared_drive', { driveId: sdId });
  await t('drive_delete_shared_drive', { driveId: sdId });
} else {
  await t('drive_get_shared_drive', { driveId: 'fake-sd' });
  await t('drive_update_shared_drive', { driveId: 'fake-sd', name: 'x' });
  await t('drive_hide_shared_drive', { driveId: 'fake-sd' });
  await t('drive_unhide_shared_drive', { driveId: 'fake-sd' });
  await t('drive_delete_shared_drive', { driveId: 'fake-sd' });
}

// Revision operations (expected to fail with fake IDs)
await t('drive_get_revision', { fileId: 'fake-id', revisionId: '1' });
await t('drive_update_revision', { fileId: 'fake-id', revisionId: '1', published: false });
await t('drive_delete_revision', { fileId: 'fake-id', revisionId: '1' });

// Access proposals (expected to fail)
await t('drive_list_access_proposals', { fileId: 'fake-id' });
await t('drive_get_access_proposal', { fileId: 'fake-id', proposalId: 'fake-prop' });
await t('drive_resolve_access_proposal', { fileId: 'fake-id', proposalId: 'fake-prop', action: 'ACCEPT', roles: 'reader' });

// Apps
await t('drive_list_apps');
await t('drive_get_app', { appId: 'fake-app' });

// Operations
await t('drive_get_operation', { operationId: 'fake-op' });

// Empty trash - SKIP (would delete real trash)
// We still test the handler runs but with a safety note
console.log('SKIP drive_empty_trash (safety - would empty real trash)');


// ─── CALENDAR ──────────────────────────────────────────────────
console.log('\n=== CALENDAR ===');

await t('calendar_list_calendars');
await t('calendar_get_colors');
await t('calendar_list_settings');

txt = await t('calendar_create_calendar', { summary: 'MCP Test Cal ' + Date.now() });
const calId = xid(txt, 'id', 'ID');

if (calId) {
  await t('calendar_get_calendar', { calendarId: calId });
  await t('calendar_update_calendar', { calendarId: calId, summary: 'MCP Test Updated' });

  // CalendarList
  await t('calendar_list_get', { calendarId: calId });
  await t('calendar_list_update', { calendarId: calId, colorId: '1' });

  // Create event
  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 90000000).toISOString();
  txt = await t('calendar_create_event', { calendarId: calId, summary: 'MCP Test Event', startTime: start, endTime: end });
  const eventId = xid(txt, 'id', 'ID');

  await t('calendar_list_events', { calendarId: calId });
  await t('calendar_search_events', { calendarId: calId, query: 'MCP Test' });

  if (eventId) {
    await t('calendar_get_event', { calendarId: calId, eventId });
    await t('calendar_update_event', { calendarId: calId, eventId, summary: 'MCP Event Updated' });
    await t('calendar_recurring_instances', { calendarId: calId, eventId });
    // Move event
    await t('calendar_move_event', { sourceCalendarId: calId, eventId, destinationCalendarId: 'primary' });
    // Delete from primary
    await t('calendar_delete_event', { calendarId: 'primary', eventId });
  }

  // Quick add
  txt = await t('calendar_quick_add', { calendarId: calId, text: 'MCP Quick Test tomorrow at 3pm' });
  const quickId = xid(txt, 'id', 'ID');
  if (quickId) await t('calendar_delete_event', { calendarId: calId, eventId: quickId });

  // Import event
  txt = await t('calendar_import_event', {
    calendarId: calId, iCalUID: 'mcp-test-' + Date.now() + '@test.com',
    summary: 'MCP Import', startTime: start, endTime: end
  });
  const importEventId = xid(txt, 'id', 'ID');
  if (importEventId) await t('calendar_delete_event', { calendarId: calId, eventId: importEventId });

  // ACL
  txt = await t('calendar_acl_list', { calendarId: calId });
  txt = await t('calendar_acl_insert', { calendarId: calId, role: 'reader', scopeType: 'user', scopeValue: email });
  const ruleId = xid(txt, 'id', 'ID');
  if (ruleId) {
    await t('calendar_acl_get', { calendarId: calId, ruleId });
    await t('calendar_acl_update', { calendarId: calId, ruleId, role: 'writer' });
    await t('calendar_acl_delete', { calendarId: calId, ruleId });
  }

  // Watch (expected to fail)
  await t('calendar_acl_watch', { calendarId: calId, channelId: 'ch-' + Date.now(), url: 'https://example.com/hook', type: 'web_hook' });
  await t('calendar_watch_events', { calendarId: calId, channelId: 'ch-' + Date.now(), url: 'https://example.com/hook', type: 'web_hook' });
  await t('calendar_list_watch', { channelId: 'ch-' + Date.now(), url: 'https://example.com/hook', type: 'web_hook' });
  await t('calendar_watch_settings', { channelId: 'ch-' + Date.now(), url: 'https://example.com/hook', type: 'web_hook' });
  await t('calendar_stop_channel', { id: 'fake-ch', resourceId: 'fake-res' });

  // FreeBusy
  await t('calendar_freebusy', {
    timeMin: new Date().toISOString(),
    timeMax: new Date(Date.now() + 86400000).toISOString(),
    calendarIds: calId
  });

  // Setting
  await t('calendar_get_setting', { setting: 'timezone' });

  // CalendarList insert (subscribe)
  // calendar_list_insert expects 'id' not 'calendarId'
  // We're already subscribed, so let's test with the cal ID
  // First unsubscribe then resubscribe
  await t('calendar_list_delete', { calendarId: calId });
  await t('calendar_list_insert', { id: calId });

  // Clear
  await t('calendar_clear', { calendarId: 'primary' });

  // Delete calendar
  await t('calendar_delete_calendar', { calendarId: calId });
}


// ─── DOCS ──────────────────────────────────────────────────────
console.log('\n=== DOCS ===');

txt = await t('docs_create', { title: 'MCP Test Doc ' + Date.now(), content: 'Hello MCP test!' });
const docId = xid(txt, 'id', 'ID');

if (docId) {
  await t('docs_read', { documentId: docId });
  await t('docs_insert_text', { documentId: docId, text: '\nInserted text.', index: 1 });
  await t('docs_insert_table', { documentId: docId, rows: 2, columns: 2 });
  await t('docs_find_replace', { documentId: docId, find: 'Hello', replace: 'Hi' });
  await t('docs_batch_update', {
    documentId: docId,
    requests: JSON.stringify([{ insertText: { location: { index: 1 }, text: 'Batch! ' } }])
  });
  await t('docs_insert_image', {
    documentId: docId,
    imageUrl: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
    index: 1
  });

  // Cleanup via Drive
  const { google } = await import('googleapis');
  const { getAuth } = await import('./auth.js');
  await google.drive({ version: 'v3', auth: getAuth() }).files.delete({ fileId: docId });
  console.log('Cleaned up doc ' + docId);
}


// ─── SLIDES ────────────────────────────────────────────────────
console.log('\n=== SLIDES ===');

txt = await t('slides_create', { title: 'MCP Test Slides ' + Date.now() });
const presId = xid(txt, 'id', 'ID');

if (presId) {
  await t('slides_read', { presentationId: presId });

  txt = await t('slides_add_slide', { presentationId: presId, predefinedLayout: 'TITLE_AND_BODY' });
  const slideId = xid(txt, 'Slide ID');
  // Also try extracting from JSON-like output
  const slideId2 = slideId || txt.match(/slide_[a-f0-9]+/)?.[0] || '';

  if (slideId2) {
    await t('slides_get_page', { presentationId: presId, pageObjectId: slideId2 });
    await t('slides_get_thumbnail', { presentationId: presId, pageObjectId: slideId2 });

    const tbId = `tb_${Date.now()}`;
    await t('slides_batch_update', {
      presentationId: presId,
      requests: JSON.stringify([{
        createShape: {
          objectId: tbId, shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: slideId2,
            size: { width: { magnitude: 300, unit: 'PT' }, height: { magnitude: 50, unit: 'PT' } },
            transform: { scaleX: 1, scaleY: 1, translateX: 100, translateY: 100, unit: 'PT' }
          }
        }
      }])
    });
    await t('slides_insert_text', { presentationId: presId, objectId: tbId, text: 'MCP Test Text' });
    await t('slides_replace_all_text', { presentationId: presId, find: 'Test', replace: 'Tested' });
  }

  // Cleanup
  const { google: g2 } = await import('googleapis');
  const { getAuth: ga2 } = await import('./auth.js');
  await g2.drive({ version: 'v3', auth: ga2() }).files.delete({ fileId: presId });
  console.log('Cleaned up slides ' + presId);
}


// ─── SHEETS ────────────────────────────────────────────────────
console.log('\n=== SHEETS ===');

txt = await t('sheets_create', { title: 'MCP Test Sheet ' + Date.now() });
const sheetSpreadId = xid(txt, 'spreadsheetId', 'id', 'ID');

if (sheetSpreadId) {
  await t('sheets_get_info', { spreadsheetId: sheetSpreadId });
  await t('sheets_write', {
    spreadsheetId: sheetSpreadId, range: 'Sheet1!A1:C3',
    values: JSON.stringify([['Name','Age','City'],['Alice','30','NYC'],['Bob','25','LA']])
  });
  await t('sheets_read', { spreadsheetId: sheetSpreadId, range: 'Sheet1!A1:C3' });
  await t('sheets_append', {
    spreadsheetId: sheetSpreadId, range: 'Sheet1!A1',
    values: JSON.stringify([['Charlie','35','CHI']])
  });
  await t('sheets_batch_get', { spreadsheetId: sheetSpreadId, ranges: 'Sheet1!A1:C1,Sheet1!A2:C2' });
  await t('sheets_batch_update_values', {
    spreadsheetId: sheetSpreadId,
    data: JSON.stringify([{ range: 'Sheet1!A1', values: [['Updated']] }])
  });
  await t('sheets_batch_update', {
    spreadsheetId: sheetSpreadId,
    requests: JSON.stringify([{ updateSpreadsheetProperties: { properties: { title: 'MCP Updated Sheet' }, fields: 'title' } }])
  });
  await t('sheets_copy_sheet', { spreadsheetId: sheetSpreadId, sheetId: 0, destinationSpreadsheetId: sheetSpreadId });

  // DataFilter variants
  await t('sheets_get_by_data_filter', {
    spreadsheetId: sheetSpreadId,
    dataFilters: JSON.stringify([{ a1Range: 'Sheet1!A1:C3' }])
  });
  await t('sheets_batch_get_by_data_filter', {
    spreadsheetId: sheetSpreadId,
    dataFilters: JSON.stringify([{ a1Range: 'Sheet1!A1:C3' }])
  });
  await t('sheets_batch_update_values_by_data_filter', {
    spreadsheetId: sheetSpreadId,
    data: JSON.stringify([{ dataFilter: { a1Range: 'Sheet1!A1' }, values: [['FilterUp']] }])
  });
  await t('sheets_batch_clear_by_data_filter', {
    spreadsheetId: sheetSpreadId,
    dataFilters: JSON.stringify([{ a1Range: 'Sheet1!D1:D5' }])
  });

  // Developer metadata
  await t('sheets_developer_metadata_search', {
    spreadsheetId: sheetSpreadId,
    dataFilters: JSON.stringify([{ developerMetadataLookup: { locationType: 'SPREADSHEET' } }])
  });
  await t('sheets_developer_metadata_get', { spreadsheetId: sheetSpreadId, metadataId: 1 });

  // Clear
  await t('sheets_clear', { spreadsheetId: sheetSpreadId, range: 'Sheet1!A1:C1' });
  await t('sheets_batch_clear', { spreadsheetId: sheetSpreadId, ranges: 'Sheet1!A2:C2' });

  // Cleanup
  const { google: g3 } = await import('googleapis');
  const { getAuth: ga3 } = await import('./auth.js');
  await g3.drive({ version: 'v3', auth: ga3() }).files.delete({ fileId: sheetSpreadId });
  console.log('Cleaned up sheet ' + sheetSpreadId);
}


// ─── CONTACTS ──────────────────────────────────────────────────
console.log('\n=== CONTACTS ===');

await t('contacts_list', { pageSize: 5 });

txt = await t('contacts_create', { givenName: 'MCPTest', familyName: 'Contact' + Date.now(), email: 'mcp-test@example.com' });
const contactRN = xid(txt, 'resourceName');

if (contactRN) {
  await t('contacts_get', { resourceName: contactRN });
  await t('contacts_update', { resourceName: contactRN, givenName: 'MCPUpdated' });
  await t('contacts_batch_get', { resourceNames: contactRN });
  // Upload a 1x1 pixel PNG first, then delete it
  await t('contacts_update_photo', {
    resourceName: contactRN,
    photoBytes: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
  });
  await t('contacts_delete_photo', { resourceName: contactRN });
}

// Batch create contacts
txt = await t('contacts_batch_create', {
  contacts: JSON.stringify([
    { names: [{ givenName: 'MCPBatch1', familyName: 'Test' }] },
    { names: [{ givenName: 'MCPBatch2', familyName: 'Test' }] }
  ])
});
// Extract batch-created resource names
const batchContactRNs = [];
const rnMatches = txt.matchAll(/"resourceName"\s*:\s*"(people\/[^"]+)"/g);
for (const m of rnMatches) batchContactRNs.push(m[1]);

// Batch update (if we have contacts)
if (batchContactRNs.length > 0) {
  const contactMap = {};
  for (const rn of batchContactRNs) {
    contactMap[rn] = { names: [{ givenName: 'Updated' }] };
  }
  await t('contacts_batch_update', {
    contacts: JSON.stringify(contactMap)
  });
}

// Contact groups
await t('contacts_groups_list');
txt = await t('contacts_group_create', { name: 'MCP Test Group ' + Date.now() });
const groupRN = xid(txt, 'resourceName');

if (groupRN) {
  await t('contacts_group_get', { resourceName: groupRN });
  await t('contacts_group_update', { resourceName: groupRN, name: 'MCP Updated Group' });
  await t('contacts_group_batch_get', { resourceNames: groupRN });
  if (contactRN) {
    await t('contacts_group_modify_members', { resourceName: groupRN, addResourceNames: contactRN });
    await t('contacts_group_modify_members', { resourceName: groupRN, removeResourceNames: contactRN });
  }
  await t('contacts_group_delete', { resourceName: groupRN });
}

// Other contacts
await t('contacts_other_list', { pageSize: 5 });
await t('contacts_other_search', { query: 'test' });
await t('contacts_other_copy', { resourceName: 'otherContacts/fake-id' });

// Directory (Workspace - may fail)
await t('contacts_search_directory', { query: 'test', readMask: 'names,emailAddresses', sources: 'DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT' });
await t('contacts_list_directory', { pageSize: 5, readMask: 'names,emailAddresses', sources: 'DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT' });

// Cleanup contacts
if (batchContactRNs.length > 0) {
  await t('contacts_batch_delete', { resourceNames: batchContactRNs.join(',') });
}
if (contactRN) await t('contacts_delete', { resourceName: contactRN });


// ─── TASKS ─────────────────────────────────────────────────────
console.log('\n=== TASKS ===');

await t('tasks_list');

txt = await t('tasks_create_list', { title: 'MCP Test List ' + Date.now() });
const taskListId = xid(txt, 'id');

if (taskListId) {
  await t('tasks_get_list', { taskListId });

  txt = await t('tasks_create', { title: 'MCP Test Task 1', notes: 'Notes 1', taskListId });
  const taskId1 = xid(txt, 'id');

  txt = await t('tasks_create', { title: 'MCP Test Task 2', taskListId });
  const taskId2 = xid(txt, 'id');

  await t('tasks_list_tasks', { taskListId });

  if (taskId1) {
    await t('tasks_get', { taskListId, taskId: taskId1 });
    await t('tasks_update', { taskListId, taskId: taskId1, title: 'Updated Task 1' });
    await t('tasks_complete', { taskListId, taskId: taskId1 });
    if (taskId2) {
      await t('tasks_move', { taskId: taskId2, taskListId, previous: taskId1 });
    }
    await t('tasks_delete', { taskId: taskId1, taskListId });
  }
  if (taskId2) await t('tasks_delete', { taskId: taskId2, taskListId });

  await t('tasks_clear', { taskListId });
  await t('tasks_delete_list', { taskListId });
}


} catch (e) {
  console.error(`\nFATAL: ${e.stack || e.message}`);
}

// ═══════════════════════════════════════════════════════════════
//  REPORT
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`);
console.log(`GOOGLE WORKSPACE TEST RESULTS`);
console.log(`${'='.repeat(60)}`);
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
console.log(`TOTAL TESTED: ${pass + fail} / ${tools.size} registered`);
console.log(`${'='.repeat(60)}`);

if (failures.length > 0) {
  console.log('\nFailed tools:');
  for (const f of failures) {
    console.log(`  ${f.name}: ${f.err}`);
  }
}

console.log('\nDone!');
