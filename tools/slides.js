import { getAuth } from '../auth.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { randomUUID } from 'crypto';

function success(text) {
  return { content: [{ type: 'text', text }] };
}

function error(e) {
  const message = e?.message || String(e);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function extractSlideText(slide) {
  const texts = [];
  for (const element of slide.pageElements || []) {
    if (element.shape?.text?.textElements) {
      for (const te of element.shape.text.textElements) {
        if (te.textRun?.content) {
          texts.push(te.textRun.content);
        }
      }
    }
  }
  return texts.join('').trim();
}

export function registerSlidesTools(server) {

  // 1. slides_create - Create a new Google Slides presentation
  server.tool(
    'slides_create',
    'Create a new Google Slides presentation',
    {
      title: z.string().describe('Title of the new presentation'),
      parentId: z.string().optional().describe('Drive folder ID to create the presentation in'),
    },
    async ({ title, parentId }) => {
      try {
        const auth = getAuth();
        const slides = google.slides({ version: 'v1', auth });

        const res = await slides.presentations.create({
          requestBody: { title },
        });

        const pres = res.data;
        const presentationId = pres.presentationId;

        if (parentId) {
          const drive = google.drive({ version: 'v3', auth });
          const file = await drive.files.get({ fileId: presentationId, fields: 'parents' });
          const currentParents = (file.data.parents || []).join(',');
          await drive.files.update({
            fileId: presentationId,
            addParents: parentId,
            removeParents: currentParents,
            fields: 'id,parents',
          });
        }

        return success(
          `Presentation created.\nTitle: ${pres.title}\nID: ${presentationId}\nSlides: ${pres.slides?.length || 0}\nURL: https://docs.google.com/presentation/d/${presentationId}/edit`
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 2. slides_read - Read presentation content
  server.tool(
    'slides_read',
    'Read a Google Slides presentation and return text content of all slides',
    {
      presentationId: z.string().describe('The Google Slides presentation ID'),
    },
    async ({ presentationId }) => {
      try {
        const slides = google.slides({ version: 'v1', auth: getAuth() });
        const res = await slides.presentations.get({ presentationId });

        const pres = res.data;
        const slideList = pres.slides || [];

        const lines = [
          `Title: ${pres.title}`,
          `Slides: ${slideList.length}`,
          `${'─'.repeat(40)}`,
        ];

        for (let i = 0; i < slideList.length; i++) {
          const slide = slideList[i];
          const text = extractSlideText(slide);
          lines.push(`\nSlide ${i + 1} (ID: ${slide.objectId}):`);
          lines.push(text || '(no text content)');
        }

        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 3. slides_add_slide - Add a new slide
  server.tool(
    'slides_add_slide',
    'Add a new slide to a Google Slides presentation',
    {
      presentationId: z.string().describe('The presentation ID'),
      insertionIndex: z.coerce.number().optional().describe('Position to insert the slide (0-based, default: end)'),
      predefinedLayout: z.string().optional().describe('Layout: BLANK, TITLE, TITLE_AND_BODY, TITLE_AND_TWO_COLUMNS, etc. (default: BLANK)'),
    },
    async ({ presentationId, insertionIndex, predefinedLayout }) => {
      try {
        const slides = google.slides({ version: 'v1', auth: getAuth() });
        const objectId = `slide_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

        const createSlideRequest = {
          objectId,
          slideLayoutReference: {
            predefinedLayout: predefinedLayout || 'BLANK',
          },
        };

        if (insertionIndex !== undefined) {
          createSlideRequest.insertionIndex = insertionIndex;
        }

        const res = await slides.presentations.batchUpdate({
          presentationId,
          requestBody: {
            requests: [{ createSlide: createSlideRequest }],
          },
        });

        const newSlideId = res.data.replies?.[0]?.createSlide?.objectId || objectId;
        return success(`Slide added.\nSlide ID: ${newSlideId}\nLayout: ${predefinedLayout || 'BLANK'}`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 4. slides_insert_text - Insert text into a shape on a slide
  server.tool(
    'slides_insert_text',
    'Insert text into a shape or text box on a Google Slides presentation',
    {
      presentationId: z.string().describe('The presentation ID'),
      objectId: z.string().describe('The object ID of the shape/text box to insert text into'),
      text: z.string().describe('Text to insert'),
      insertionIndex: z.coerce.number().optional().describe('Character index within the shape (default: 0)'),
    },
    async ({ presentationId, objectId, text, insertionIndex }) => {
      try {
        const slides = google.slides({ version: 'v1', auth: getAuth() });
        const res = await slides.presentations.batchUpdate({
          presentationId,
          requestBody: {
            requests: [{
              insertText: {
                objectId,
                text,
                insertionIndex: insertionIndex || 0,
              },
            }],
          },
        });
        return success(`Text inserted into object ${objectId}.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 5. slides_replace_all_text - Find and replace text across all slides
  server.tool(
    'slides_replace_all_text',
    'Find and replace text across all slides in a Google Slides presentation',
    {
      presentationId: z.string().describe('The presentation ID'),
      find: z.string().describe('Text to find'),
      replace: z.string().describe('Replacement text'),
      matchCase: z.boolean().optional().describe('Case-sensitive match (default: false)'),
    },
    async ({ presentationId, find, replace, matchCase }) => {
      try {
        const slides = google.slides({ version: 'v1', auth: getAuth() });
        const res = await slides.presentations.batchUpdate({
          presentationId,
          requestBody: {
            requests: [{
              replaceAllText: {
                containsText: { text: find, matchCase: matchCase || false },
                replaceText: replace,
              },
            }],
          },
        });
        const count = res.data.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;
        return success(`Replace complete. ${count} occurrence(s) replaced.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 6. slides_batch_update - Apply batch updates
  server.tool(
    'slides_batch_update',
    'Apply batch update requests to a Google Slides presentation (text, images, shapes, formatting, etc.)',
    {
      presentationId: z.string().describe('The presentation ID'),
      requests: z.string().describe('JSON string of an array of Slides API request objects'),
    },
    async ({ presentationId, requests }) => {
      try {
        const parsed = JSON.parse(requests);
        if (!Array.isArray(parsed)) {
          return error(new Error('requests must be a JSON array'));
        }

        const slides = google.slides({ version: 'v1', auth: getAuth() });
        const res = await slides.presentations.batchUpdate({
          presentationId,
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
}
