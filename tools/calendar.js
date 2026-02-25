import { getAuth } from '../auth.js';
import { google } from 'googleapis';
import { z } from 'zod';

export function registerCalendarTools(server) {
  // 1. List upcoming events
  server.tool(
    'calendar_list_events',
    'List upcoming Google Calendar events',
    {
      maxResults: z.coerce.number().optional().describe('Maximum number of events to return (default 10)'),
      timeMin: z.string().optional().describe('Start of time range in ISO 8601 format (defaults to now)'),
      timeMax: z.string().optional().describe('End of time range in ISO 8601 format'),
      calendarId: z.string().optional().describe('Calendar ID (default: primary)'),
    },
    async ({ maxResults, timeMin, timeMax, calendarId }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });
        const params = {
          calendarId: calendarId || 'primary',
          maxResults: maxResults || 10,
          timeMin: timeMin || new Date().toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        };
        if (timeMax) {
          params.timeMax = timeMax;
        }

        const res = await calendar.events.list(params);
        const events = res.data.items || [];

        if (events.length === 0) {
          return {
            content: [{ type: 'text', text: 'No upcoming events found.' }],
          };
        }

        const formatted = events
          .map((event, i) => {
            const start =
              event.start.dateTime || event.start.date || 'No start time';
            const end =
              event.end.dateTime || event.end.date || 'No end time';
            let line = `${i + 1}. ${event.summary || '(No title)'}`;
            line += `\n   ID: ${event.id}`;
            line += `\n   Start: ${start}`;
            line += `\n   End: ${end}`;
            if (event.location) {
              line += `\n   Location: ${event.location}`;
            }
            if (event.description) {
              line += `\n   Description: ${event.description}`;
            }
            return line;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${events.length} event(s):\n\n${formatted}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 2. Search events by text query
  server.tool(
    'calendar_search_events',
    'Search Google Calendar events by text query (searches summary, description, location, attendees)',
    {
      query: z.string().describe('Text to search for in events'),
      maxResults: z.coerce.number().optional().describe('Maximum results (default 10)'),
      timeMin: z.string().optional().describe('Start of time range in ISO 8601 (defaults to now)'),
      timeMax: z.string().optional().describe('End of time range in ISO 8601'),
      calendarId: z.string().optional().describe('Calendar ID (default: primary)'),
    },
    async ({ query, maxResults, timeMin, timeMax, calendarId }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });
        const params = {
          calendarId: calendarId || 'primary',
          q: query,
          maxResults: maxResults || 10,
          timeMin: timeMin || new Date().toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        };
        if (timeMax) params.timeMax = timeMax;

        const res = await calendar.events.list(params);
        const events = res.data.items || [];

        if (events.length === 0) {
          return { content: [{ type: 'text', text: `No events found matching "${query}".` }] };
        }

        const formatted = events.map((event, i) => {
          const start = event.start.dateTime || event.start.date || 'N/A';
          let line = `${i + 1}. ${event.summary || '(No title)'}`;
          line += `\n   ID: ${event.id}`;
          line += `\n   Start: ${start}`;
          if (event.location) line += `\n   Location: ${event.location}`;
          return line;
        }).join('\n\n');

        return { content: [{ type: 'text', text: `Found ${events.length} event(s) for "${query}":\n\n${formatted}` }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // 3. Create a new event
  server.tool(
    'calendar_create_event',
    'Create a new Google Calendar event',
    {
      summary: z.string().describe('Event title (required)'),
      startTime: z.string().describe('Start time in ISO 8601 (e.g. 2026-03-01T10:00:00-06:00) or date-only for all-day events (e.g. 2026-03-01)'),
      endTime: z.string().describe('End time in ISO 8601 (e.g. 2026-03-01T11:00:00-06:00) or date-only for all-day events (e.g. 2026-03-02)'),
      description: z.string().optional().describe('Event description'),
      location: z.string().optional().describe('Event location'),
      calendarId: z.string().optional().describe('Calendar ID (default: primary)'),
    },
    async ({ summary, startTime, endTime, description, location, calendarId }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(startTime);
        const event = {
          summary,
          start: isAllDay ? { date: startTime } : { dateTime: startTime },
          end: isAllDay ? { date: endTime } : { dateTime: endTime },
        };
        if (description) event.description = description;
        if (location) event.location = location;

        const res = await calendar.events.insert({
          calendarId: calendarId || 'primary',
          requestBody: event,
        });

        const created = res.data;
        const startDisplay = created.start.dateTime || created.start.date;
        const endDisplay = created.end.dateTime || created.end.date;

        return {
          content: [
            {
              type: 'text',
              text: [
                'Event created successfully!',
                `  ID: ${created.id}`,
                `  Summary: ${created.summary}`,
                `  Start: ${startDisplay}`,
                `  End: ${endDisplay}`,
                created.location ? `  Location: ${created.location}` : null,
                created.description
                  ? `  Description: ${created.description}`
                  : null,
                `  Link: ${created.htmlLink}`,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 3. Update an existing event
  server.tool(
    'calendar_update_event',
    'Update an existing Google Calendar event',
    {
      eventId: z.string().describe('ID of the event to update (required)'),
      summary: z.string().optional().describe('New event title'),
      startTime: z.string().optional().describe('New start time in ISO 8601 format'),
      endTime: z.string().optional().describe('New end time in ISO 8601 format'),
      description: z.string().optional().describe('New event description'),
      location: z.string().optional().describe('New event location'),
      calendarId: z.string().optional().describe('Calendar ID (default: primary)'),
    },
    async ({ eventId, summary, startTime, endTime, description, location, calendarId }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        const patch = {};
        if (summary !== undefined) patch.summary = summary;
        if (description !== undefined) patch.description = description;
        if (location !== undefined) patch.location = location;
        if (startTime) patch.start = { dateTime: startTime };
        if (endTime) patch.end = { dateTime: endTime };

        const res = await calendar.events.patch({
          calendarId: calendarId || 'primary',
          eventId,
          requestBody: patch,
        });

        const updated = res.data;
        const startDisplay = updated.start.dateTime || updated.start.date;
        const endDisplay = updated.end.dateTime || updated.end.date;

        return {
          content: [
            {
              type: 'text',
              text: [
                'Event updated successfully!',
                `  ID: ${updated.id}`,
                `  Summary: ${updated.summary}`,
                `  Start: ${startDisplay}`,
                `  End: ${endDisplay}`,
                updated.location ? `  Location: ${updated.location}` : null,
                updated.description
                  ? `  Description: ${updated.description}`
                  : null,
                `  Link: ${updated.htmlLink}`,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 4. Delete an event
  server.tool(
    'calendar_delete_event',
    'Delete a Google Calendar event',
    {
      eventId: z.string().describe('ID of the event to delete (required)'),
      calendarId: z.string().optional().describe('Calendar ID (default: primary)'),
    },
    async ({ eventId, calendarId }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        await calendar.events.delete({
          calendarId: calendarId || 'primary',
          eventId,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Event ${eventId} deleted successfully.`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 5. List all calendars
  server.tool(
    'calendar_list_calendars',
    'List all Google Calendars accessible to the user',
    {},
    async () => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        const res = await calendar.calendarList.list();
        const calendars = res.data.items || [];

        if (calendars.length === 0) {
          return {
            content: [{ type: 'text', text: 'No calendars found.' }],
          };
        }

        const formatted = calendars
          .map((cal, i) => {
            let line = `${i + 1}. ${cal.summary}`;
            line += `\n   ID: ${cal.id}`;
            if (cal.primary) {
              line += '\n   (Primary)';
            }
            return line;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${calendars.length} calendar(s):\n\n${formatted}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 6. Quick add event from natural language
  server.tool(
    'calendar_quick_add',
    'Create a Google Calendar event from natural language text (e.g. "Meeting tomorrow at 3pm")',
    {
      text: z.string().describe('Natural language event, e.g. "Meeting tomorrow at 3pm"'),
      calendarId: z.string().optional().describe('Calendar ID (default: primary)'),
    },
    async ({ text, calendarId }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        const res = await calendar.events.quickAdd({
          calendarId: calendarId || 'primary',
          text,
        });

        const created = res.data;
        const startDisplay = created.start?.dateTime || created.start?.date || 'N/A';
        const endDisplay = created.end?.dateTime || created.end?.date || 'N/A';

        return {
          content: [
            {
              type: 'text',
              text: [
                'Event created via quick add!',
                `  ID: ${created.id}`,
                `  Summary: ${created.summary || '(No title)'}`,
                `  Start: ${startDisplay}`,
                `  End: ${endDisplay}`,
                `  Link: ${created.htmlLink}`,
              ].join('\n'),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 7. Get a single event's details
  server.tool(
    'calendar_get_event',
    'Get detailed information about a specific Google Calendar event',
    {
      eventId: z.string().describe('ID of the event to retrieve'),
      calendarId: z.string().optional().describe('Calendar ID (default: primary)'),
    },
    async ({ eventId, calendarId }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        const res = await calendar.events.get({
          calendarId: calendarId || 'primary',
          eventId,
        });

        const event = res.data;
        const startDisplay = event.start?.dateTime || event.start?.date || 'N/A';
        const endDisplay = event.end?.dateTime || event.end?.date || 'N/A';

        const lines = [
          `Event Details:`,
          `  ID: ${event.id}`,
          `  Summary: ${event.summary || '(No title)'}`,
          `  Status: ${event.status}`,
          `  Start: ${startDisplay}`,
          `  End: ${endDisplay}`,
        ];
        if (event.location) lines.push(`  Location: ${event.location}`);
        if (event.description) lines.push(`  Description: ${event.description}`);
        if (event.creator) lines.push(`  Creator: ${event.creator.email}`);
        if (event.organizer) lines.push(`  Organizer: ${event.organizer.email}`);
        if (event.attendees && event.attendees.length > 0) {
          lines.push(`  Attendees:`);
          event.attendees.forEach((a) => {
            lines.push(`    - ${a.email} (${a.responseStatus || 'unknown'})`);
          });
        }
        if (event.recurrence) lines.push(`  Recurrence: ${event.recurrence.join(', ')}`);
        if (event.htmlLink) lines.push(`  Link: ${event.htmlLink}`);

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 8. Move event to another calendar
  server.tool(
    'calendar_move_event',
    'Move a Google Calendar event from one calendar to another',
    {
      eventId: z.string().describe('ID of the event to move'),
      sourceCalendarId: z.string().describe('Calendar ID of the source calendar'),
      destinationCalendarId: z.string().describe('Calendar ID of the destination calendar'),
    },
    async ({ eventId, sourceCalendarId, destinationCalendarId }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        const res = await calendar.events.move({
          calendarId: sourceCalendarId,
          eventId,
          destination: destinationCalendarId,
        });

        const moved = res.data;
        return {
          content: [
            {
              type: 'text',
              text: [
                'Event moved successfully!',
                `  ID: ${moved.id}`,
                `  Summary: ${moved.summary || '(No title)'}`,
                `  From: ${sourceCalendarId}`,
                `  To: ${destinationCalendarId}`,
                `  Link: ${moved.htmlLink}`,
              ].join('\n'),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 9. List instances of a recurring event
  server.tool(
    'calendar_recurring_instances',
    'List instances of a recurring Google Calendar event',
    {
      eventId: z.string().describe('ID of the recurring event'),
      calendarId: z.string().optional().describe('Calendar ID (default: primary)'),
      maxResults: z.coerce.number().optional().describe('Maximum number of instances to return (default 10)'),
    },
    async ({ eventId, calendarId, maxResults }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        const res = await calendar.events.instances({
          calendarId: calendarId || 'primary',
          eventId,
          maxResults: maxResults || 10,
        });

        const instances = res.data.items || [];

        if (instances.length === 0) {
          return {
            content: [{ type: 'text', text: 'No instances found for this recurring event.' }],
          };
        }

        const formatted = instances
          .map((event, i) => {
            const start = event.start?.dateTime || event.start?.date || 'N/A';
            const end = event.end?.dateTime || event.end?.date || 'N/A';
            let line = `${i + 1}. ${event.summary || '(No title)'}`;
            line += `\n   ID: ${event.id}`;
            line += `\n   Start: ${start}`;
            line += `\n   End: ${end}`;
            if (event.status) line += `\n   Status: ${event.status}`;
            return line;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${instances.length} instance(s):\n\n${formatted}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 10. Check free/busy time
  server.tool(
    'calendar_freebusy',
    'Check free/busy time for one or more Google Calendars',
    {
      timeMin: z.string().describe('Start time in ISO 8601 format'),
      timeMax: z.string().describe('End time in ISO 8601 format'),
      calendarIds: z.string().describe('Comma-separated calendar IDs (e.g. "primary,work@group.calendar.google.com")'),
    },
    async ({ timeMin, timeMax, calendarIds }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        const ids = calendarIds.split(',').map((id) => id.trim()).filter(Boolean);

        const res = await calendar.freebusy.query({
          requestBody: {
            timeMin,
            timeMax,
            items: ids.map((id) => ({ id })),
          },
        });

        const calendars = res.data.calendars || {};
        const lines = [`Free/Busy from ${timeMin} to ${timeMax}:\n`];

        for (const [calId, data] of Object.entries(calendars)) {
          lines.push(`Calendar: ${calId}`);
          if (data.errors && data.errors.length > 0) {
            lines.push(`  Errors: ${data.errors.map((e) => e.reason).join(', ')}`);
          }
          const busy = data.busy || [];
          if (busy.length === 0) {
            lines.push('  Status: Free (no busy periods)');
          } else {
            lines.push(`  Busy periods (${busy.length}):`);
            busy.forEach((period, i) => {
              lines.push(`    ${i + 1}. ${period.start} - ${period.end}`);
            });
          }
          lines.push('');
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 11. Create a new calendar
  server.tool(
    'calendar_create_calendar',
    'Create a new Google Calendar',
    {
      summary: z.string().describe('Name/title of the new calendar'),
      description: z.string().optional().describe('Description of the calendar'),
      timeZone: z.string().optional().describe('Time zone (e.g. "America/New_York")'),
    },
    async ({ summary, description, timeZone }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        const requestBody = { summary };
        if (description) requestBody.description = description;
        if (timeZone) requestBody.timeZone = timeZone;

        const res = await calendar.calendars.insert({ requestBody });

        const created = res.data;
        const lines = [
          'Calendar created successfully!',
          `  ID: ${created.id}`,
          `  Summary: ${created.summary}`,
        ];
        if (created.description) lines.push(`  Description: ${created.description}`);
        if (created.timeZone) lines.push(`  Time Zone: ${created.timeZone}`);

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 12. Update a calendar
  server.tool(
    'calendar_update_calendar',
    'Update a Google Calendar (name, description, time zone)',
    {
      calendarId: z.string().describe('ID of the calendar to update'),
      summary: z.string().optional().describe('New calendar name'),
      description: z.string().optional().describe('New description'),
      timeZone: z.string().optional().describe('New time zone'),
    },
    async ({ calendarId, summary, description, timeZone }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });
        const patch = {};
        if (summary !== undefined) patch.summary = summary;
        if (description !== undefined) patch.description = description;
        if (timeZone !== undefined) patch.timeZone = timeZone;

        const res = await calendar.calendars.patch({
          calendarId,
          requestBody: patch,
        });
        const updated = res.data;
        return {
          content: [{ type: 'text', text: `Calendar updated.\n  ID: ${updated.id}\n  Summary: ${updated.summary}\n  Time Zone: ${updated.timeZone || 'N/A'}` }],
        };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
  );

  // 13. Delete a calendar
  server.tool(
    'calendar_delete_calendar',
    'Delete a Google Calendar (cannot delete primary)',
    {
      calendarId: z.string().describe('ID of the calendar to delete'),
    },
    async ({ calendarId }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        await calendar.calendars.delete({ calendarId });

        return {
          content: [
            {
              type: 'text',
              text: `Calendar ${calendarId} deleted successfully.`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  // 13. Clear all events from a calendar
  server.tool(
    'calendar_clear',
    'Clear all events from a Google Calendar (removes all events but keeps the calendar)',
    {
      calendarId: z.string().describe('ID of the calendar to clear'),
    },
    async ({ calendarId }) => {
      try {
        const calendar = google.calendar({ version: 'v3', auth: getAuth() });

        await calendar.calendars.clear({ calendarId });

        return {
          content: [
            {
              type: 'text',
              text: `All events cleared from calendar ${calendarId}.`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'Error: ' + e.message }],
          isError: true,
        };
      }
    }
  );
}
