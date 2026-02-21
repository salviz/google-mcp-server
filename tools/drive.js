import { getAuth } from '../auth.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { Readable } from 'stream';

const GOOGLE_MIME_EXPORTS = {
  'application/vnd.google-apps.document': {
    mimeType: 'text/plain',
    label: 'Google Doc',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'text/csv',
    label: 'Google Sheet',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'text/plain',
    label: 'Google Slides',
  },
  'application/vnd.google-apps.drawing': {
    mimeType: 'image/svg+xml',
    label: 'Google Drawing',
  },
};

function formatFileEntry(file) {
  const parts = [`- ${file.name}`];
  if (file.id) parts.push(`  ID: ${file.id}`);
  if (file.mimeType) parts.push(`  Type: ${file.mimeType}`);
  if (file.size) parts.push(`  Size: ${file.size} bytes`);
  if (file.modifiedTime) parts.push(`  Modified: ${file.modifiedTime}`);
  if (file.webViewLink) parts.push(`  Link: ${file.webViewLink}`);
  return parts.join('\n');
}

function success(text) {
  return { content: [{ type: 'text', text }] };
}

function error(e) {
  const message = e?.message || String(e);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

export function registerDriveTools(server) {
  // 1. drive_search - Search files in Drive
  server.tool(
    'drive_search',
    'Search for files in Google Drive using a query string',
    {
      query: z.string().describe('Search query (Drive search syntax supported)'),
      maxResults: z.number().optional().describe('Maximum number of results to return (default: 10)'),
    },
    async ({ query, maxResults }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const pageSize = maxResults || 10;

        const res = await drive.files.list({
          q: query,
          pageSize,
          fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
        });

        const files = res.data.files || [];
        if (files.length === 0) {
          return success('No files found matching the query.');
        }

        const lines = [`Found ${files.length} file(s):\n`];
        for (const file of files) {
          lines.push(formatFileEntry(file));
        }
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 2. drive_read - Read/get file content
  server.tool(
    'drive_read',
    'Read the content of a file from Google Drive. Exports Google Docs/Sheets/Slides as text/csv.',
    {
      fileId: z.string().describe('The ID of the file to read'),
    },
    async ({ fileId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });

        // Get file metadata first to determine type
        const meta = await drive.files.get({
          fileId,
          fields: 'id,name,mimeType,size',
        });

        const mimeType = meta.data.mimeType;
        const exportConfig = GOOGLE_MIME_EXPORTS[mimeType];

        let content;

        if (exportConfig) {
          // Google Workspace file - export it
          const res = await drive.files.export({
            fileId,
            mimeType: exportConfig.mimeType,
          });
          content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
        } else {
          // Regular file - download content
          const res = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'text' }
          );
          content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
        }

        const header = `File: ${meta.data.name} (${mimeType})\n${'─'.repeat(40)}\n`;
        return success(header + content);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 3. drive_list - List files in a folder
  server.tool(
    'drive_list',
    'List files in a specific Google Drive folder',
    {
      folderId: z.string().optional().describe("Folder ID to list (default: 'root')"),
      maxResults: z.number().optional().describe('Maximum number of results to return (default: 20)'),
    },
    async ({ folderId, maxResults }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const folder = folderId || 'root';
        const pageSize = maxResults || 20;

        const res = await drive.files.list({
          q: `'${folder}' in parents and trashed = false`,
          pageSize,
          fields: 'files(id,name,mimeType,modifiedTime,size,webViewLink)',
          orderBy: 'folder,name',
        });

        const files = res.data.files || [];
        if (files.length === 0) {
          return success('No files found in this folder.');
        }

        const lines = [`Listing ${files.length} item(s) in folder '${folder}':\n`];
        for (const file of files) {
          lines.push(formatFileEntry(file));
        }
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 4. drive_file_info - Get file metadata
  server.tool(
    'drive_file_info',
    'Get detailed metadata about a file in Google Drive',
    {
      fileId: z.string().describe('The ID of the file to get info about'),
    },
    async ({ fileId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });

        const res = await drive.files.get({
          fileId,
          fields: 'id,name,mimeType,size,createdTime,modifiedTime,webViewLink,owners,shared,description,starred,trashed',
        });

        const f = res.data;
        const lines = [
          `Name: ${f.name}`,
          `ID: ${f.id}`,
          `Type: ${f.mimeType}`,
          f.size ? `Size: ${f.size} bytes` : null,
          `Created: ${f.createdTime}`,
          `Modified: ${f.modifiedTime}`,
          f.webViewLink ? `Link: ${f.webViewLink}` : null,
          `Shared: ${f.shared || false}`,
          `Starred: ${f.starred || false}`,
          `Trashed: ${f.trashed || false}`,
          f.description ? `Description: ${f.description}` : null,
          f.owners?.length
            ? `Owners: ${f.owners.map((o) => `${o.displayName} <${o.emailAddress}>`).join(', ')}`
            : null,
        ];

        return success(lines.filter(Boolean).join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 5. drive_create_folder - Create a folder
  server.tool(
    'drive_create_folder',
    'Create a new folder in Google Drive',
    {
      name: z.string().describe('Name of the folder to create'),
      parentId: z.string().optional().describe('Parent folder ID (optional, defaults to root)'),
    },
    async ({ name, parentId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });

        const fileMetadata = {
          name,
          mimeType: 'application/vnd.google-apps.folder',
        };

        if (parentId) {
          fileMetadata.parents = [parentId];
        }

        const res = await drive.files.create({
          requestBody: fileMetadata,
          fields: 'id,name,webViewLink',
        });

        const folder = res.data;
        return success(
          `Folder created successfully.\nName: ${folder.name}\nID: ${folder.id}` +
            (folder.webViewLink ? `\nLink: ${folder.webViewLink}` : '')
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 6. drive_create_file - Create a text file in Drive
  server.tool(
    'drive_create_file',
    'Create a new text file in Google Drive',
    {
      name: z.string().describe('Name of the file to create'),
      content: z.string().describe('Content of the file'),
      mimeType: z.string().optional().describe("MIME type of the file (default: 'text/plain')"),
      parentId: z.string().optional().describe('Parent folder ID (optional, defaults to root)'),
    },
    async ({ name, content, mimeType, parentId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const fileMimeType = mimeType || 'text/plain';

        const res = await drive.files.create({
          requestBody: {
            name,
            parents: parentId ? [parentId] : undefined,
          },
          media: {
            mimeType: fileMimeType,
            body: Readable.from([content]),
          },
          fields: 'id,name,mimeType,webViewLink',
        });

        const file = res.data;
        return success(
          `File created successfully.\nName: ${file.name}\nID: ${file.id}\nType: ${file.mimeType}` +
            (file.webViewLink ? `\nLink: ${file.webViewLink}` : '')
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 7. drive_update_file - Update file metadata and/or content
  server.tool(
    'drive_update_file',
    'Update file metadata and/or content in Google Drive',
    {
      fileId: z.string().describe('The ID of the file to update'),
      name: z.string().optional().describe('New name for the file'),
      content: z.string().optional().describe('New content for the file'),
      description: z.string().optional().describe('New description for the file'),
    },
    async ({ fileId, name, content, description }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });

        const requestBody = {};
        if (name) requestBody.name = name;
        if (description) requestBody.description = description;

        const params = {
          fileId,
          requestBody,
          fields: 'id,name,mimeType,modifiedTime,webViewLink',
        };

        if (content) {
          params.media = {
            mimeType: 'text/plain',
            body: Readable.from([content]),
          };
        }

        const res = await drive.files.update(params);

        const file = res.data;
        return success(
          `File updated successfully.\nName: ${file.name}\nID: ${file.id}\nModified: ${file.modifiedTime}` +
            (file.webViewLink ? `\nLink: ${file.webViewLink}` : '')
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 8. drive_delete - Delete a file permanently
  server.tool(
    'drive_delete',
    'Permanently delete a file from Google Drive',
    {
      fileId: z.string().describe('The ID of the file to delete'),
    },
    async ({ fileId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        await drive.files.delete({ fileId });
        return success(`File ${fileId} deleted permanently.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 9. drive_trash - Move file to trash
  server.tool(
    'drive_trash',
    'Move a file to trash in Google Drive',
    {
      fileId: z.string().describe('The ID of the file to trash'),
    },
    async ({ fileId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.files.update({
          fileId,
          requestBody: { trashed: true },
          fields: 'id,name,trashed',
        });
        const file = res.data;
        return success(`File '${file.name}' (${file.id}) moved to trash.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 10. drive_untrash - Restore file from trash
  server.tool(
    'drive_untrash',
    'Restore a file from trash in Google Drive',
    {
      fileId: z.string().describe('The ID of the file to restore from trash'),
    },
    async ({ fileId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.files.update({
          fileId,
          requestBody: { trashed: false },
          fields: 'id,name,trashed',
        });
        const file = res.data;
        return success(`File '${file.name}' (${file.id}) restored from trash.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 11. drive_copy - Copy a file
  server.tool(
    'drive_copy',
    'Copy a file in Google Drive',
    {
      fileId: z.string().describe('The ID of the file to copy'),
      name: z.string().optional().describe('Name for the copied file'),
      parentId: z.string().optional().describe('Parent folder ID for the copy'),
    },
    async ({ fileId, name, parentId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.files.copy({
          fileId,
          requestBody: {
            name,
            parents: parentId ? [parentId] : undefined,
          },
          fields: 'id,name,mimeType,webViewLink',
        });

        const file = res.data;
        return success(
          `File copied successfully.\nName: ${file.name}\nID: ${file.id}\nType: ${file.mimeType}` +
            (file.webViewLink ? `\nLink: ${file.webViewLink}` : '')
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 12. drive_move - Move a file to a different folder
  server.tool(
    'drive_move',
    'Move a file to a different folder in Google Drive',
    {
      fileId: z.string().describe('The ID of the file to move'),
      newParentId: z.string().describe('The ID of the new parent folder'),
      removeFromCurrent: z.boolean().optional().describe('Remove from current parent (default: true)'),
    },
    async ({ fileId, newParentId, removeFromCurrent }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const shouldRemove = removeFromCurrent !== false;

        let removeParents;
        if (shouldRemove) {
          const current = await drive.files.get({
            fileId,
            fields: 'parents',
          });
          removeParents = (current.data.parents || []).join(',');
        }

        const res = await drive.files.update({
          fileId,
          addParents: newParentId,
          removeParents: removeParents || undefined,
          fields: 'id,name,parents',
        });

        const file = res.data;
        return success(
          `File moved successfully.\nName: ${file.name}\nID: ${file.id}\nNew parent(s): ${(file.parents || []).join(', ')}`
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 13. drive_share - Share a file with someone
  server.tool(
    'drive_share',
    'Share a file with someone in Google Drive',
    {
      fileId: z.string().describe('The ID of the file to share'),
      email: z.string().describe('Email address to share with'),
      role: z.string().describe('Permission role: reader, writer, commenter, owner'),
      type: z.string().optional().describe("Permission type: user, group, domain, anyone (default: 'user')"),
    },
    async ({ fileId, email, role, type }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const permissionType = type || 'user';

        const res = await drive.permissions.create({
          fileId,
          requestBody: {
            role,
            type: permissionType,
            emailAddress: email,
          },
          sendNotificationEmail: true,
          fields: 'id,role,type,emailAddress',
        });

        const perm = res.data;
        return success(
          `File shared successfully.\nPermission ID: ${perm.id}\nRole: ${perm.role}\nType: ${perm.type}\nEmail: ${perm.emailAddress || email}`
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 14. drive_list_permissions - List sharing permissions on a file
  server.tool(
    'drive_list_permissions',
    'List sharing permissions on a file in Google Drive',
    {
      fileId: z.string().describe('The ID of the file to list permissions for'),
    },
    async ({ fileId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.permissions.list({
          fileId,
          fields: 'permissions(id,role,type,emailAddress,displayName)',
        });

        const permissions = res.data.permissions || [];
        if (permissions.length === 0) {
          return success('No permissions found for this file.');
        }

        const lines = [`Found ${permissions.length} permission(s):\n`];
        for (const perm of permissions) {
          const parts = [`- Role: ${perm.role}, Type: ${perm.type}`];
          if (perm.emailAddress) parts.push(`  Email: ${perm.emailAddress}`);
          if (perm.displayName) parts.push(`  Name: ${perm.displayName}`);
          parts.push(`  Permission ID: ${perm.id}`);
          lines.push(parts.join('\n'));
        }
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 15. drive_remove_permission - Remove sharing permission
  server.tool(
    'drive_remove_permission',
    'Remove a sharing permission from a file in Google Drive',
    {
      fileId: z.string().describe('The ID of the file'),
      permissionId: z.string().describe('The ID of the permission to remove'),
    },
    async ({ fileId, permissionId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        await drive.permissions.delete({ fileId, permissionId });
        return success(`Permission ${permissionId} removed from file ${fileId}.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 16. drive_about - Get Drive storage info
  server.tool(
    'drive_about',
    'Get Google Drive storage quota and user info',
    {},
    async () => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.about.get({
          fields: 'storageQuota,user',
        });

        const { storageQuota, user } = res.data;
        const formatBytes = (bytes) => {
          if (!bytes) return 'N/A';
          const num = Number(bytes);
          if (num >= 1073741824) return `${(num / 1073741824).toFixed(2)} GB`;
          if (num >= 1048576) return `${(num / 1048576).toFixed(2)} MB`;
          if (num >= 1024) return `${(num / 1024).toFixed(2)} KB`;
          return `${num} bytes`;
        };

        const lines = [
          `User: ${user?.displayName || 'Unknown'} <${user?.emailAddress || 'Unknown'}>`,
          `Storage Used: ${formatBytes(storageQuota?.usage)}`,
          `Storage Limit: ${formatBytes(storageQuota?.limit)}`,
          `Drive Usage: ${formatBytes(storageQuota?.usageInDrive)}`,
          `Trash Usage: ${formatBytes(storageQuota?.usageInDriveTrash)}`,
        ];
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );
}
