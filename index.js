#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerDriveTools } from './tools/drive.js';
import { registerCalendarTools } from './tools/calendar.js';
import { registerExtraTools } from './tools/extras.js';

const server = new McpServer({
  name: 'google-mcp-server',
  version: '1.0.0',
  description: 'Custom Google MCP server - Drive, Calendar, Contacts, Tasks, Sheets',
});

registerDriveTools(server);
registerCalendarTools(server);
registerExtraTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
