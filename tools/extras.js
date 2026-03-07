import { getAuth } from '../auth.js';
import { google } from 'googleapis';
import { z } from 'zod';

export function registerExtraTools(server) {

  // ── People / Contacts ─────────────────────────────────────────────

  server.tool(
    'contacts_list',
    'List Google Contacts or search by query',
    {
      maxResults: z.coerce.number().optional().describe('Max contacts to return (default 20)'),
      query: z.string().optional().describe('Search query to filter contacts'),
    },
    async ({ maxResults, query }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        let results;
        if (query) {
          const res = await people.people.searchContacts({
            query,
            pageSize: maxResults || 20,
            readMask: 'names,emailAddresses,phoneNumbers'
          });
          results = (res.data.results || []).map(r => r.person);
        } else {
          const res = await people.people.connections.list({
            resourceName: 'people/me',
            pageSize: maxResults || 20,
            personFields: 'names,emailAddresses,phoneNumbers'
          });
          results = res.data.connections || [];
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_get',
    'Get a specific Google Contact by resource name',
    {
      resourceName: z.string().describe("Contact resource name, e.g. 'people/c1234'"),
    },
    async ({ resourceName }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const res = await people.people.get({
          resourceName,
          personFields: 'names,emailAddresses,phoneNumbers,addresses,organizations,biographies'
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Tasks ──────────────────────────────────────────────────────────

  server.tool(
    'tasks_list',
    'List all Google Task lists',
    {},
    async () => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        const res = await tasks.tasklists.list();
        const lists = res.data.items || [];

        return {
          content: [{ type: 'text', text: JSON.stringify(lists, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'tasks_list_tasks',
    'List tasks in a specific task list',
    {
      taskListId: z.string().optional().describe("Task list ID (default '@default')"),
      showCompleted: z.boolean().optional().describe('Include completed tasks (default false)'),
    },
    async ({ taskListId, showCompleted }) => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        const res = await tasks.tasks.list({
          tasklist: taskListId || '@default',
          showCompleted: showCompleted || false
        });
        const items = res.data.items || [];

        return {
          content: [{ type: 'text', text: JSON.stringify(items, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'tasks_create',
    'Create a new Google Task',
    {
      title: z.string().describe('Task title'),
      notes: z.string().optional().describe('Task notes/description'),
      due: z.string().optional().describe('Due date in ISO format (e.g. 2026-03-01T00:00:00.000Z)'),
      taskListId: z.string().optional().describe("Task list ID (default '@default')"),
    },
    async ({ title, notes, due, taskListId }) => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        const requestBody = { title };
        if (notes) requestBody.notes = notes;
        if (due) requestBody.due = due;

        const res = await tasks.tasks.insert({
          tasklist: taskListId || '@default',
          requestBody
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'tasks_complete',
    'Mark a Google Task as completed',
    {
      taskId: z.string().describe('ID of the task to complete'),
      taskListId: z.string().optional().describe("Task list ID (default '@default')"),
    },
    async ({ taskId, taskListId }) => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        const res = await tasks.tasks.patch({
          tasklist: taskListId || '@default',
          task: taskId,
          requestBody: { status: 'completed' }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Sheets ─────────────────────────────────────────────────────────

  server.tool(
    'sheets_read',
    'Read data from a Google Spreadsheet',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      range: z.string().describe("Cell range in A1 notation, e.g. 'Sheet1!A1:D10'"),
    },
    async ({ spreadsheetId, range }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range
        });
        const rows = res.data.values || [];

        return {
          content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_write',
    'Write data to a Google Spreadsheet',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      range: z.string().describe("Cell range in A1 notation, e.g. 'Sheet1!A1:D10'"),
      values: z.string().describe('JSON string of a 2D array, e.g. [["A1","B1"],["A2","B2"]]'),
    },
    async ({ spreadsheetId, range, values }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const parsedValues = JSON.parse(values);

        const res = await sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: parsedValues }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Contacts CRUD ─────────────────────────────────────────────────

  server.tool(
    'contacts_create',
    'Create a new Google Contact',
    {
      givenName: z.string().describe('First name'),
      familyName: z.string().optional().describe('Last name'),
      email: z.string().optional().describe('Email address'),
      phone: z.string().optional().describe('Phone number'),
      organization: z.string().optional().describe('Organization/company name'),
    },
    async ({ givenName, familyName, email, phone, organization }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const requestBody = {
          names: [{ givenName, familyName }],
          emailAddresses: email ? [{ value: email }] : undefined,
          phoneNumbers: phone ? [{ value: phone }] : undefined,
          organizations: organization ? [{ name: organization }] : undefined,
        };

        const res = await people.people.createContact({ requestBody });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_update',
    'Update an existing Google Contact',
    {
      resourceName: z.string().describe("Contact resource name, e.g. 'people/c1234'"),
      givenName: z.string().optional().describe('First name'),
      familyName: z.string().optional().describe('Last name'),
      email: z.string().optional().describe('Email address'),
      phone: z.string().optional().describe('Phone number'),
    },
    async ({ resourceName, givenName, familyName, email, phone }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const existing = await people.people.get({
          resourceName,
          personFields: 'names,emailAddresses,phoneNumbers'
        });

        const requestBody = {
          etag: existing.data.etag,
          names: givenName || familyName
            ? [{ givenName: givenName || existing.data.names?.[0]?.givenName, familyName: familyName || existing.data.names?.[0]?.familyName }]
            : existing.data.names,
          emailAddresses: email ? [{ value: email }] : existing.data.emailAddresses,
          phoneNumbers: phone ? [{ value: phone }] : existing.data.phoneNumbers,
        };

        const res = await people.people.updateContact({
          resourceName,
          updatePersonFields: 'names,emailAddresses,phoneNumbers',
          requestBody
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_delete',
    'Delete a Google Contact',
    {
      resourceName: z.string().describe("Contact resource name, e.g. 'people/c1234'"),
    },
    async ({ resourceName }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        await people.people.deleteContact({ resourceName });

        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: resourceName }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_groups_list',
    'List contact groups (labels)',
    {},
    async () => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const res = await people.contactGroups.list({ pageSize: 50 });
        const groups = res.data.contactGroups || [];

        return {
          content: [{ type: 'text', text: JSON.stringify(groups, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Tasks CRUD ────────────────────────────────────────────────────

  server.tool(
    'tasks_create_list',
    'Create a new Google Task list',
    {
      title: z.string().describe('Title for the new task list'),
    },
    async ({ title }) => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        const res = await tasks.tasklists.insert({ requestBody: { title } });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'tasks_delete_list',
    'Delete a Google Task list',
    {
      taskListId: z.string().describe('ID of the task list to delete'),
    },
    async ({ taskListId }) => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        await tasks.tasklists.delete({ tasklist: taskListId });

        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: taskListId }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'tasks_update',
    'Update a Google Task',
    {
      taskId: z.string().describe('ID of the task to update'),
      taskListId: z.string().optional().describe("Task list ID (default '@default')"),
      title: z.string().optional().describe('New task title'),
      notes: z.string().optional().describe('New task notes'),
      due: z.string().optional().describe('New due date in ISO format'),
      status: z.string().optional().describe('needsAction or completed'),
    },
    async ({ taskId, taskListId, title, notes, due, status }) => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        const requestBody = {};
        if (title !== undefined) requestBody.title = title;
        if (notes !== undefined) requestBody.notes = notes;
        if (due !== undefined) requestBody.due = due;
        if (status !== undefined) requestBody.status = status;

        const res = await tasks.tasks.patch({
          tasklist: taskListId || '@default',
          task: taskId,
          requestBody
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'tasks_delete',
    'Delete a Google Task',
    {
      taskId: z.string().describe('ID of the task to delete'),
      taskListId: z.string().optional().describe("Task list ID (default '@default')"),
    },
    async ({ taskId, taskListId }) => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        await tasks.tasks.delete({
          tasklist: taskListId || '@default',
          task: taskId
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: taskId }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'tasks_move',
    'Move or reorder a Google Task',
    {
      taskId: z.string().describe('ID of the task to move'),
      taskListId: z.string().optional().describe("Task list ID (default '@default')"),
      parent: z.string().optional().describe('Parent task ID to make this a subtask'),
      previous: z.string().optional().describe('Task ID to insert after'),
    },
    async ({ taskId, taskListId, parent, previous }) => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        const params = {
          tasklist: taskListId || '@default',
          task: taskId,
        };
        if (parent !== undefined) params.parent = parent;
        if (previous !== undefined) params.previous = previous;

        const res = await tasks.tasks.move(params);

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Sheets Extended ───────────────────────────────────────────────

  server.tool(
    'sheets_create',
    'Create a new Google Spreadsheet',
    {
      title: z.string().describe('Title for the new spreadsheet'),
    },
    async ({ title }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.create({
          requestBody: { properties: { title } }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({
            spreadsheetId: res.data.spreadsheetId,
            title: res.data.properties.title,
            url: res.data.spreadsheetUrl
          }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_append',
    'Append rows to a Google Spreadsheet',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      range: z.string().describe("Cell range in A1 notation, e.g. 'Sheet1!A1:D10'"),
      values: z.string().describe('JSON string of a 2D array, e.g. [["A1","B1"],["A2","B2"]]'),
    },
    async ({ spreadsheetId, range, values }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const parsedValues = JSON.parse(values);

        const res = await sheets.spreadsheets.values.append({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: parsedValues }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_clear',
    'Clear values from a range in a Google Spreadsheet',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      range: z.string().describe("Cell range in A1 notation, e.g. 'Sheet1!A1:D10'"),
    },
    async ({ spreadsheetId, range }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_batch_update',
    'Apply batch update requests to a Google Spreadsheet (formatting, add/delete sheets, merge cells, charts, conditional formatting, etc.)',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      requests: z.string().describe('JSON string of an array of Sheets API request objects (e.g. addSheet, mergeCells, updateBorders, addChart, etc.)'),
    },
    async ({ spreadsheetId, requests }) => {
      try {
        const parsed = JSON.parse(requests);
        if (!Array.isArray(parsed)) {
          return { content: [{ type: 'text', text: 'Error: requests must be a JSON array' }], isError: true };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: parsed },
        });

        return {
          content: [{ type: 'text', text: `Batch update applied. ${res.data.replies?.length || 0} operation(s) completed.\n${JSON.stringify(res.data.replies || [], null, 2)}` }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_get_info',
    'Get spreadsheet metadata (title, sheets, dimensions)',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
    },
    async ({ spreadsheetId }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: 'properties,sheets.properties'
        });

        const info = {
          title: res.data.properties.title,
          locale: res.data.properties.locale,
          sheets: (res.data.sheets || []).map(s => ({
            title: s.properties.title,
            sheetId: s.properties.sheetId,
            rowCount: s.properties.gridProperties?.rowCount,
            columnCount: s.properties.gridProperties?.columnCount,
          }))
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(info, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Sheets Batch & Extra ─────────────────────────────────────────

  server.tool(
    'sheets_batch_get',
    'Read multiple ranges at once from a Google Spreadsheet (spreadsheets.values.batchGet)',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      ranges: z.string().describe("Comma-separated ranges in A1 notation, e.g. 'Sheet1!A1:B2,Sheet1!C1:D2'"),
    },
    async ({ spreadsheetId, ranges }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.values.batchGet({
          spreadsheetId,
          ranges: ranges.split(',').map(r => r.trim())
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data.valueRanges || [], null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_batch_clear',
    'Clear multiple ranges in a Google Spreadsheet (spreadsheets.values.batchClear)',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      ranges: z.string().describe("Comma-separated ranges in A1 notation, e.g. 'Sheet1!A1:B2,Sheet1!C1:D2'"),
    },
    async ({ spreadsheetId, ranges }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.values.batchClear({
          spreadsheetId,
          requestBody: { ranges: ranges.split(',').map(r => r.trim()) }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_batch_update_values',
    'Write to multiple ranges at once in a Google Spreadsheet (spreadsheets.values.batchUpdate)',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      data: z.string().describe('JSON string of an array of {range, values} objects, e.g. [{"range":"Sheet1!A1","values":[["v1"]]}]'),
    },
    async ({ spreadsheetId, data }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const parsedData = JSON.parse(data);

        const res = await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: parsedData
          }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_copy_sheet',
    'Copy a sheet to another spreadsheet (spreadsheets.sheets.copyTo)',
    {
      spreadsheetId: z.string().describe('The source spreadsheet ID'),
      sheetId: z.coerce.number().describe('The sheet ID within the source spreadsheet'),
      destinationSpreadsheetId: z.string().describe('The destination spreadsheet ID'),
    },
    async ({ spreadsheetId, sheetId, destinationSpreadsheetId }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.sheets.copyTo({
          spreadsheetId,
          sheetId,
          requestBody: { destinationSpreadsheetId }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_get_by_data_filter',
    'Get spreadsheet filtered by data filter (spreadsheets.getByDataFilter)',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      dataFilters: z.string().describe('JSON string of data filters array'),
    },
    async ({ spreadsheetId, dataFilters }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const parsedFilters = JSON.parse(dataFilters);

        const res = await sheets.spreadsheets.getByDataFilter({
          spreadsheetId,
          requestBody: { dataFilters: parsedFilters }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_developer_metadata_get',
    'Get developer metadata by ID (spreadsheets.developerMetadata.get)',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      metadataId: z.coerce.number().describe('The developer metadata ID'),
    },
    async ({ spreadsheetId, metadataId }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const res = await sheets.spreadsheets.developerMetadata.get({
          spreadsheetId,
          metadataId
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_developer_metadata_search',
    'Search developer metadata (spreadsheets.developerMetadata.search)',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      dataFilters: z.string().describe('JSON string of data filters array for metadata search'),
    },
    async ({ spreadsheetId, dataFilters }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const parsedFilters = JSON.parse(dataFilters);

        const res = await sheets.spreadsheets.developerMetadata.search({
          spreadsheetId,
          requestBody: { dataFilters: parsedFilters }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Contacts Batch & Extended ──────────────────────────────────

  server.tool(
    'contacts_batch_create',
    'Create multiple Google Contacts at once (people.batchCreateContacts)',
    {
      contacts: z.string().describe('JSON array of contact objects, each with fields like names, emailAddresses, phoneNumbers'),
    },
    async ({ contacts }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const parsedContacts = JSON.parse(contacts);
        const contactsArray = parsedContacts.map(c => ({
          contactPerson: c
        }));

        const res = await people.people.batchCreateContacts({
          requestBody: {
            contacts: contactsArray,
            readMask: 'names,emailAddresses,phoneNumbers'
          }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_batch_delete',
    'Delete multiple Google Contacts at once (people.batchDeleteContacts)',
    {
      resourceNames: z.string().describe("Comma-separated resource names, e.g. 'people/c1234,people/c5678'"),
    },
    async ({ resourceNames }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const names = resourceNames.split(',').map(r => r.trim());

        await people.people.batchDeleteContacts({
          requestBody: { resourceNames: names }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: names }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_batch_update',
    'Update multiple Google Contacts at once (people.batchUpdateContacts)',
    {
      contacts: z.string().describe('JSON object with resourceName keys mapping to contact person objects'),
    },
    async ({ contacts }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        let parsedContacts = JSON.parse(contacts);

        // Convert array format to map format if needed
        // API expects: { "people/c123": { person fields... }, ... }
        if (Array.isArray(parsedContacts)) {
          const contactMap = {};
          for (const item of parsedContacts) {
            const rn = item.resourceName;
            if (rn) {
              const person = item.person || item;
              delete person.resourceName;
              contactMap[rn] = person;
            }
          }
          parsedContacts = contactMap;
        }

        // Fetch etags for each contact (required by the API)
        const resourceNames = Object.keys(parsedContacts);
        if (resourceNames.length > 0) {
          const batchGet = await people.people.getBatchGet({
            resourceNames,
            personFields: 'metadata'
          });
          for (const resp of (batchGet.data.responses || [])) {
            const rn = resp.person?.resourceName;
            if (rn && parsedContacts[rn]) {
              parsedContacts[rn].etag = resp.person.etag;
            }
          }
        }

        const res = await people.people.batchUpdateContacts({
          requestBody: {
            contacts: parsedContacts,
            updateMask: 'names,emailAddresses,phoneNumbers',
            readMask: 'names,emailAddresses,phoneNumbers'
          }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_batch_get',
    'Get multiple Google Contacts at once (people.getBatchGet)',
    {
      resourceNames: z.string().describe("Comma-separated resource names, e.g. 'people/c1234,people/c5678'"),
    },
    async ({ resourceNames }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const names = resourceNames.split(',').map(r => r.trim());

        const res = await people.people.getBatchGet({
          resourceNames: names,
          personFields: 'names,emailAddresses,phoneNumbers,addresses,organizations'
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data.responses || [], null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_delete_photo',
    'Delete a contact photo (people.deleteContactPhoto)',
    {
      resourceName: z.string().describe("Contact resource name, e.g. 'people/c1234'"),
    },
    async ({ resourceName }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const res = await people.people.deleteContactPhoto({ resourceName });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_update_photo',
    'Update a contact photo (people.updateContactPhoto)',
    {
      resourceName: z.string().describe("Contact resource name, e.g. 'people/c1234'"),
      photoBytes: z.string().describe('Base64-encoded photo bytes'),
    },
    async ({ resourceName, photoBytes }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const res = await people.people.updateContactPhoto({
          resourceName,
          requestBody: { photoBytes }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_search_directory',
    'Search domain directory for people (people.searchDirectoryPeople)',
    {
      query: z.string().describe('Search query'),
      sources: z.string().describe("Comma-separated sources, e.g. 'DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT,DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'"),
      readMask: z.string().describe("Comma-separated person fields, e.g. 'names,emailAddresses,phoneNumbers'"),
    },
    async ({ query, sources, readMask }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const res = await people.people.searchDirectoryPeople({
          query,
          sources: sources.split(',').map(s => s.trim()),
          readMask
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data.people || [], null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_list_directory',
    'List domain directory contacts (people.listDirectoryPeople)',
    {
      sources: z.string().describe("Comma-separated sources, e.g. 'DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT,DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'"),
      readMask: z.string().describe("Comma-separated person fields, e.g. 'names,emailAddresses,phoneNumbers'"),
      pageSize: z.coerce.number().optional().describe('Max results to return (default 20)'),
    },
    async ({ sources, readMask, pageSize }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const res = await people.people.listDirectoryPeople({
          sources: sources.split(',').map(s => s.trim()),
          readMask,
          pageSize: pageSize || 20
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data.people || [], null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Contact Groups Extended ────────────────────────────────────

  server.tool(
    'contacts_group_get',
    'Get a specific contact group (contactGroups.get)',
    {
      resourceName: z.string().describe("Contact group resource name, e.g. 'contactGroups/abc123'"),
    },
    async ({ resourceName }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const res = await people.contactGroups.get({ resourceName });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_group_create',
    'Create a new contact group (contactGroups.create)',
    {
      name: z.string().describe('Name for the new contact group'),
    },
    async ({ name }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const res = await people.contactGroups.create({
          requestBody: { contactGroup: { name } }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_group_update',
    'Update a contact group name (contactGroups.update)',
    {
      resourceName: z.string().describe("Contact group resource name, e.g. 'contactGroups/abc123'"),
      name: z.string().describe('New name for the contact group'),
    },
    async ({ resourceName, name }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        // Fetch existing group to get required etag
        const existing = await people.contactGroups.get({ resourceName });
        const etag = existing.data.etag;

        const res = await people.contactGroups.update({
          resourceName,
          requestBody: { contactGroup: { name, etag } }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_group_delete',
    'Delete a contact group (contactGroups.delete)',
    {
      resourceName: z.string().describe("Contact group resource name, e.g. 'contactGroups/abc123'"),
    },
    async ({ resourceName }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        await people.contactGroups.delete({ resourceName });

        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, deleted: resourceName }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_group_batch_get',
    'Get multiple contact groups at once (contactGroups.batchGet)',
    {
      resourceNames: z.string().describe("Comma-separated contact group resource names, e.g. 'contactGroups/abc,contactGroups/def'"),
    },
    async ({ resourceNames }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const names = resourceNames.split(',').map(r => r.trim());

        const res = await people.contactGroups.batchGet({
          resourceNames: names
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data.responses || [], null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_group_modify_members',
    'Add or remove contacts from a contact group (contactGroups.members.modify)',
    {
      resourceName: z.string().describe("Contact group resource name, e.g. 'contactGroups/abc123'"),
      addResourceNames: z.string().optional().describe("Comma-separated contact resource names to add, e.g. 'people/c1234,people/c5678'"),
      removeResourceNames: z.string().optional().describe("Comma-separated contact resource names to remove, e.g. 'people/c1234,people/c5678'"),
    },
    async ({ resourceName, addResourceNames, removeResourceNames }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const requestBody = {};
        if (addResourceNames) requestBody.resourceNamesToAdd = addResourceNames.split(',').map(r => r.trim());
        if (removeResourceNames) requestBody.resourceNamesToRemove = removeResourceNames.split(',').map(r => r.trim());

        const res = await people.contactGroups.members.modify({
          resourceName,
          requestBody
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Other Contacts ─────────────────────────────────────────────

  server.tool(
    'contacts_other_list',
    'List "Other contacts" (otherContacts.list)',
    {
      readMask: z.string().optional().describe("Comma-separated person fields, e.g. 'names,emailAddresses' (default 'names,emailAddresses,phoneNumbers')"),
      pageSize: z.coerce.number().optional().describe('Max results to return (default 20)'),
    },
    async ({ readMask, pageSize }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const res = await people.otherContacts.list({
          readMask: readMask || 'names,emailAddresses,phoneNumbers',
          pageSize: pageSize || 20
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data.otherContacts || [], null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_other_search',
    'Search other contacts (otherContacts.search)',
    {
      query: z.string().describe('Search query'),
      readMask: z.string().optional().describe("Comma-separated person fields, e.g. 'names,emailAddresses' (default 'names,emailAddresses,phoneNumbers')"),
    },
    async ({ query, readMask }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const res = await people.otherContacts.search({
          query,
          readMask: readMask || 'names,emailAddresses,phoneNumbers'
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data.results || [], null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'contacts_other_copy',
    'Copy an "other contact" to My Contacts group (otherContacts.copyOtherContactToMyContactsGroup)',
    {
      resourceName: z.string().describe("Other contact resource name, e.g. 'otherContacts/c1234'"),
    },
    async ({ resourceName }) => {
      try {
        const auth = getAuth();
        const people = google.people({ version: 'v1', auth });

        const res = await people.otherContacts.copyOtherContactToMyContactsGroup({
          resourceName,
          requestBody: {
            copyMask: 'names,emailAddresses,phoneNumbers'
          }
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Tasks Extended ─────────────────────────────────────────────

  server.tool(
    'tasks_get_list',
    'Get a specific Google Task list (tasklists.get)',
    {
      taskListId: z.string().describe('ID of the task list'),
    },
    async ({ taskListId }) => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        const res = await tasks.tasklists.get({ tasklist: taskListId });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'tasks_get',
    'Get a specific Google Task (tasks.get)',
    {
      taskListId: z.string().describe("Task list ID (use '@default' for the default list)"),
      taskId: z.string().describe('ID of the task'),
    },
    async ({ taskListId, taskId }) => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        const res = await tasks.tasks.get({
          tasklist: taskListId,
          task: taskId
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'tasks_clear',
    'Clear all completed tasks from a task list (tasks.clear)',
    {
      taskListId: z.string().describe("Task list ID (use '@default' for the default list)"),
    },
    async ({ taskListId }) => {
      try {
        const auth = getAuth();
        const tasks = google.tasks({ version: 'v1', auth });

        await tasks.tasks.clear({ tasklist: taskListId });

        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, cleared: taskListId }, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // ── Sheets DataFilter variants ─────────────────────────────────

  server.tool(
    'sheets_batch_get_by_data_filter',
    'Read multiple ranges from a spreadsheet using data filters',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      dataFilters: z.string().describe('JSON array of DataFilter objects (e.g. [{"developerMetadataLookup":{"metadataKey":"key"}},{"gridRange":{"sheetId":0,"startRowIndex":0,"endRowIndex":10}}])'),
    },
    async ({ spreadsheetId, dataFilters }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const parsed = JSON.parse(dataFilters);
        const res = await sheets.spreadsheets.values.batchGetByDataFilter({
          spreadsheetId,
          requestBody: { dataFilters: parsed },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_batch_clear_by_data_filter',
    'Clear values from a spreadsheet using data filters',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      dataFilters: z.string().describe('JSON array of DataFilter objects'),
    },
    async ({ spreadsheetId, dataFilters }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const parsed = JSON.parse(dataFilters);
        const res = await sheets.spreadsheets.values.batchClearByDataFilter({
          spreadsheetId,
          requestBody: { dataFilters: parsed },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  server.tool(
    'sheets_batch_update_values_by_data_filter',
    'Write values to a spreadsheet using data filters',
    {
      spreadsheetId: z.string().describe('The spreadsheet ID'),
      data: z.string().describe('JSON array of DataFilterValueRange objects (e.g. [{"dataFilter":{"gridRange":{"sheetId":0}},"values":[["a","b"]]}])'),
      valueInputOption: z.enum(['RAW', 'USER_ENTERED']).optional().describe("How to interpret input data (default 'USER_ENTERED')"),
    },
    async ({ spreadsheetId, data, valueInputOption }) => {
      try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const parsed = JSON.parse(data);
        const res = await sheets.spreadsheets.values.batchUpdateByDataFilter({
          spreadsheetId,
          requestBody: {
            data: parsed,
            valueInputOption: valueInputOption || 'USER_ENTERED',
          },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );
}
