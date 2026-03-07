import { getAuth } from '../auth.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { Readable } from 'stream';
import { createReadStream, createWriteStream, statSync, existsSync } from 'fs';
import { basename, extname } from 'path';
import { pipeline } from 'stream/promises';

const UPLOAD_MIME_MAP = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.wmv': 'video/x-ms-wmv',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
  '.html': 'text/html', '.xml': 'application/xml',
  '.zip': 'application/zip', '.gz': 'application/gzip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

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
      maxResults: z.coerce.number().optional().describe('Maximum number of results to return (default: 10)'),
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
          // Regular file - check if binary
          const binaryPrefixes = ['image/', 'audio/', 'video/', 'application/zip', 'application/gzip', 'application/octet-stream'];
          if (binaryPrefixes.some(p => mimeType.startsWith(p))) {
            return success(
              `File: ${meta.data.name} (${mimeType})\nThis is a binary file. Use drive_download_file to download it to a local path.`
            );
          }
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
      maxResults: z.coerce.number().optional().describe('Maximum number of results to return (default: 20)'),
    },
    async ({ folderId, maxResults }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const folder = folderId || 'root';
        const pageSize = maxResults || 20;

        const safeFolder = folder.replace(/'/g, "\\'");
        const res = await drive.files.list({
          q: `'${safeFolder}' in parents and trashed = false`,
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

  // 17. drive_upload_file - Upload a local file to Google Drive
  server.tool(
    'drive_upload_file',
    'Upload a local file (binary or text) to Google Drive. Supports any file type.',
    {
      localPath: z.string().describe('Absolute path to the local file to upload'),
      name: z.string().optional().describe('Name for the file in Drive (defaults to local filename)'),
      parentId: z.string().optional().describe('Parent folder ID (defaults to root)'),
      mimeType: z.string().optional().describe('MIME type (auto-detected from extension if omitted)'),
    },
    async ({ localPath, name, parentId, mimeType }) => {
      try {
        if (!existsSync(localPath)) {
          return error(new Error(`File not found: ${localPath}`));
        }
        const stats = statSync(localPath);
        if (!stats.isFile()) {
          return error(new Error(`Not a file: ${localPath}`));
        }

        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const fileName = name || basename(localPath);
        const ext = extname(localPath).toLowerCase();
        const resolvedMimeType = mimeType || UPLOAD_MIME_MAP[ext] || 'application/octet-stream';

        const res = await drive.files.create({
          requestBody: {
            name: fileName,
            parents: parentId ? [parentId] : undefined,
          },
          media: {
            mimeType: resolvedMimeType,
            body: createReadStream(localPath),
          },
          fields: 'id,name,mimeType,size,webViewLink',
        });

        const file = res.data;
        return success(
          `File uploaded successfully.\nName: ${file.name}\nID: ${file.id}\nType: ${file.mimeType}\nSize: ${file.size} bytes` +
            (file.webViewLink ? `\nLink: ${file.webViewLink}` : '')
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 18. drive_download_file - Download a Drive file to local path
  server.tool(
    'drive_download_file',
    'Download a file from Google Drive to a local path',
    {
      fileId: z.string().describe('The ID of the file to download'),
      localPath: z.string().describe('Absolute local path to save the file to'),
    },
    async ({ fileId, localPath }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });

        const meta = await drive.files.get({
          fileId,
          fields: 'id,name,mimeType,size',
        });

        const mimeType = meta.data.mimeType;
        const exportConfig = GOOGLE_MIME_EXPORTS[mimeType];

        if (exportConfig) {
          const res = await drive.files.export(
            { fileId, mimeType: exportConfig.mimeType },
            { responseType: 'stream' }
          );
          await pipeline(res.data, createWriteStream(localPath));
        } else {
          const res = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
          );
          await pipeline(res.data, createWriteStream(localPath));
        }

        return success(
          `File downloaded successfully.\nName: ${meta.data.name}\nSaved to: ${localPath}`
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 19. drive_get_comments - List comments on a file
  server.tool(
    'drive_get_comments',
    'List comments on a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      maxResults: z.coerce.number().optional().describe('Maximum comments to return (default: 20)'),
    },
    async ({ fileId, maxResults }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.comments.list({
          fileId,
          pageSize: maxResults || 20,
          fields: 'comments(id,content,author(displayName,emailAddress),createdTime,resolved)',
        });

        const comments = res.data.comments || [];
        if (comments.length === 0) {
          return success('No comments found on this file.');
        }

        const lines = [`Found ${comments.length} comment(s):\n`];
        for (const c of comments) {
          lines.push(`- [${c.id}] ${c.author?.displayName || 'Unknown'}: ${c.content}`);
          lines.push(`  Created: ${c.createdTime}${c.resolved ? ' (resolved)' : ''}`);
        }
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 20. drive_add_comment - Add a comment to a file
  server.tool(
    'drive_add_comment',
    'Add a comment to a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      content: z.string().describe('Comment text'),
    },
    async ({ fileId, content }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.comments.create({
          fileId,
          fields: 'id,content,author(displayName),createdTime',
          requestBody: { content },
        });

        const c = res.data;
        return success(
          `Comment added.\nID: ${c.id}\nBy: ${c.author?.displayName || 'You'}\nContent: ${c.content}\nCreated: ${c.createdTime}`
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 21. drive_export_file - Export Google Workspace file to different format
  server.tool(
    'drive_export_file',
    'Export a Google Workspace file (Doc, Sheet, Slides) to a different format (PDF, DOCX, CSV, PPTX, etc.)',
    {
      fileId: z.string().describe('The ID of the Google Workspace file to export'),
      mimeType: z.string().describe('Target MIME type: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/csv, application/vnd.openxmlformats-officedocument.presentationml.presentation, etc.'),
      localPath: z.string().describe('Absolute local path to save the exported file'),
    },
    async ({ fileId, mimeType, localPath }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.files.export(
          { fileId, mimeType },
          { responseType: 'stream' }
        );
        await pipeline(res.data, createWriteStream(localPath));

        const meta = await drive.files.get({ fileId, fields: 'name' });
        return success(
          `File exported successfully.\nSource: ${meta.data.name}\nFormat: ${mimeType}\nSaved to: ${localPath}`
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 22. drive_get_revisions - List revisions of a file
  server.tool(
    'drive_get_revisions',
    'List revisions of a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      maxResults: z.coerce.number().optional().describe('Maximum revisions to return (default: 20)'),
    },
    async ({ fileId, maxResults }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.revisions.list({
          fileId,
          pageSize: maxResults || 20,
          fields: 'revisions(id,modifiedTime,lastModifyingUser(displayName,emailAddress),size)',
        });

        const revisions = res.data.revisions || [];
        if (revisions.length === 0) {
          return success('No revisions found for this file.');
        }

        const lines = [`Found ${revisions.length} revision(s):\n`];
        for (const r of revisions) {
          const user = r.lastModifyingUser?.displayName || 'Unknown';
          lines.push(`- [${r.id}] Modified: ${r.modifiedTime} by ${user}${r.size ? ` (${r.size} bytes)` : ''}`);
        }
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 23. drive_empty_trash - Permanently empty all trash
  server.tool(
    'drive_empty_trash',
    'Permanently delete all files in Google Drive trash',
    {},
    async () => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        await drive.files.emptyTrash();
        return success('Trash emptied successfully. All trashed files permanently deleted.');
      } catch (e) {
        return error(e);
      }
    }
  );

  // 24. drive_get_changes_start_token - Get starting pageToken for listing future changes
  server.tool(
    'drive_get_changes_start_token',
    'Get the starting pageToken for listing future changes in Google Drive',
    {},
    async () => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.changes.getStartPageToken();
        return success(`Start page token: ${res.data.startPageToken}`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 25. drive_list_changes - List changes to files
  server.tool(
    'drive_list_changes',
    'List changes to files in Google Drive since a given page token',
    {
      pageToken: z.string().describe('The token for continuing a previous list request from getStartPageToken or a previous list response'),
      pageSize: z.coerce.number().optional().describe('Maximum number of changes to return (default: 100)'),
      spaces: z.string().optional().describe("Comma-separated list of spaces to query (e.g. 'drive', 'appDataFolder')"),
      includeRemoved: z.boolean().optional().describe('Whether to include changes indicating items removed from the list (default: true)'),
      restrictToMyDrive: z.boolean().optional().describe('Whether to restrict results to changes within My Drive (default: false)'),
    },
    async ({ pageToken, pageSize, spaces, includeRemoved, restrictToMyDrive }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const params = {
          pageToken,
          pageSize: pageSize || 100,
          fields: 'nextPageToken,newStartPageToken,changes(changeType,time,removed,fileId,file(id,name,mimeType,trashed))',
        };
        if (spaces) params.spaces = spaces;
        if (includeRemoved !== undefined) params.includeRemoved = includeRemoved;
        if (restrictToMyDrive !== undefined) params.restrictToMyDrive = restrictToMyDrive;

        const res = await drive.changes.list(params);
        const changes = res.data.changes || [];
        const lines = [`Found ${changes.length} change(s):\n`];
        for (const c of changes) {
          const file = c.file;
          if (c.removed) {
            lines.push(`- [REMOVED] File ID: ${c.fileId} at ${c.time}`);
          } else if (file) {
            lines.push(`- [${c.changeType || 'file'}] ${file.name} (${file.id}) at ${c.time}${file.trashed ? ' [trashed]' : ''}`);
          } else {
            lines.push(`- [${c.changeType || 'unknown'}] File ID: ${c.fileId} at ${c.time}`);
          }
        }
        if (res.data.newStartPageToken) {
          lines.push(`\nNew start page token: ${res.data.newStartPageToken}`);
        }
        if (res.data.nextPageToken) {
          lines.push(`\nNext page token: ${res.data.nextPageToken}`);
        }
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 26. drive_watch_changes - Subscribe to changes
  server.tool(
    'drive_watch_changes',
    'Subscribe to changes in Google Drive via push notifications',
    {
      pageToken: z.string().describe('The token for starting the watch from getStartPageToken'),
      channelId: z.string().describe('A unique string ID for the channel'),
      channelType: z.string().optional().describe("The type of delivery mechanism (default: 'web_hook')"),
      channelAddress: z.string().describe('The URL that receives notifications'),
      channelExpiration: z.string().optional().describe('Channel expiration time as Unix timestamp in milliseconds'),
    },
    async ({ pageToken, channelId, channelType, channelAddress, channelExpiration }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const requestBody = {
          id: channelId,
          type: channelType || 'web_hook',
          address: channelAddress,
        };
        if (channelExpiration) requestBody.expiration = channelExpiration;

        const res = await drive.changes.watch({
          pageToken,
          requestBody,
        });

        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 27. drive_stop_channel - Stop watching resources
  server.tool(
    'drive_stop_channel',
    'Stop receiving push notifications for a channel',
    {
      channelId: z.string().describe('The ID of the channel to stop'),
      resourceId: z.string().describe('The opaque resource ID of the watched resource'),
    },
    async ({ channelId, resourceId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        await drive.channels.stop({
          requestBody: {
            id: channelId,
            resourceId,
          },
        });
        return success(`Channel ${channelId} stopped successfully.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 28. drive_get_comment - Get a comment by ID
  server.tool(
    'drive_get_comment',
    'Get a specific comment on a Google Drive file by ID',
    {
      fileId: z.string().describe('The ID of the file'),
      commentId: z.string().describe('The ID of the comment'),
    },
    async ({ fileId, commentId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.comments.get({
          fileId,
          commentId,
          fields: 'id,content,author(displayName,emailAddress),createdTime,modifiedTime,resolved,quotedFileContent',
        });

        const c = res.data;
        const lines = [
          `Comment ID: ${c.id}`,
          `Author: ${c.author?.displayName || 'Unknown'} <${c.author?.emailAddress || ''}>`,
          `Content: ${c.content}`,
          `Created: ${c.createdTime}`,
          `Modified: ${c.modifiedTime}`,
          `Resolved: ${c.resolved || false}`,
        ];
        if (c.quotedFileContent) {
          lines.push(`Quoted content: ${c.quotedFileContent.value}`);
        }
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 29. drive_update_comment - Update a comment's content
  server.tool(
    'drive_update_comment',
    'Update the content of a comment on a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      commentId: z.string().describe('The ID of the comment to update'),
      content: z.string().describe('New comment text'),
    },
    async ({ fileId, commentId, content }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.comments.update({
          fileId,
          commentId,
          requestBody: { content },
          fields: 'id,content,modifiedTime',
        });

        const c = res.data;
        return success(`Comment updated.\nID: ${c.id}\nContent: ${c.content}\nModified: ${c.modifiedTime}`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 30. drive_delete_comment - Delete a comment
  server.tool(
    'drive_delete_comment',
    'Delete a comment from a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      commentId: z.string().describe('The ID of the comment to delete'),
    },
    async ({ fileId, commentId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        await drive.comments.delete({ fileId, commentId });
        return success(`Comment ${commentId} deleted from file ${fileId}.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 31. drive_list_replies - List replies to a comment
  server.tool(
    'drive_list_replies',
    'List replies to a comment on a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      commentId: z.string().describe('The ID of the comment'),
      pageSize: z.coerce.number().optional().describe('Maximum replies to return (default: 20)'),
    },
    async ({ fileId, commentId, pageSize }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.replies.list({
          fileId,
          commentId,
          pageSize: pageSize || 20,
          fields: 'replies(id,content,author(displayName,emailAddress),createdTime,modifiedTime)',
        });

        const replies = res.data.replies || [];
        if (replies.length === 0) {
          return success('No replies found for this comment.');
        }

        const lines = [`Found ${replies.length} reply/replies:\n`];
        for (const r of replies) {
          lines.push(`- [${r.id}] ${r.author?.displayName || 'Unknown'}: ${r.content}`);
          lines.push(`  Created: ${r.createdTime}`);
        }
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 32. drive_get_reply - Get a reply by ID
  server.tool(
    'drive_get_reply',
    'Get a specific reply to a comment on a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      commentId: z.string().describe('The ID of the comment'),
      replyId: z.string().describe('The ID of the reply'),
    },
    async ({ fileId, commentId, replyId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.replies.get({
          fileId,
          commentId,
          replyId,
          fields: 'id,content,author(displayName,emailAddress),createdTime,modifiedTime',
        });

        const r = res.data;
        const lines = [
          `Reply ID: ${r.id}`,
          `Author: ${r.author?.displayName || 'Unknown'} <${r.author?.emailAddress || ''}>`,
          `Content: ${r.content}`,
          `Created: ${r.createdTime}`,
          `Modified: ${r.modifiedTime}`,
        ];
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 33. drive_create_reply - Create a reply to a comment
  server.tool(
    'drive_create_reply',
    'Create a reply to a comment on a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      commentId: z.string().describe('The ID of the comment to reply to'),
      content: z.string().describe('Reply text'),
    },
    async ({ fileId, commentId, content }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.replies.create({
          fileId,
          commentId,
          requestBody: { content },
          fields: 'id,content,author(displayName),createdTime',
        });

        const r = res.data;
        return success(
          `Reply added.\nID: ${r.id}\nBy: ${r.author?.displayName || 'You'}\nContent: ${r.content}\nCreated: ${r.createdTime}`
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 34. drive_update_reply - Update a reply
  server.tool(
    'drive_update_reply',
    'Update a reply to a comment on a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      commentId: z.string().describe('The ID of the comment'),
      replyId: z.string().describe('The ID of the reply to update'),
      content: z.string().describe('New reply text'),
    },
    async ({ fileId, commentId, replyId, content }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.replies.update({
          fileId,
          commentId,
          replyId,
          requestBody: { content },
          fields: 'id,content,modifiedTime',
        });

        const r = res.data;
        return success(`Reply updated.\nID: ${r.id}\nContent: ${r.content}\nModified: ${r.modifiedTime}`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 35. drive_delete_reply - Delete a reply
  server.tool(
    'drive_delete_reply',
    'Delete a reply to a comment on a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      commentId: z.string().describe('The ID of the comment'),
      replyId: z.string().describe('The ID of the reply to delete'),
    },
    async ({ fileId, commentId, replyId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        await drive.replies.delete({ fileId, commentId, replyId });
        return success(`Reply ${replyId} deleted from comment ${commentId}.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 36. drive_create_shared_drive - Create a shared drive
  server.tool(
    'drive_create_shared_drive',
    'Create a new shared drive in Google Drive',
    {
      name: z.string().describe('Name of the shared drive to create'),
      requestId: z.string().describe('An ID (such as a random UUID) used to identify this request as idempotent'),
    },
    async ({ name, requestId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.drives.create({
          requestId,
          requestBody: { name },
          fields: 'id,name,createdTime',
        });

        const d = res.data;
        return success(`Shared drive created.\nName: ${d.name}\nID: ${d.id}\nCreated: ${d.createdTime}`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 37. drive_get_shared_drive - Get shared drive metadata
  server.tool(
    'drive_get_shared_drive',
    'Get metadata of a shared drive in Google Drive',
    {
      driveId: z.string().describe('The ID of the shared drive'),
    },
    async ({ driveId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.drives.get({
          driveId,
          fields: 'id,name,createdTime,hidden,restrictions,capabilities',
        });

        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 38. drive_list_shared_drives - List shared drives
  server.tool(
    'drive_list_shared_drives',
    'List shared drives the user has access to',
    {
      pageSize: z.coerce.number().optional().describe('Maximum shared drives to return (default: 10)'),
      pageToken: z.string().optional().describe('Page token for continuing a previous list request'),
    },
    async ({ pageSize, pageToken }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const params = {
          pageSize: pageSize || 10,
          fields: 'nextPageToken,drives(id,name,createdTime,hidden)',
        };
        if (pageToken) params.pageToken = pageToken;

        const res = await drive.drives.list(params);
        const drives = res.data.drives || [];
        if (drives.length === 0) {
          return success('No shared drives found.');
        }

        const lines = [`Found ${drives.length} shared drive(s):\n`];
        for (const d of drives) {
          lines.push(`- ${d.name} (ID: ${d.id})${d.hidden ? ' [hidden]' : ''}`);
          if (d.createdTime) lines.push(`  Created: ${d.createdTime}`);
        }
        if (res.data.nextPageToken) {
          lines.push(`\nNext page token: ${res.data.nextPageToken}`);
        }
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 39. drive_update_shared_drive - Update shared drive metadata
  server.tool(
    'drive_update_shared_drive',
    'Update metadata of a shared drive (name, restrictions, etc.)',
    {
      driveId: z.string().describe('The ID of the shared drive to update'),
      name: z.string().optional().describe('New name for the shared drive'),
      restrictions: z.string().optional().describe('JSON string of restrictions to update (e.g. {"adminManagedRestrictions":true})'),
    },
    async ({ driveId, name, restrictions }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const requestBody = {};
        if (name) requestBody.name = name;
        if (restrictions) {
          Object.assign(requestBody, { restrictions: JSON.parse(restrictions) });
        }

        const res = await drive.drives.update({
          driveId,
          requestBody,
          fields: 'id,name,restrictions',
        });

        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 40. drive_delete_shared_drive - Delete a shared drive
  server.tool(
    'drive_delete_shared_drive',
    'Delete a shared drive (must be empty)',
    {
      driveId: z.string().describe('The ID of the shared drive to delete'),
    },
    async ({ driveId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        await drive.drives.delete({ driveId });
        return success(`Shared drive ${driveId} deleted successfully.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 41. drive_hide_shared_drive - Hide shared drive from default view
  server.tool(
    'drive_hide_shared_drive',
    'Hide a shared drive from the default view',
    {
      driveId: z.string().describe('The ID of the shared drive to hide'),
    },
    async ({ driveId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.drives.hide({ driveId });
        return success(`Shared drive '${res.data.name || driveId}' is now hidden.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 42. drive_unhide_shared_drive - Restore shared drive to default view
  server.tool(
    'drive_unhide_shared_drive',
    'Restore a shared drive to the default view',
    {
      driveId: z.string().describe('The ID of the shared drive to unhide'),
    },
    async ({ driveId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.drives.unhide({ driveId });
        return success(`Shared drive '${res.data.name || driveId}' is now visible.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 43. drive_get_permission - Get a permission by ID
  server.tool(
    'drive_get_permission',
    'Get a specific permission on a Google Drive file by permission ID',
    {
      fileId: z.string().describe('The ID of the file'),
      permissionId: z.string().describe('The ID of the permission'),
    },
    async ({ fileId, permissionId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.permissions.get({
          fileId,
          permissionId,
          fields: 'id,role,type,emailAddress,displayName,domain,expirationTime,pendingOwner',
        });

        const p = res.data;
        const lines = [
          `Permission ID: ${p.id}`,
          `Role: ${p.role}`,
          `Type: ${p.type}`,
        ];
        if (p.emailAddress) lines.push(`Email: ${p.emailAddress}`);
        if (p.displayName) lines.push(`Name: ${p.displayName}`);
        if (p.domain) lines.push(`Domain: ${p.domain}`);
        if (p.expirationTime) lines.push(`Expires: ${p.expirationTime}`);
        if (p.pendingOwner) lines.push(`Pending owner: ${p.pendingOwner}`);
        return success(lines.join('\n'));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 44. drive_update_permission - Update a permission's role
  server.tool(
    'drive_update_permission',
    'Update a permission on a Google Drive file (change role)',
    {
      fileId: z.string().describe('The ID of the file'),
      permissionId: z.string().describe('The ID of the permission to update'),
      role: z.string().describe('New role: owner, organizer, fileOrganizer, writer, commenter, reader'),
    },
    async ({ fileId, permissionId, role }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.permissions.update({
          fileId,
          permissionId,
          requestBody: { role },
          fields: 'id,role,type,emailAddress',
        });

        const p = res.data;
        return success(
          `Permission updated.\nID: ${p.id}\nRole: ${p.role}\nType: ${p.type}` +
            (p.emailAddress ? `\nEmail: ${p.emailAddress}` : '')
        );
      } catch (e) {
        return error(e);
      }
    }
  );

  // 45. drive_get_revision - Get a specific revision
  server.tool(
    'drive_get_revision',
    'Get metadata of a specific revision of a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      revisionId: z.string().describe('The ID of the revision'),
    },
    async ({ fileId, revisionId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.revisions.get({
          fileId,
          revisionId,
          fields: 'id,mimeType,modifiedTime,keepForever,published,publishAuto,publishedOutsideDomain,lastModifyingUser(displayName,emailAddress),size,originalFilename',
        });

        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 46. drive_update_revision - Update revision metadata
  server.tool(
    'drive_update_revision',
    'Update metadata of a revision (published, publishAuto, publishedOutsideDomain, keepForever)',
    {
      fileId: z.string().describe('The ID of the file'),
      revisionId: z.string().describe('The ID of the revision to update'),
      published: z.boolean().optional().describe('Whether this revision is published'),
      publishAuto: z.boolean().optional().describe('Whether subsequent revisions will be automatically republished'),
      publishedOutsideDomain: z.boolean().optional().describe('Whether this revision is published outside the domain'),
      keepForever: z.boolean().optional().describe('Whether to keep this revision forever, even if it is no longer the head revision'),
    },
    async ({ fileId, revisionId, published, publishAuto, publishedOutsideDomain, keepForever }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const requestBody = {};
        if (published !== undefined) requestBody.published = published;
        if (publishAuto !== undefined) requestBody.publishAuto = publishAuto;
        if (publishedOutsideDomain !== undefined) requestBody.publishedOutsideDomain = publishedOutsideDomain;
        if (keepForever !== undefined) requestBody.keepForever = keepForever;

        const res = await drive.revisions.update({
          fileId,
          revisionId,
          requestBody,
          fields: 'id,modifiedTime,keepForever,published,publishAuto,publishedOutsideDomain',
        });

        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 47. drive_delete_revision - Delete a revision
  server.tool(
    'drive_delete_revision',
    'Delete a revision of a Google Drive file (cannot delete the last remaining revision)',
    {
      fileId: z.string().describe('The ID of the file'),
      revisionId: z.string().describe('The ID of the revision to delete'),
    },
    async ({ fileId, revisionId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        await drive.revisions.delete({ fileId, revisionId });
        return success(`Revision ${revisionId} deleted from file ${fileId}.`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 48. drive_generate_ids - Generate file IDs for use in create/copy
  server.tool(
    'drive_generate_ids',
    'Generate a set of file IDs that can be used in create or copy requests',
    {
      count: z.coerce.number().optional().describe('Number of IDs to generate (default: 10, max: 1000)'),
      space: z.string().optional().describe("The space in which the IDs can be used: 'drive' or 'appDataFolder' (default: 'drive')"),
      type: z.string().optional().describe("The type of items for which the IDs can be used: 'files' or 'shortcuts' (default: 'files')"),
    },
    async ({ count, space, type }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const params = {
          count: count || 10,
        };
        if (space) params.space = space;
        if (type) params.type = type;

        const res = await drive.files.generateIds(params);
        const ids = res.data.ids || [];
        return success(`Generated ${ids.length} file ID(s):\n${ids.join('\n')}`);
      } catch (e) {
        return error(e);
      }
    }
  );

  // 49. drive_list_labels - List labels on a file
  server.tool(
    'drive_list_labels',
    'List labels applied to a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      maxResults: z.coerce.number().optional().describe('Maximum labels to return (default: 20)'),
      pageToken: z.string().optional().describe('Page token for continuing a previous list request'),
    },
    async ({ fileId, maxResults, pageToken }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const params = {
          fileId,
          maxResults: maxResults || 20,
        };
        if (pageToken) params.pageToken = pageToken;

        const res = await drive.files.listLabels(params);
        const labels = res.data.labels || [];
        if (labels.length === 0) {
          return success('No labels found on this file.');
        }

        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 50. drive_modify_labels - Modify labels on a file
  server.tool(
    'drive_modify_labels',
    'Modify (add, update, remove) labels on a Google Drive file',
    {
      fileId: z.string().describe('The ID of the file'),
      requests: z.string().describe('JSON string of label modification requests array (see Drive API modifyLabels documentation)'),
    },
    async ({ fileId, requests }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const labelModifications = JSON.parse(requests);

        const res = await drive.files.modifyLabels({
          fileId,
          requestBody: {
            labelModifications,
          },
        });

        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  // 51. drive_watch_file - Subscribe to changes on a file
  server.tool(
    'drive_watch_file',
    'Subscribe to push notifications for changes to a specific Google Drive file',
    {
      fileId: z.string().describe('The ID of the file to watch'),
      channelId: z.string().describe('A unique string ID for the channel'),
      channelType: z.string().optional().describe("The type of delivery mechanism (default: 'web_hook')"),
      channelAddress: z.string().describe('The URL that receives notifications'),
      channelExpiration: z.string().optional().describe('Channel expiration time as Unix timestamp in milliseconds'),
    },
    async ({ fileId, channelId, channelType, channelAddress, channelExpiration }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const requestBody = {
          id: channelId,
          type: channelType || 'web_hook',
          address: channelAddress,
        };
        if (channelExpiration) requestBody.expiration = channelExpiration;

        const res = await drive.files.watch({
          fileId,
          requestBody,
        });

        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  // ── Access Proposals ──────────────────────────────────────────────

  server.tool(
    'drive_list_access_proposals',
    'List access proposals on a file (requests for access)',
    {
      fileId: z.string().describe('The file ID'),
      pageToken: z.string().optional().describe('Page token for pagination'),
      pageSize: z.coerce.number().optional().describe('Max results (default 10)'),
    },
    async ({ fileId, pageToken, pageSize }) => {
      try {
        const auth = getAuth();
        const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/accessproposals`;
        const params = { pageSize: pageSize || 10 };
        if (pageToken) params.pageToken = pageToken;
        const res = await auth.request({ url, method: 'GET', params });
        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  server.tool(
    'drive_get_access_proposal',
    'Get a specific access proposal by ID',
    {
      fileId: z.string().describe('The file ID'),
      proposalId: z.string().describe('The access proposal ID'),
    },
    async ({ fileId, proposalId }) => {
      try {
        const auth = getAuth();
        const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/accessproposals/${encodeURIComponent(proposalId)}`;
        const res = await auth.request({ url, method: 'GET' });
        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  server.tool(
    'drive_resolve_access_proposal',
    'Approve or deny an access proposal on a file',
    {
      fileId: z.string().describe('The file ID'),
      proposalId: z.string().describe('The access proposal ID'),
      action: z.enum(['ACCEPT', 'DENY']).describe('Whether to accept or deny the proposal'),
      role: z.string().optional().describe('Permission role if accepting (reader, writer, commenter)'),
      sendNotification: z.boolean().optional().describe('Send notification email (default true)'),
    },
    async ({ fileId, proposalId, action, role, sendNotification }) => {
      try {
        const auth = getAuth();
        const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/accessproposals/${encodeURIComponent(proposalId)}:resolve`;
        const data = { action };
        if (role) data.role = role;
        if (sendNotification !== undefined) data.sendNotification = sendNotification;
        await auth.request({ url, method: 'POST', data });
        return success(JSON.stringify({ success: true, action, proposalId }, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  // ── Apps ──────────────────────────────────────────────────────────

  server.tool(
    'drive_list_apps',
    'List the user\'s installed Google Drive apps',
    {},
    async () => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.apps.list();
        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  server.tool(
    'drive_get_app',
    'Get a specific installed Drive app by ID',
    {
      appId: z.string().describe('The app ID'),
    },
    async ({ appId }) => {
      try {
        const drive = google.drive({ version: 'v3', auth: getAuth() });
        const res = await drive.apps.get({ appId });
        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );

  // ── Operations ────────────────────────────────────────────────────

  server.tool(
    'drive_get_operation',
    'Get the status of a long-running operation',
    {
      operationName: z.string().describe('The operation name (from a long-running operation response)'),
    },
    async ({ operationName }) => {
      try {
        const auth = getAuth();
        const url = `https://www.googleapis.com/drive/v3/operations/${encodeURIComponent(operationName)}`;
        const res = await auth.request({ url, method: 'GET' });
        return success(JSON.stringify(res.data, null, 2));
      } catch (e) {
        return error(e);
      }
    }
  );
}
