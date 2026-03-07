import { getAuth } from '../auth.js';
import { google } from 'googleapis';
import { z } from 'zod';

export function registerGmailTools(server) {

  // ══════════════════════════════════════════════════════════════════════
  // USERS
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_profile',
    'Get Gmail profile info (email, messages total, threads total, history ID)',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.getProfile({ userId: 'me' });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_watch',
    'Set up push notifications for mailbox changes (requires a Cloud Pub/Sub topic)',
    {
      topicName: z.string().describe('Cloud Pub/Sub topic name, e.g. projects/my-project/topics/gmail'),
      labelIds: z.string().optional().describe('Comma-separated label IDs to watch (default: all)'),
      labelFilterBehavior: z.enum(['include', 'exclude']).optional().describe("Whether labelIds are included or excluded (default 'include')"),
    },
    async ({ topicName, labelIds, labelFilterBehavior }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = { topicName };
        if (labelIds) requestBody.labelIds = labelIds.split(',').map(l => l.trim());
        if (labelFilterBehavior) requestBody.labelFilterBehavior = labelFilterBehavior;
        const res = await gmail.users.watch({ userId: 'me', requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_stop_watch',
    'Stop receiving push notifications for the mailbox',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.stop({ userId: 'me' });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Push notifications stopped' }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // MESSAGES
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list',
    'List Gmail messages with optional label filter',
    {
      labelIds: z.string().optional().describe("Comma-separated label IDs, e.g. 'INBOX', 'SENT', 'UNREAD' (default: INBOX)"),
      maxResults: z.coerce.number().optional().describe('Max messages to return (default 20, max 500)'),
      pageToken: z.string().optional().describe('Page token for pagination'),
      includeSpamTrash: z.boolean().optional().describe('Include SPAM and TRASH in results (default false)'),
    },
    async ({ labelIds, maxResults, pageToken, includeSpamTrash }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const labels = labelIds ? labelIds.split(',').map(l => l.trim()) : ['INBOX'];
        const res = await gmail.users.messages.list({
          userId: 'me',
          labelIds: labels,
          maxResults: Math.min(maxResults || 20, 500),
          pageToken,
          includeSpamTrash: includeSpamTrash || false,
        });
        const messages = res.data.messages || [];
        const details = await Promise.all(
          messages.map(async (m) => {
            const msg = await gmail.users.messages.get({
              userId: 'me', id: m.id, format: 'metadata',
              metadataHeaders: ['From', 'To', 'Subject', 'Date'],
            });
            const headers = {};
            (msg.data.payload.headers || []).forEach(h => { headers[h.name] = h.value; });
            return {
              id: msg.data.id, threadId: msg.data.threadId, snippet: msg.data.snippet,
              labelIds: msg.data.labelIds, sizeEstimate: msg.data.sizeEstimate,
              from: headers.From, to: headers.To, subject: headers.Subject, date: headers.Date,
            };
          })
        );
        return {
          content: [{ type: 'text', text: JSON.stringify({
            messages: details, nextPageToken: res.data.nextPageToken,
            resultSizeEstimate: res.data.resultSizeEstimate,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_search',
    'Search Gmail messages using Gmail query syntax (e.g. "from:user@example.com subject:hello is:unread")',
    {
      query: z.string().describe('Gmail search query (same syntax as Gmail search bar)'),
      maxResults: z.coerce.number().optional().describe('Max messages to return (default 20, max 500)'),
      pageToken: z.string().optional().describe('Page token for pagination'),
      includeSpamTrash: z.boolean().optional().describe('Include SPAM and TRASH in results (default false)'),
    },
    async ({ query, maxResults, pageToken, includeSpamTrash }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.messages.list({
          userId: 'me', q: query,
          maxResults: Math.min(maxResults || 20, 500),
          pageToken, includeSpamTrash: includeSpamTrash || false,
        });
        const messages = res.data.messages || [];
        const details = await Promise.all(
          messages.map(async (m) => {
            const msg = await gmail.users.messages.get({
              userId: 'me', id: m.id, format: 'metadata',
              metadataHeaders: ['From', 'To', 'Subject', 'Date'],
            });
            const headers = {};
            (msg.data.payload.headers || []).forEach(h => { headers[h.name] = h.value; });
            return {
              id: msg.data.id, threadId: msg.data.threadId, snippet: msg.data.snippet,
              from: headers.From, to: headers.To, subject: headers.Subject, date: headers.Date,
            };
          })
        );
        return {
          content: [{ type: 'text', text: JSON.stringify({
            messages: details, nextPageToken: res.data.nextPageToken,
            resultSizeEstimate: res.data.resultSizeEstimate,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_read',
    'Read a specific Gmail message by ID (returns full body text and attachment info)',
    {
      messageId: z.string().describe('The message ID'),
      format: z.enum(['full', 'minimal', 'raw', 'metadata']).optional().describe("Response format (default 'full')"),
      metadataHeaders: z.string().optional().describe("Comma-separated headers to include when format='metadata'"),
    },
    async ({ messageId, format, metadataHeaders }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const params = { userId: 'me', id: messageId, format: format || 'full' };
        if (metadataHeaders) params.metadataHeaders = metadataHeaders.split(',').map(h => h.trim());
        const res = await gmail.users.messages.get(params);
        const headers = {};
        (res.data.payload?.headers || []).forEach(h => { headers[h.name] = h.value; });

        let body = '';
        let htmlBody = '';
        function extractBody(part, target) {
          if (part.body?.data) {
            const decoded = Buffer.from(part.body.data, 'base64url').toString('utf-8');
            if (target === 'html') htmlBody += decoded;
            else body += decoded;
          }
          if (part.parts) {
            const textPart = part.parts.find(p => p.mimeType === 'text/plain');
            const htmlPart = part.parts.find(p => p.mimeType === 'text/html');
            if (textPart) extractBody(textPart, 'text');
            if (htmlPart) extractBody(htmlPart, 'html');
            if (!textPart && !htmlPart) part.parts.forEach(p => extractBody(p, target));
          }
        }
        if (res.data.payload) {
          const mime = res.data.payload.mimeType || '';
          if (mime === 'text/html') {
            extractBody(res.data.payload, 'html');
          } else if (mime === 'text/plain') {
            extractBody(res.data.payload, 'text');
          } else {
            extractBody(res.data.payload, 'text');
          }
        }

        // Extract URLs from HTML if available
        let links;
        if (htmlBody) {
          const urlMatches = [...htmlBody.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
          if (urlMatches.length > 0) {
            links = urlMatches.map(m => ({
              url: m[1],
              text: m[2].replace(/<[^>]+>/g, '').trim()
            })).filter(l => l.url && !l.url.startsWith('mailto:'));
          }
          // If no plain text body was found, convert HTML to readable text
          if (!body) {
            body = htmlBody
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<\/p>/gi, '\n\n')
              .replace(/<\/div>/gi, '\n')
              .replace(/<\/li>/gi, '\n')
              .replace(/<li[^>]*>/gi, '- ')
              .replace(/<\/h[1-6]>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/\n{3,}/g, '\n\n')
              .trim();
          }
        }

        const attachments = [];
        function findAttachments(part) {
          if (part.filename && part.body?.attachmentId) {
            attachments.push({
              filename: part.filename, mimeType: part.mimeType,
              size: part.body.size, attachmentId: part.body.attachmentId,
            });
          }
          if (part.parts) part.parts.forEach(p => findAttachments(p));
        }
        if (res.data.payload) findAttachments(res.data.payload);

        return {
          content: [{ type: 'text', text: JSON.stringify({
            id: res.data.id, threadId: res.data.threadId, labelIds: res.data.labelIds,
            sizeEstimate: res.data.sizeEstimate, historyId: res.data.historyId,
            internalDate: res.data.internalDate,
            from: headers.From, to: headers.To, cc: headers.Cc, bcc: headers.Bcc,
            replyTo: headers['Reply-To'], subject: headers.Subject, date: headers.Date,
            messageId: headers['Message-ID'], inReplyTo: headers['In-Reply-To'],
            contentType: headers['Content-Type'],
            body,
            links: links?.length > 0 ? links : undefined,
            attachments: attachments.length > 0 ? attachments : undefined,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_send',
    'Send a new Gmail email (plain text or HTML)',
    {
      to: z.string().describe('Recipient email address(es), comma-separated'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body'),
      cc: z.string().optional().describe('CC recipients, comma-separated'),
      bcc: z.string().optional().describe('BCC recipients, comma-separated'),
      replyTo: z.string().optional().describe('Reply-To address'),
      isHtml: z.boolean().optional().describe('Set true to send body as HTML (default false = plain text)'),
    },
    async ({ to, subject, body, cc, bcc, replyTo, isHtml }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const contentType = isHtml ? 'text/html' : 'text/plain';
        let raw = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: ${contentType}; charset=utf-8\r\nMIME-Version: 1.0\r\n`;
        if (cc) raw += `Cc: ${cc}\r\n`;
        if (bcc) raw += `Bcc: ${bcc}\r\n`;
        if (replyTo) raw += `Reply-To: ${replyTo}\r\n`;
        raw += `\r\n${body}`;
        const encoded = Buffer.from(raw).toString('base64url');
        const res = await gmail.users.messages.send({
          userId: 'me', requestBody: { raw: encoded },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true, id: res.data.id, threadId: res.data.threadId, labelIds: res.data.labelIds,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_reply',
    'Reply to a Gmail message (keeps thread)',
    {
      messageId: z.string().describe('ID of the message to reply to'),
      body: z.string().describe('Reply body'),
      replyAll: z.boolean().optional().describe('Reply to all recipients (default false)'),
      isHtml: z.boolean().optional().describe('Send body as HTML (default false)'),
    },
    async ({ messageId, body, replyAll, isHtml }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const original = await gmail.users.messages.get({
          userId: 'me', id: messageId, format: 'metadata',
          metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Message-ID'],
        });
        const headers = {};
        (original.data.payload.headers || []).forEach(h => { headers[h.name] = h.value; });
        const to = replyAll ? [headers.From, headers.To].filter(Boolean).join(', ') : headers.From;
        const subject = headers.Subject?.startsWith('Re:') ? headers.Subject : `Re: ${headers.Subject}`;
        const contentType = isHtml ? 'text/html' : 'text/plain';
        let raw = `To: ${to}\r\nSubject: ${subject}\r\nIn-Reply-To: ${headers['Message-ID']}\r\nReferences: ${headers['Message-ID']}\r\nContent-Type: ${contentType}; charset=utf-8\r\nMIME-Version: 1.0\r\n`;
        if (replyAll && headers.Cc) raw += `Cc: ${headers.Cc}\r\n`;
        raw += `\r\n${body}`;
        const encoded = Buffer.from(raw).toString('base64url');
        const res = await gmail.users.messages.send({
          userId: 'me', requestBody: { raw: encoded, threadId: original.data.threadId },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, id: res.data.id, threadId: res.data.threadId }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_forward',
    'Forward a Gmail message to another recipient',
    {
      messageId: z.string().describe('ID of the message to forward'),
      to: z.string().describe('Recipient email address(es), comma-separated'),
      note: z.string().optional().describe('Optional note to prepend to the forwarded message'),
    },
    async ({ messageId, to, note }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const original = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
        const headers = {};
        (original.data.payload?.headers || []).forEach(h => { headers[h.name] = h.value; });
        let originalBody = '';
        function extractBody(part) {
          if (part.body?.data) originalBody += Buffer.from(part.body.data, 'base64url').toString('utf-8');
          if (part.parts) {
            const textPart = part.parts.find(p => p.mimeType === 'text/plain');
            if (textPart) extractBody(textPart);
            else part.parts.forEach(p => extractBody(p));
          }
        }
        if (original.data.payload) extractBody(original.data.payload);
        const subject = headers.Subject?.startsWith('Fwd:') ? headers.Subject : `Fwd: ${headers.Subject}`;
        const fwdBlock = `\r\n\r\n---------- Forwarded message ----------\r\nFrom: ${headers.From}\r\nDate: ${headers.Date}\r\nSubject: ${headers.Subject}\r\nTo: ${headers.To}\r\n\r\n${originalBody}`;
        const body = (note || '') + fwdBlock;
        let raw = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\nMIME-Version: 1.0\r\n\r\n${body}`;
        const encoded = Buffer.from(raw).toString('base64url');
        const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, id: res.data.id, threadId: res.data.threadId }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_insert_message',
    'Insert a message directly into the mailbox (like IMAP APPEND, no sending)',
    {
      raw: z.string().describe('Base64url-encoded RFC 2822 formatted email message'),
      labelIds: z.string().optional().describe('Comma-separated label IDs to apply'),
      internalDateSource: z.enum(['receivedTime', 'dateHeader']).optional().describe("Source for internal date (default 'receivedTime')"),
    },
    async ({ raw, labelIds, internalDateSource }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = { raw };
        if (labelIds) requestBody.labelIds = labelIds.split(',').map(l => l.trim());
        const params = { userId: 'me', requestBody };
        if (internalDateSource) params.internalDateSource = internalDateSource;
        const res = await gmail.users.messages.insert(params);
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_import_message',
    'Import a message into the mailbox with standard email processing (spam/virus scanning)',
    {
      raw: z.string().describe('Base64url-encoded RFC 2822 formatted email message'),
      internalDateSource: z.enum(['receivedTime', 'dateHeader']).optional().describe("Source for internal date (default 'receivedTime')"),
      neverMarkSpam: z.boolean().optional().describe('Never mark as spam (default false)'),
      processForCalendar: z.boolean().optional().describe('Process calendar invites (default false)'),
    },
    async ({ raw, internalDateSource, neverMarkSpam, processForCalendar }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const params = { userId: 'me', requestBody: { raw } };
        if (internalDateSource) params.internalDateSource = internalDateSource;
        if (neverMarkSpam) params.neverMarkSpam = neverMarkSpam;
        if (processForCalendar) params.processForCalendar = processForCalendar;
        const res = await gmail.users.messages.import(params);
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Message Actions ─────────────────────────────────────────────────

  server.tool(
    'gmail_trash',
    'Move a Gmail message to trash',
    { messageId: z.string().describe('The message ID to trash') },
    async ({ messageId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.messages.trash({ userId: 'me', id: messageId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, trashed: messageId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_untrash',
    'Remove a Gmail message from trash',
    { messageId: z.string().describe('The message ID to untrash') },
    async ({ messageId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.messages.untrash({ userId: 'me', id: messageId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, untrashed: messageId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_delete',
    'Permanently delete a Gmail message (cannot be undone)',
    { messageId: z.string().describe('The message ID to permanently delete') },
    async ({ messageId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.messages.delete({ userId: 'me', id: messageId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: messageId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_mark_read',
    'Mark a Gmail message as read',
    { messageId: z.string().describe('The message ID') },
    async ({ messageId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { removeLabelIds: ['UNREAD'] } });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, markedRead: messageId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_mark_unread',
    'Mark a Gmail message as unread',
    { messageId: z.string().describe('The message ID') },
    async ({ messageId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { addLabelIds: ['UNREAD'] } });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, markedUnread: messageId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_modify_labels',
    'Add or remove labels from a Gmail message',
    {
      messageId: z.string().describe('The message ID'),
      addLabelIds: z.string().optional().describe('Comma-separated label IDs to add'),
      removeLabelIds: z.string().optional().describe('Comma-separated label IDs to remove'),
    },
    async ({ messageId, addLabelIds, removeLabelIds }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = {};
        if (addLabelIds) requestBody.addLabelIds = addLabelIds.split(',').map(l => l.trim());
        if (removeLabelIds) requestBody.removeLabelIds = removeLabelIds.split(',').map(l => l.trim());
        const res = await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody });
        return { content: [{ type: 'text', text: JSON.stringify({ id: res.data.id, labelIds: res.data.labelIds }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_batch_delete',
    'Permanently delete multiple Gmail messages at once (cannot be undone)',
    {
      messageIds: z.string().describe('Comma-separated message IDs to delete'),
    },
    async ({ messageIds }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const ids = messageIds.split(',').map(id => id.trim());
        await gmail.users.messages.batchDelete({ userId: 'me', requestBody: { ids } });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: ids.length }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_batch_modify',
    'Modify labels on multiple Gmail messages at once',
    {
      messageIds: z.string().describe('Comma-separated message IDs to modify'),
      addLabelIds: z.string().optional().describe('Comma-separated label IDs to add'),
      removeLabelIds: z.string().optional().describe('Comma-separated label IDs to remove'),
    },
    async ({ messageIds, addLabelIds, removeLabelIds }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = { ids: messageIds.split(',').map(id => id.trim()) };
        if (addLabelIds) requestBody.addLabelIds = addLabelIds.split(',').map(l => l.trim());
        if (removeLabelIds) requestBody.removeLabelIds = removeLabelIds.split(',').map(l => l.trim());
        await gmail.users.messages.batchModify({ userId: 'me', requestBody });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, modified: requestBody.ids.length }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Attachments ─────────────────────────────────────────────────────

  server.tool(
    'gmail_get_attachment',
    'Download a Gmail attachment to local filesystem',
    {
      messageId: z.string().describe('The message ID containing the attachment'),
      attachmentId: z.string().describe('The attachment ID (from gmail_read result)'),
      filename: z.string().describe('Filename to save as'),
      savePath: z.string().optional().describe('Directory to save to (default ~/Downloads)'),
    },
    async ({ messageId, attachmentId, filename, savePath }) => {
      try {
        const { writeFileSync, mkdirSync } = await import('fs');
        const { join } = await import('path');
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.messages.attachments.get({ userId: 'me', messageId, id: attachmentId });
        const dir = savePath || join(process.env.HOME || '/tmp', 'Downloads');
        mkdirSync(dir, { recursive: true });
        const filePath = join(dir, filename);
        const data = Buffer.from(res.data.data, 'base64url');
        writeFileSync(filePath, data);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, path: filePath, size: data.length }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // THREADS
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list_threads',
    'List Gmail threads with optional search query',
    {
      query: z.string().optional().describe('Gmail search query to filter threads'),
      labelIds: z.string().optional().describe('Comma-separated label IDs to filter'),
      maxResults: z.coerce.number().optional().describe('Max threads to return (default 20, max 500)'),
      pageToken: z.string().optional().describe('Page token for pagination'),
      includeSpamTrash: z.boolean().optional().describe('Include SPAM and TRASH (default false)'),
    },
    async ({ query, labelIds, maxResults, pageToken, includeSpamTrash }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const params = {
          userId: 'me',
          maxResults: Math.min(maxResults || 20, 500),
          includeSpamTrash: includeSpamTrash || false,
        };
        if (query) params.q = query;
        if (labelIds) params.labelIds = labelIds.split(',').map(l => l.trim());
        if (pageToken) params.pageToken = pageToken;
        const res = await gmail.users.threads.list(params);
        const threads = (res.data.threads || []).map(t => ({
          id: t.id, snippet: t.snippet, historyId: t.historyId,
        }));
        return {
          content: [{ type: 'text', text: JSON.stringify({
            threads, nextPageToken: res.data.nextPageToken,
            resultSizeEstimate: res.data.resultSizeEstimate,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_thread',
    'Get all messages in a Gmail thread',
    {
      threadId: z.string().describe('The thread ID'),
      format: z.enum(['full', 'minimal', 'metadata']).optional().describe("Message format (default 'metadata')"),
      metadataHeaders: z.string().optional().describe("Comma-separated headers when format='metadata'"),
    },
    async ({ threadId, format, metadataHeaders }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const params = {
          userId: 'me', id: threadId, format: format || 'metadata',
        };
        if (!format || format === 'metadata') {
          params.metadataHeaders = metadataHeaders
            ? metadataHeaders.split(',').map(h => h.trim())
            : ['From', 'To', 'Subject', 'Date'];
        }
        const res = await gmail.users.threads.get(params);
        const messages = (res.data.messages || []).map(msg => {
          const headers = {};
          (msg.payload?.headers || []).forEach(h => { headers[h.name] = h.value; });
          return {
            id: msg.id, snippet: msg.snippet, labelIds: msg.labelIds,
            internalDate: msg.internalDate,
            from: headers.From, to: headers.To, subject: headers.Subject, date: headers.Date,
          };
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({
            threadId: res.data.id, historyId: res.data.historyId,
            messageCount: messages.length, messages,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_thread_modify',
    'Add or remove labels from an entire Gmail thread',
    {
      threadId: z.string().describe('The thread ID'),
      addLabelIds: z.string().optional().describe('Comma-separated label IDs to add'),
      removeLabelIds: z.string().optional().describe('Comma-separated label IDs to remove'),
    },
    async ({ threadId, addLabelIds, removeLabelIds }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = {};
        if (addLabelIds) requestBody.addLabelIds = addLabelIds.split(',').map(l => l.trim());
        if (removeLabelIds) requestBody.removeLabelIds = removeLabelIds.split(',').map(l => l.trim());
        const res = await gmail.users.threads.modify({ userId: 'me', id: threadId, requestBody });
        return { content: [{ type: 'text', text: JSON.stringify({ id: res.data.id, success: true }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_thread_trash',
    'Move an entire Gmail thread to trash',
    { threadId: z.string().describe('The thread ID to trash') },
    async ({ threadId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.threads.trash({ userId: 'me', id: threadId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, trashed: threadId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_thread_untrash',
    'Remove an entire Gmail thread from trash',
    { threadId: z.string().describe('The thread ID to untrash') },
    async ({ threadId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.threads.untrash({ userId: 'me', id: threadId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, untrashed: threadId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_thread_delete',
    'Permanently delete an entire Gmail thread (cannot be undone)',
    { threadId: z.string().describe('The thread ID to permanently delete') },
    async ({ threadId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.threads.delete({ userId: 'me', id: threadId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: threadId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // LABELS
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list_labels',
    'List all Gmail labels with message counts',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.labels.list({ userId: 'me' });
        const labels = (res.data.labels || []).map(l => ({
          id: l.id, name: l.name, type: l.type,
          messagesTotal: l.messagesTotal, messagesUnread: l.messagesUnread,
          threadsTotal: l.threadsTotal, threadsUnread: l.threadsUnread,
        }));
        return { content: [{ type: 'text', text: JSON.stringify(labels, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_label',
    'Get detailed info for a specific Gmail label',
    { labelId: z.string().describe('The label ID') },
    async ({ labelId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.labels.get({ userId: 'me', id: labelId });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_create_label',
    'Create a new Gmail label',
    {
      name: z.string().describe('Label name (use / for nesting, e.g. "Work/Projects")'),
      labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().describe("Visibility in label list (default 'labelShow')"),
      messageListVisibility: z.enum(['show', 'hide']).optional().describe("Visibility in message list (default 'show')"),
      backgroundColor: z.string().optional().describe('Background color hex (e.g. "#16a765")'),
      textColor: z.string().optional().describe('Text color hex (e.g. "#ffffff")'),
    },
    async ({ name, labelListVisibility, messageListVisibility, backgroundColor, textColor }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = {
          name,
          labelListVisibility: labelListVisibility || 'labelShow',
          messageListVisibility: messageListVisibility || 'show',
        };
        if (backgroundColor || textColor) {
          requestBody.color = {};
          if (backgroundColor) requestBody.color.backgroundColor = backgroundColor;
          if (textColor) requestBody.color.textColor = textColor;
        }
        const res = await gmail.users.labels.create({ userId: 'me', requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_update_label',
    'Update an existing Gmail label (name, visibility, color)',
    {
      labelId: z.string().describe('The label ID to update'),
      name: z.string().optional().describe('New label name'),
      labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().describe('Label list visibility'),
      messageListVisibility: z.enum(['show', 'hide']).optional().describe('Message list visibility'),
      backgroundColor: z.string().optional().describe('Background color hex'),
      textColor: z.string().optional().describe('Text color hex'),
    },
    async ({ labelId, name, labelListVisibility, messageListVisibility, backgroundColor, textColor }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = {};
        if (name) requestBody.name = name;
        if (labelListVisibility) requestBody.labelListVisibility = labelListVisibility;
        if (messageListVisibility) requestBody.messageListVisibility = messageListVisibility;
        if (backgroundColor || textColor) {
          requestBody.color = {};
          if (backgroundColor) requestBody.color.backgroundColor = backgroundColor;
          if (textColor) requestBody.color.textColor = textColor;
        }
        const res = await gmail.users.labels.patch({ userId: 'me', id: labelId, requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_delete_label',
    'Delete a Gmail label',
    { labelId: z.string().describe('The label ID to delete') },
    async ({ labelId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.labels.delete({ userId: 'me', id: labelId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: labelId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // DRAFTS
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list_drafts',
    'List Gmail drafts',
    {
      maxResults: z.coerce.number().optional().describe('Max drafts to return (default 20)'),
      query: z.string().optional().describe('Search query to filter drafts'),
      pageToken: z.string().optional().describe('Page token for pagination'),
    },
    async ({ maxResults, query, pageToken }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const params = { userId: 'me', maxResults: maxResults || 20 };
        if (query) params.q = query;
        if (pageToken) params.pageToken = pageToken;
        const res = await gmail.users.drafts.list(params);
        const drafts = res.data.drafts || [];
        const details = await Promise.all(
          drafts.map(async (d) => {
            const draft = await gmail.users.drafts.get({ userId: 'me', id: d.id, format: 'metadata' });
            const headers = {};
            (draft.data.message.payload?.headers || []).forEach(h => { headers[h.name] = h.value; });
            return {
              draftId: d.id, messageId: draft.data.message.id,
              to: headers.To, subject: headers.Subject, snippet: draft.data.message.snippet,
            };
          })
        );
        return {
          content: [{ type: 'text', text: JSON.stringify({
            drafts: details, nextPageToken: res.data.nextPageToken,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_draft',
    'Read a specific Gmail draft by ID',
    {
      draftId: z.string().describe('The draft ID'),
      format: z.enum(['full', 'minimal', 'metadata', 'raw']).optional().describe("Format (default 'full')"),
    },
    async ({ draftId, format }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.drafts.get({ userId: 'me', id: draftId, format: format || 'full' });
        const headers = {};
        (res.data.message.payload?.headers || []).forEach(h => { headers[h.name] = h.value; });
        let body = '';
        function extractBody(part) {
          if (part.body?.data) body += Buffer.from(part.body.data, 'base64url').toString('utf-8');
          if (part.parts) {
            const textPart = part.parts.find(p => p.mimeType === 'text/plain');
            if (textPart) extractBody(textPart);
            else part.parts.forEach(p => extractBody(p));
          }
        }
        if (res.data.message.payload) extractBody(res.data.message.payload);
        return {
          content: [{ type: 'text', text: JSON.stringify({
            draftId: res.data.id, messageId: res.data.message.id,
            from: headers.From, to: headers.To, cc: headers.Cc, subject: headers.Subject,
            body,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_create_draft',
    'Create a Gmail draft',
    {
      to: z.string().describe('Recipient email address(es), comma-separated'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body'),
      cc: z.string().optional().describe('CC recipients, comma-separated'),
      bcc: z.string().optional().describe('BCC recipients, comma-separated'),
      isHtml: z.boolean().optional().describe('Send body as HTML (default false)'),
      threadId: z.string().optional().describe('Thread ID to associate draft with (for reply drafts)'),
    },
    async ({ to, subject, body, cc, bcc, isHtml, threadId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const contentType = isHtml ? 'text/html' : 'text/plain';
        let raw = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: ${contentType}; charset=utf-8\r\nMIME-Version: 1.0\r\n`;
        if (cc) raw += `Cc: ${cc}\r\n`;
        if (bcc) raw += `Bcc: ${bcc}\r\n`;
        raw += `\r\n${body}`;
        const encoded = Buffer.from(raw).toString('base64url');
        const requestBody = { message: { raw: encoded } };
        if (threadId) requestBody.message.threadId = threadId;
        const res = await gmail.users.drafts.create({ userId: 'me', requestBody });
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true, draftId: res.data.id, messageId: res.data.message.id,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_update_draft',
    'Update an existing Gmail draft with new content',
    {
      draftId: z.string().describe('The draft ID to update'),
      to: z.string().describe('Recipient email address(es)'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body'),
      cc: z.string().optional().describe('CC recipients'),
      bcc: z.string().optional().describe('BCC recipients'),
      isHtml: z.boolean().optional().describe('Send body as HTML (default false)'),
    },
    async ({ draftId, to, subject, body, cc, bcc, isHtml }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const contentType = isHtml ? 'text/html' : 'text/plain';
        let raw = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: ${contentType}; charset=utf-8\r\nMIME-Version: 1.0\r\n`;
        if (cc) raw += `Cc: ${cc}\r\n`;
        if (bcc) raw += `Bcc: ${bcc}\r\n`;
        raw += `\r\n${body}`;
        const encoded = Buffer.from(raw).toString('base64url');
        const res = await gmail.users.drafts.update({
          userId: 'me', id: draftId,
          requestBody: { message: { raw: encoded } },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true, draftId: res.data.id, messageId: res.data.message.id,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_send_draft',
    'Send an existing Gmail draft',
    { draftId: z.string().describe('The draft ID to send') },
    async ({ draftId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true, id: res.data.id, threadId: res.data.threadId, labelIds: res.data.labelIds,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_delete_draft',
    'Delete a Gmail draft',
    { draftId: z.string().describe('The draft ID to delete') },
    async ({ draftId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.drafts.delete({ userId: 'me', id: draftId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: draftId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // HISTORY
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list_history',
    'List mailbox change history starting from a given history ID (from profile or message)',
    {
      startHistoryId: z.string().describe('History ID to start from (get from gmail_profile or message historyId)'),
      historyTypes: z.string().optional().describe("Comma-separated types: messageAdded, messageDeleted, labelAdded, labelRemoved"),
      labelId: z.string().optional().describe('Filter history to this label ID only'),
      maxResults: z.coerce.number().optional().describe('Max history records (default 50)'),
      pageToken: z.string().optional().describe('Page token for pagination'),
    },
    async ({ startHistoryId, historyTypes, labelId, maxResults, pageToken }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const params = {
          userId: 'me', startHistoryId,
          maxResults: maxResults || 50,
        };
        if (historyTypes) params.historyTypes = historyTypes.split(',').map(t => t.trim());
        if (labelId) params.labelId = labelId;
        if (pageToken) params.pageToken = pageToken;
        const res = await gmail.users.history.list(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({
            history: res.data.history || [],
            historyId: res.data.historyId,
            nextPageToken: res.data.nextPageToken,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // SETTINGS - GENERAL
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_get_auto_forwarding',
    'Get Gmail auto-forwarding settings',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.getAutoForwarding({ userId: 'me' });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_update_auto_forwarding',
    'Update Gmail auto-forwarding settings',
    {
      enabled: z.boolean().describe('Enable or disable auto-forwarding'),
      emailAddress: z.string().optional().describe('Email address to forward to (must be a verified forwarding address)'),
      disposition: z.enum(['leaveInInbox', 'archive', 'trash', 'markRead']).optional().describe('What to do with forwarded messages'),
    },
    async ({ enabled, emailAddress, disposition }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = { enabled };
        if (emailAddress) requestBody.emailAddress = emailAddress;
        if (disposition) requestBody.disposition = disposition;
        const res = await gmail.users.settings.updateAutoForwarding({ userId: 'me', requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_imap',
    'Get Gmail IMAP settings',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.getImap({ userId: 'me' });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_update_imap',
    'Update Gmail IMAP settings',
    {
      enabled: z.boolean().describe('Enable or disable IMAP'),
      autoExpunge: z.boolean().optional().describe('Auto-expunge (default true)'),
      expungeBehavior: z.enum(['archive', 'deleteForever', 'trash']).optional().describe('Expunge behavior'),
      maxFolderSize: z.coerce.number().optional().describe('Max folder size (0 = no limit, or 1000-10000)'),
    },
    async ({ enabled, autoExpunge, expungeBehavior, maxFolderSize }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = { enabled };
        if (autoExpunge !== undefined) requestBody.autoExpunge = autoExpunge;
        if (expungeBehavior) requestBody.expungeBehavior = expungeBehavior;
        if (maxFolderSize !== undefined) requestBody.maxFolderSize = maxFolderSize;
        const res = await gmail.users.settings.updateImap({ userId: 'me', requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_pop',
    'Get Gmail POP3 settings',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.getPop({ userId: 'me' });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_update_pop',
    'Update Gmail POP3 settings',
    {
      accessWindow: z.enum(['disabled', 'allMail', 'fromNowOn']).describe('POP access window'),
      disposition: z.enum(['leaveInInbox', 'archive', 'trash', 'markRead']).optional().describe('Action after POP download'),
    },
    async ({ accessWindow, disposition }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = { accessWindow };
        if (disposition) requestBody.disposition = disposition;
        const res = await gmail.users.settings.updatePop({ userId: 'me', requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_language',
    'Get Gmail display language setting',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.getLanguage({ userId: 'me' });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_update_language',
    'Update Gmail display language',
    {
      displayLanguage: z.string().describe('BCP 47 language tag (e.g. "en", "fr", "de", "ja")'),
    },
    async ({ displayLanguage }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.updateLanguage({ userId: 'me', requestBody: { displayLanguage } });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_vacation',
    'Get Gmail vacation/out-of-office auto-reply settings',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.getVacation({ userId: 'me' });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_update_vacation',
    'Update Gmail vacation/out-of-office auto-reply',
    {
      enableAutoReply: z.boolean().describe('Enable or disable auto-reply'),
      responseSubject: z.string().optional().describe('Auto-reply subject line'),
      responseBodyPlainText: z.string().optional().describe('Auto-reply body (plain text)'),
      responseBodyHtml: z.string().optional().describe('Auto-reply body (HTML, overrides plain text)'),
      restrictToContacts: z.boolean().optional().describe('Only reply to contacts (default false)'),
      restrictToDomain: z.boolean().optional().describe('Only reply to same domain (default false)'),
      startTime: z.string().optional().describe('Start time as epoch ms string'),
      endTime: z.string().optional().describe('End time as epoch ms string'),
    },
    async ({ enableAutoReply, responseSubject, responseBodyPlainText, responseBodyHtml, restrictToContacts, restrictToDomain, startTime, endTime }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = { enableAutoReply };
        if (responseSubject) requestBody.responseSubject = responseSubject;
        if (responseBodyPlainText) requestBody.responseBodyPlainText = responseBodyPlainText;
        if (responseBodyHtml) requestBody.responseBodyHtml = responseBodyHtml;
        if (restrictToContacts !== undefined) requestBody.restrictToContacts = restrictToContacts;
        if (restrictToDomain !== undefined) requestBody.restrictToDomain = restrictToDomain;
        if (startTime) requestBody.startTime = startTime;
        if (endTime) requestBody.endTime = endTime;
        const res = await gmail.users.settings.updateVacation({ userId: 'me', requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // SETTINGS - SEND AS (aliases)
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list_send_as',
    'List Gmail send-as aliases (identities you can send from)',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.sendAs.list({ userId: 'me' });
        return { content: [{ type: 'text', text: JSON.stringify(res.data.sendAs || [], null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_send_as',
    'Get details for a specific send-as alias',
    { sendAsEmail: z.string().describe('The send-as email address') },
    async ({ sendAsEmail }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_create_send_as',
    'Create a new send-as alias',
    {
      sendAsEmail: z.string().describe('Email address to send as'),
      displayName: z.string().optional().describe('Display name for the alias'),
      replyToAddress: z.string().optional().describe('Reply-to address'),
      signature: z.string().optional().describe('HTML signature for this alias'),
      isDefault: z.boolean().optional().describe('Make this the default send-as (default false)'),
      treatAsAlias: z.boolean().optional().describe('Treat as alias in Gmail (default true)'),
      smtpHost: z.string().optional().describe('SMTP host for external sending'),
      smtpPort: z.coerce.number().optional().describe('SMTP port'),
      smtpUsername: z.string().optional().describe('SMTP username'),
      smtpPassword: z.string().optional().describe('SMTP password'),
      smtpSecurityMode: z.enum(['none', 'ssl', 'starttls']).optional().describe('SMTP security'),
    },
    async ({ sendAsEmail, displayName, replyToAddress, signature, isDefault, treatAsAlias, smtpHost, smtpPort, smtpUsername, smtpPassword, smtpSecurityMode }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = { sendAsEmail };
        if (displayName) requestBody.displayName = displayName;
        if (replyToAddress) requestBody.replyToAddress = replyToAddress;
        if (signature) requestBody.signature = signature;
        if (isDefault !== undefined) requestBody.isDefault = isDefault;
        if (treatAsAlias !== undefined) requestBody.treatAsAlias = treatAsAlias;
        if (smtpHost) {
          requestBody.smtpMsa = { host: smtpHost };
          if (smtpPort) requestBody.smtpMsa.port = smtpPort;
          if (smtpUsername) requestBody.smtpMsa.username = smtpUsername;
          if (smtpPassword) requestBody.smtpMsa.password = smtpPassword;
          if (smtpSecurityMode) requestBody.smtpMsa.securityMode = smtpSecurityMode;
        }
        const res = await gmail.users.settings.sendAs.create({ userId: 'me', requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_update_send_as',
    'Update an existing send-as alias',
    {
      sendAsEmail: z.string().describe('The send-as email to update'),
      displayName: z.string().optional().describe('Display name'),
      replyToAddress: z.string().optional().describe('Reply-to address'),
      signature: z.string().optional().describe('HTML email signature'),
      isDefault: z.boolean().optional().describe('Make default send-as'),
    },
    async ({ sendAsEmail, displayName, replyToAddress, signature, isDefault }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = {};
        if (displayName !== undefined) requestBody.displayName = displayName;
        if (replyToAddress !== undefined) requestBody.replyToAddress = replyToAddress;
        if (signature !== undefined) requestBody.signature = signature;
        if (isDefault !== undefined) requestBody.isDefault = isDefault;
        const res = await gmail.users.settings.sendAs.patch({ userId: 'me', sendAsEmail, requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_delete_send_as',
    'Delete a send-as alias (cannot delete primary)',
    { sendAsEmail: z.string().describe('The send-as email to delete') },
    async ({ sendAsEmail }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.settings.sendAs.delete({ userId: 'me', sendAsEmail });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: sendAsEmail }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_verify_send_as',
    'Send verification email for a send-as alias',
    { sendAsEmail: z.string().describe('The send-as email to verify') },
    async ({ sendAsEmail }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.settings.sendAs.verify({ userId: 'me', sendAsEmail });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, verificationSent: sendAsEmail }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // SETTINGS - FILTERS
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list_filters',
    'List all Gmail filters (automatic message rules)',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.filters.list({ userId: 'me' });
        return { content: [{ type: 'text', text: JSON.stringify(res.data.filter || [], null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_filter',
    'Get a specific Gmail filter by ID',
    { filterId: z.string().describe('The filter ID') },
    async ({ filterId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.filters.get({ userId: 'me', id: filterId });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_create_filter',
    'Create a Gmail filter (automatic message rule)',
    {
      from: z.string().optional().describe('Match sender'),
      to: z.string().optional().describe('Match recipient'),
      subject: z.string().optional().describe('Match subject'),
      query: z.string().optional().describe('Match Gmail search query'),
      negatedQuery: z.string().optional().describe('Exclude messages matching this query'),
      hasAttachment: z.boolean().optional().describe('Match messages with attachments'),
      excludeChats: z.boolean().optional().describe('Exclude chat messages'),
      size: z.coerce.number().optional().describe('Message size in bytes for comparison'),
      sizeComparison: z.enum(['larger', 'smaller']).optional().describe('Size comparison operator'),
      addLabelIds: z.string().optional().describe('Comma-separated label IDs to add'),
      removeLabelIds: z.string().optional().describe('Comma-separated label IDs to remove'),
      forward: z.string().optional().describe('Email to forward matching messages to'),
      star: z.boolean().optional().describe('Star matching messages'),
      markImportant: z.boolean().optional().describe('Mark as important (true) or not important (false)'),
      categorize: z.enum(['primary', 'social', 'promotions', 'updates', 'forums']).optional().describe('Categorize into tab'),
    },
    async ({ from, to, subject, query, negatedQuery, hasAttachment, excludeChats, size, sizeComparison, addLabelIds, removeLabelIds, forward, star, markImportant, categorize }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const criteria = {};
        if (from) criteria.from = from;
        if (to) criteria.to = to;
        if (subject) criteria.subject = subject;
        if (query) criteria.query = query;
        if (negatedQuery) criteria.negatedQuery = negatedQuery;
        if (hasAttachment !== undefined) criteria.hasAttachment = hasAttachment;
        if (excludeChats !== undefined) criteria.excludeChats = excludeChats;
        if (size !== undefined) criteria.size = size;
        if (sizeComparison) criteria.sizeComparison = sizeComparison;
        const action = {};
        if (addLabelIds) action.addLabelIds = addLabelIds.split(',').map(l => l.trim());
        if (removeLabelIds) action.removeLabelIds = removeLabelIds.split(',').map(l => l.trim());
        if (forward) action.forward = forward;
        const categoryMap = { primary: 'CATEGORY_PERSONAL', social: 'CATEGORY_SOCIAL', promotions: 'CATEGORY_PROMOTIONS', updates: 'CATEGORY_UPDATES', forums: 'CATEGORY_FORUMS' };
        if (categorize && categoryMap[categorize]) {
          action.addLabelIds = [...(action.addLabelIds || []), categoryMap[categorize]];
        }
        const res = await gmail.users.settings.filters.create({
          userId: 'me', requestBody: { criteria, action },
        });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_delete_filter',
    'Delete a Gmail filter',
    { filterId: z.string().describe('The filter ID to delete') },
    async ({ filterId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.settings.filters.delete({ userId: 'me', id: filterId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: filterId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // SETTINGS - FORWARDING ADDRESSES
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list_forwarding_addresses',
    'List all verified forwarding addresses',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.forwardingAddresses.list({ userId: 'me' });
        return { content: [{ type: 'text', text: JSON.stringify(res.data.forwardingAddresses || [], null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_forwarding_address',
    'Get a specific forwarding address and its verification status',
    { forwardingEmail: z.string().describe('The forwarding email address') },
    async ({ forwardingEmail }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.forwardingAddresses.get({ userId: 'me', forwardingEmail });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_create_forwarding_address',
    'Add a new forwarding address (sends verification email)',
    { forwardingEmail: z.string().describe('Email address to add as forwarding destination') },
    async ({ forwardingEmail }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.forwardingAddresses.create({
          userId: 'me', requestBody: { forwardingEmail },
        });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_delete_forwarding_address',
    'Remove a forwarding address',
    { forwardingEmail: z.string().describe('The forwarding email to remove') },
    async ({ forwardingEmail }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.settings.forwardingAddresses.delete({ userId: 'me', forwardingEmail });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: forwardingEmail }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // SETTINGS - DELEGATES
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list_delegates',
    'List Gmail delegates (users who can access your mailbox)',
    {},
    async () => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.delegates.list({ userId: 'me' });
        return { content: [{ type: 'text', text: JSON.stringify(res.data.delegates || [], null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_delegate',
    'Get a specific delegate and their verification status',
    { delegateEmail: z.string().describe('The delegate email address') },
    async ({ delegateEmail }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.delegates.get({ userId: 'me', delegateEmail });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_create_delegate',
    'Add a delegate to your Gmail account',
    { delegateEmail: z.string().describe('Email address of the delegate to add') },
    async ({ delegateEmail }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.delegates.create({
          userId: 'me', requestBody: { delegateEmail },
        });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_delete_delegate',
    'Remove a delegate from your Gmail account',
    { delegateEmail: z.string().describe('Email address of the delegate to remove') },
    async ({ delegateEmail }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.settings.delegates.delete({ userId: 'me', delegateEmail });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: delegateEmail }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // SETTINGS - S/MIME (per send-as alias)
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list_smime',
    'List S/MIME configurations for a send-as alias',
    { sendAsEmail: z.string().describe('The send-as email address') },
    async ({ sendAsEmail }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.sendAs.smimeInfo.list({ userId: 'me', sendAsEmail });
        return { content: [{ type: 'text', text: JSON.stringify(res.data.smimeInfo || [], null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_smime',
    'Get a specific S/MIME configuration by ID',
    {
      sendAsEmail: z.string().describe('The send-as email address'),
      smimeId: z.string().describe('The S/MIME config ID'),
    },
    async ({ sendAsEmail, smimeId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.sendAs.smimeInfo.get({ userId: 'me', sendAsEmail, id: smimeId });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_insert_smime',
    'Upload an S/MIME certificate (PKCS#12) for a send-as alias',
    {
      sendAsEmail: z.string().describe('The send-as email address'),
      pkcs12: z.string().describe('Base64-encoded PKCS#12 format certificate with private/public key pair'),
      encryptedKeyPassword: z.string().optional().describe('Password if the private key is encrypted'),
      isDefault: z.boolean().optional().describe('Set as default S/MIME config (default false)'),
    },
    async ({ sendAsEmail, pkcs12, encryptedKeyPassword, isDefault }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = { pkcs12 };
        if (encryptedKeyPassword) requestBody.encryptedKeyPassword = encryptedKeyPassword;
        if (isDefault !== undefined) requestBody.isDefault = isDefault;
        const res = await gmail.users.settings.sendAs.smimeInfo.insert({ userId: 'me', sendAsEmail, requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_delete_smime',
    'Delete an S/MIME configuration',
    {
      sendAsEmail: z.string().describe('The send-as email address'),
      smimeId: z.string().describe('The S/MIME config ID to delete'),
    },
    async ({ sendAsEmail, smimeId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.settings.sendAs.smimeInfo.delete({ userId: 'me', sendAsEmail, id: smimeId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: smimeId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_set_default_smime',
    'Set an S/MIME configuration as the default for a send-as alias',
    {
      sendAsEmail: z.string().describe('The send-as email address'),
      smimeId: z.string().describe('The S/MIME config ID to make default'),
    },
    async ({ sendAsEmail, smimeId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.settings.sendAs.smimeInfo.setDefault({ userId: 'me', sendAsEmail, id: smimeId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, defaultSmime: smimeId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // SETTINGS - CLIENT-SIDE ENCRYPTION (CSE) IDENTITIES
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list_cse_identities',
    'List client-side encryption (CSE) identities for the user',
    {
      pageToken: z.string().optional().describe('Page token for pagination'),
      pageSize: z.coerce.number().optional().describe('Max results per page'),
    },
    async ({ pageToken, pageSize }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const params = { userId: 'me' };
        if (pageToken) params.pageToken = pageToken;
        if (pageSize) params.pageSize = pageSize;
        const res = await gmail.users.settings.cse.identities.list(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({
            cseIdentities: res.data.cseIdentities || [],
            nextPageToken: res.data.nextPageToken,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_cse_identity',
    'Get a specific CSE identity by email address',
    { cseEmailAddress: z.string().describe('The CSE identity email address') },
    async ({ cseEmailAddress }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.cse.identities.get({ userId: 'me', cseEmailAddress });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_create_cse_identity',
    'Create a new CSE identity for sending encrypted mail',
    {
      emailAddress: z.string().describe('Email address for the CSE identity'),
      primaryKeyPairId: z.string().optional().describe('Primary key pair ID (for single keypair setup)'),
      signAndEncryptKeyPairId: z.string().optional().describe('Key pair ID for signing and encryption'),
      signingKeyPairId: z.string().optional().describe('Key pair ID for signing only (if different from encryption)'),
    },
    async ({ emailAddress, primaryKeyPairId, signAndEncryptKeyPairId, signingKeyPairId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = { emailAddress };
        if (primaryKeyPairId) {
          requestBody.primaryKeyPairId = primaryKeyPairId;
        } else if (signAndEncryptKeyPairId) {
          requestBody.signAndEncryptKeyPairs = { encryptionKeyPairId: signAndEncryptKeyPairId };
          if (signingKeyPairId) requestBody.signAndEncryptKeyPairs.signingKeyPairId = signingKeyPairId;
        }
        const res = await gmail.users.settings.cse.identities.create({ userId: 'me', requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_patch_cse_identity',
    'Update a CSE identity to associate different key pairs',
    {
      emailAddress: z.string().describe('The CSE identity email address to update'),
      primaryKeyPairId: z.string().optional().describe('New primary key pair ID'),
      signAndEncryptKeyPairId: z.string().optional().describe('New encryption key pair ID'),
      signingKeyPairId: z.string().optional().describe('New signing key pair ID'),
    },
    async ({ emailAddress, primaryKeyPairId, signAndEncryptKeyPairId, signingKeyPairId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = {};
        if (primaryKeyPairId) {
          requestBody.primaryKeyPairId = primaryKeyPairId;
        } else if (signAndEncryptKeyPairId) {
          requestBody.signAndEncryptKeyPairs = { encryptionKeyPairId: signAndEncryptKeyPairId };
          if (signingKeyPairId) requestBody.signAndEncryptKeyPairs.signingKeyPairId = signingKeyPairId;
        }
        const res = await gmail.users.settings.cse.identities.patch({
          userId: 'me', emailAddress, requestBody,
        });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_delete_cse_identity',
    'Delete a CSE identity',
    { cseEmailAddress: z.string().describe('The CSE identity email address to delete') },
    async ({ cseEmailAddress }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.settings.cse.identities.delete({ userId: 'me', cseEmailAddress });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: cseEmailAddress }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ══════════════════════════════════════════════════════════════════════
  // SETTINGS - CLIENT-SIDE ENCRYPTION (CSE) KEYPAIRS
  // ══════════════════════════════════════════════════════════════════════

  server.tool(
    'gmail_list_cse_keypairs',
    'List all CSE key pairs for the user',
    {
      pageToken: z.string().optional().describe('Page token for pagination'),
      pageSize: z.coerce.number().optional().describe('Max results per page'),
    },
    async ({ pageToken, pageSize }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const params = { userId: 'me' };
        if (pageToken) params.pageToken = pageToken;
        if (pageSize) params.pageSize = pageSize;
        const res = await gmail.users.settings.cse.keypairs.list(params);
        return {
          content: [{ type: 'text', text: JSON.stringify({
            cseKeyPairs: res.data.cseKeyPairs || [],
            nextPageToken: res.data.nextPageToken,
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_get_cse_keypair',
    'Get a specific CSE key pair by ID',
    { keyPairId: z.string().describe('The key pair ID') },
    async ({ keyPairId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.cse.keypairs.get({ userId: 'me', keyPairId });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_create_cse_keypair',
    'Upload a new CSE key pair (PKCS#7 PEM-encoded public key chain + private key metadata)',
    {
      pem: z.string().describe('PKCS#7 PEM-encoded public key certificate chain'),
      kaclsUrl: z.string().optional().describe('KACLS (Key Access Control List Service) URL for private key wrapping'),
      hardwareKeyMetadata: z.string().optional().describe('JSON string of hardware key metadata (for hardware-backed keys)'),
    },
    async ({ pem, kaclsUrl, hardwareKeyMetadata }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const requestBody = { pem };
        if (kaclsUrl) {
          requestBody.privateKeyMetadata = [{
            kaclsKeyMetadata: { kaclsUri: kaclsUrl },
          }];
        }
        if (hardwareKeyMetadata) {
          requestBody.privateKeyMetadata = [{
            hardwareKeyMetadata: JSON.parse(hardwareKeyMetadata),
          }];
        }
        const res = await gmail.users.settings.cse.keypairs.create({ userId: 'me', requestBody });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_enable_cse_keypair',
    'Enable a previously disabled CSE key pair (restores signing and decryption)',
    { keyPairId: z.string().describe('The key pair ID to enable') },
    async ({ keyPairId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.cse.keypairs.enable({ userId: 'me', keyPairId });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_disable_cse_keypair',
    'Disable a CSE key pair (prevents signing and decryption, allows deletion after 30 days)',
    { keyPairId: z.string().describe('The key pair ID to disable') },
    async ({ keyPairId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.settings.cse.keypairs.disable({ userId: 'me', keyPairId });
        return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'gmail_obliterate_cse_keypair',
    'Permanently and irreversibly destroy a CSE key pair (no recovery possible)',
    { keyPairId: z.string().describe('The key pair ID to permanently destroy') },
    async ({ keyPairId }) => {
      try {
        const auth = getAuth();
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.settings.cse.keypairs.obliterate({ userId: 'me', keyPairId });
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, obliterated: keyPairId }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );
}
