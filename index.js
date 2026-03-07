#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerDriveTools } from './tools/drive.js';
import { registerCalendarTools } from './tools/calendar.js';
import { registerExtraTools } from './tools/extras.js';
import { registerDocsTools } from './tools/docs.js';
import { registerSlidesTools } from './tools/slides.js';
import { registerGmailTools } from './tools/gmail.js';

const server = new McpServer({
  name: 'google-mcp-server',
  version: '2.1.0',
  description: 'Custom Google MCP server - Drive, Calendar, Contacts, Tasks, Sheets, Docs, Slides, Gmail',
});

registerDriveTools(server);
registerCalendarTools(server);
registerExtraTools(server);
registerDocsTools(server);
registerSlidesTools(server);
registerGmailTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
