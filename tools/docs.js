import { getAuth } from '../auth.js';
import { google } from 'googleapis';
import { z } from 'zod';

function success(text) {
  return { content: [{ type: 'text', text }] };
}

function error(e) {
  const message = e?.message || String(e);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function extractText(content) {
  const parts = [];
  for (const element of content || []) {
    if (element.paragraph) {
      const text = (element.paragraph.elements || [])
        .map(e => e.textRun?.content || '')
        .join('');
      parts.push(text);
    } else if (element.table) {
      for (const row of element.table.tableRows || []) {
        const cells = (row.tableCells || [])
          .map(cell => extractText(cell.content).trim())
          .join(' | ');
        parts.push(cells);
      }
    } else if (element.sectionBreak) {
      parts.push('---\n');
    }
  }
  return parts.join('');
}

export function registerDocsTools(server) {

  // 1. docs_create - Create a new Google Doc
  server.tool(
    'docs_create',
    'Create a new Google Doc, optionally with initial content and in a specific folder',
    {
      title: z.string().describe('Title of the new document'),
      content: z.string().optional().describe('Initial text content to insert'),
      parentId: z.string().optional().describe('Drive folder ID to create the doc in'),
    },
    async ({ title, content, parentId }) => {
      try {
        const auth = getAuth();
        const docs = google.docs({ version: 'v1', auth });

        const res = await docs.documents.create({
          requestBody: { title },
        });

        const doc = res.data;
        const documentId = doc.documentId;

        if (content) {
          await docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [{
                insertText: {
                  location: { index: 1 },
                  text: content,
                },
              }],
            },
          });
        }

        if (parentId) {
          const drive = google.drive({ version: 'v3', auth });
          const file = await drive.files.get({ fileId: documentId, fields: 'parents' });
          const currentParents = (file.data.parents || []).join(',');
          await drive.files.update({
            fileId: documentId,
            addParents: parentId,
            removeParents: currentParents,
            fields: 'id,parents',
          });
        }

        return success(
          `Document created.\nTitle: ${doc.title}\nID: ${documentId}\nURL: https://docs.google.com/document/d/${documentId}/edit`
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 2. docs_read - Read document content as plain text
  server.tool(
    'docs_read',
    'Read a Google Doc and return its content as plain text',
    {
      documentId: z.string().describe('The Google Doc document ID'),
    },
    async ({ documentId }) => {
      try {
        const docs = google.docs({ version: 'v1', auth: getAuth() });
        const res = await docs.documents.get({ documentId });

        const doc = res.data;
        const text = extractText(doc.body?.content);

        return success(`Title: ${doc.title}\n${'─'.repeat(40)}\n${text}`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 3. docs_insert_text - Insert text at a position
  server.tool(
    'docs_insert_text',
    'Insert text into a Google Doc at a specified position',
    {
      documentId: z.string().describe('The Google Doc document ID'),
      text: z.string().describe('Text to insert'),
      index: z.coerce.number().optional().describe('Character index to insert at (default: 1, start of doc)'),
      segmentId: z.string().optional().describe('Segment ID for headers/footers (omit for body)'),
    },
    async ({ documentId, text, index, segmentId }) => {
      try {
        const docs = google.docs({ version: 'v1', auth: getAuth() });
        const location = { index: index || 1 };
        if (segmentId) location.segmentId = segmentId;

        const res = await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [{
              insertText: { location, text },
            }],
          },
        });

        return success(`Text inserted at index ${index || 1}. Replies: ${res.data.replies?.length || 0}`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 4. docs_batch_update - Apply batch updates (formatting, tables, images, etc.)
  server.tool(
    'docs_batch_update',
    'Apply batch update requests to a Google Doc (formatting, tables, images, page breaks, etc.)',
    {
      documentId: z.string().describe('The Google Doc document ID'),
      requests: z.string().describe('JSON string of an array of Docs API request objects'),
    },
    async ({ documentId, requests }) => {
      try {
        const parsed = JSON.parse(requests);
        if (!Array.isArray(parsed)) {
          return error(new Error('requests must be a JSON array'));
        }

        const docs = google.docs({ version: 'v1', auth: getAuth() });
        const res = await docs.documents.batchUpdate({
          documentId,
          requestBody: { requests: parsed },
        });

        return success(
          `Batch update applied. ${res.data.replies?.length || 0} operation(s) completed.` +
          (res.data.replies ? '\nReplies: ' + JSON.stringify(res.data.replies) : '')
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 5. docs_insert_table - Insert a table
  server.tool(
    'docs_insert_table',
    'Insert a table into a Google Doc at a specified position',
    {
      documentId: z.string().describe('The Google Doc document ID'),
      rows: z.coerce.number().describe('Number of rows'),
      columns: z.coerce.number().describe('Number of columns'),
      index: z.coerce.number().optional().describe('Character index to insert at (default: 1)'),
    },
    async ({ documentId, rows, columns, index }) => {
      try {
        const docs = google.docs({ version: 'v1', auth: getAuth() });
        const res = await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [{
              insertTable: {
                location: { index: index || 1 },
                rows,
                columns,
              },
            }],
          },
        });
        return success(`Table (${rows}x${columns}) inserted at index ${index || 1}.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 6. docs_insert_image - Insert an inline image from URL
  server.tool(
    'docs_insert_image',
    'Insert an inline image into a Google Doc from a URL',
    {
      documentId: z.string().describe('The Google Doc document ID'),
      imageUrl: z.string().describe('Public URL of the image to insert'),
      index: z.coerce.number().optional().describe('Character index to insert at (default: 1)'),
      width: z.coerce.number().optional().describe('Image width in points (72 points = 1 inch)'),
      height: z.coerce.number().optional().describe('Image height in points'),
    },
    async ({ documentId, imageUrl, index, width, height }) => {
      try {
        const docs = google.docs({ version: 'v1', auth: getAuth() });
        const request = {
          insertInlineImage: {
            location: { index: index || 1 },
            uri: imageUrl,
          },
        };
        if (width || height) {
          request.insertInlineImage.objectSize = {
            width: width ? { magnitude: width, unit: 'PT' } : undefined,
            height: height ? { magnitude: height, unit: 'PT' } : undefined,
          };
        }

        const res = await docs.documents.batchUpdate({
          documentId,
          requestBody: { requests: [request] },
        });
        const imgId = res.data.replies?.[0]?.insertInlineImage?.objectId;
        return success(`Image inserted at index ${index || 1}.${imgId ? `\nObject ID: ${imgId}` : ''}`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 7. docs_find_replace - Find and replace text
  server.tool(
    'docs_find_replace',
    'Find and replace text in a Google Doc',
    {
      documentId: z.string().describe('The Google Doc document ID'),
      find: z.string().describe('Text to find'),
      replace: z.string().describe('Replacement text'),
      matchCase: z.boolean().optional().describe('Case-sensitive match (default: false)'),
    },
    async ({ documentId, find, replace, matchCase }) => {
      try {
        const docs = google.docs({ version: 'v1', auth: getAuth() });
        const res = await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [{
              replaceAllText: {
                containsText: { text: find, matchCase: matchCase || false },
                replaceText: replace,
              },
            }],
          },
        });

        const changed = res.data.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;
        return success(`Find & replace complete. ${changed} occurrence(s) replaced.`);
      } catch (e) {
        return error(e);
      }
    }
  );
}
