import { getAuth } from '../auth.js';
import { google } from 'googleapis';
import { z } from 'zod';

export function registerExtraTools(server) {

  // ── People / Contacts ─────────────────────────────────────────────

  server.tool(
    'contacts_list',
    'List Google Contacts or search by query',
    {
      maxResults: z.number().optional().describe('Max contacts to return (default 20)'),
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
}
