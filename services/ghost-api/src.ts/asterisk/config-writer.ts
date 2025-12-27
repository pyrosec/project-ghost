import fs from 'fs/promises';
import { logger } from '../logger';
import { parsePjsipConf, findExtensionInPjsip } from './config-parser';
import { config } from '../config';

export interface NewExtensionConfig {
  extension: string;
  password: string;
  callerid: string;
  context?: string;
  mailbox?: string;
}

export interface VoicemailConfig {
  extension: string;
  password: string;
  name: string;
  email?: string;
}

/**
 * Generate PJSIP configuration sections for a new extension
 */
export function generatePjsipSections(ext: NewExtensionConfig): string {
  const context = ext.context || 'from-internal';

  return `
; Extension ${ext.extension}
[${ext.extension}](endpoint-internal)
callerid=${ext.callerid}
auth=${ext.extension}
aors=${ext.extension}
context=${context}
${ext.mailbox ? `mailboxes=${ext.mailbox}@default` : ''}

[${ext.extension}](auth-userpass)
username=${ext.extension}
password=${ext.password}

[${ext.extension}](aor-single)
mailboxes=${ext.extension}@default

`;
}

/**
 * Append a new extension to pjsip.conf
 */
export async function appendExtensionToPjsip(ext: NewExtensionConfig): Promise<void> {
  const filePath = config.pjsipConf;

  // Read current content
  const content = await fs.readFile(filePath, 'utf-8');

  // Check if extension already exists
  const parsed = await parsePjsipConf(filePath);
  if (parsed.sections.has(ext.extension)) {
    throw new Error(`Extension ${ext.extension} already exists in pjsip.conf`);
  }

  // Generate new sections
  const newSections = generatePjsipSections(ext);

  // Append to file
  await fs.writeFile(filePath, content + newSections, 'utf-8');

  logger.info('Extension added to pjsip.conf', { extension: ext.extension });
}

/**
 * Update an extension's password in pjsip.conf
 */
export async function updateExtensionPassword(
  extension: string,
  newPassword: string
): Promise<void> {
  const filePath = config.pjsipConf;
  let content = await fs.readFile(filePath, 'utf-8');

  // Find the auth section for this extension
  const authPattern = new RegExp(
    `(\\[${extension}\\]\\([^)]*auth[^)]*\\)[\\s\\S]*?password=)[^\\n]*`,
    'm'
  );

  const match = content.match(authPattern);
  if (!match) {
    throw new Error(`Auth section for extension ${extension} not found`);
  }

  content = content.replace(authPattern, `$1${newPassword}`);

  await fs.writeFile(filePath, content, 'utf-8');
  logger.info('Extension password updated in pjsip.conf', { extension });
}

/**
 * Update an extension's callerid in pjsip.conf
 */
export async function updateExtensionCallerid(
  extension: string,
  callerid: string
): Promise<void> {
  const filePath = config.pjsipConf;
  let content = await fs.readFile(filePath, 'utf-8');

  // Find the endpoint section for this extension
  const endpointPattern = new RegExp(
    `(\\[${extension}\\]\\([^)]*endpoint[^)]*\\)[\\s\\S]*?callerid=)[^\\n]*`,
    'm'
  );

  const match = content.match(endpointPattern);
  if (!match) {
    throw new Error(`Endpoint section for extension ${extension} not found`);
  }

  content = content.replace(endpointPattern, `$1${callerid}`);

  await fs.writeFile(filePath, content, 'utf-8');
  logger.info('Extension callerid updated in pjsip.conf', { extension });
}

/**
 * Remove an extension from pjsip.conf
 */
export async function removeExtensionFromPjsip(extension: string): Promise<void> {
  const filePath = config.pjsipConf;
  let content = await fs.readFile(filePath, 'utf-8');

  const locations = findExtensionInPjsip(content, extension);

  if (!locations.endpoint && !locations.auth && !locations.aor) {
    logger.warn('Extension not found in pjsip.conf', { extension });
    return;
  }

  // Remove sections in reverse order to preserve indices
  const sections = [locations.endpoint, locations.auth, locations.aor]
    .filter(Boolean)
    .sort((a, b) => b!.start - a!.start);

  for (const section of sections) {
    if (section) {
      // Also remove the comment line above if it matches "; Extension <ext>"
      let start = section.start;
      const beforeContent = content.substring(0, start);
      const commentMatch = beforeContent.match(/; Extension [^\n]*\n$/);
      if (commentMatch) {
        start -= commentMatch[0].length;
      }

      content = content.substring(0, start) + content.substring(section.end);
    }
  }

  await fs.writeFile(filePath, content, 'utf-8');
  logger.info('Extension removed from pjsip.conf', { extension });
}

/**
 * Add voicemail entry for an extension
 */
export async function addVoicemailEntry(vm: VoicemailConfig): Promise<void> {
  const filePath = config.voicemailConf;

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    // Create new voicemail.conf if it doesn't exist
    content = `[default]\n`;
  }

  // Check if extension already exists
  const extPattern = new RegExp(`^${vm.extension}\\s*=>`, 'm');
  if (extPattern.test(content)) {
    throw new Error(`Voicemail entry for ${vm.extension} already exists`);
  }

  // Find [default] context and append entry
  const defaultMatch = content.match(/\[default\]\s*\n/);
  if (!defaultMatch) {
    content += `[default]\n`;
  }

  const vmLine = vm.email
    ? `${vm.extension} => ${vm.password},${vm.name},${vm.email}\n`
    : `${vm.extension} => ${vm.password},${vm.name}\n`;

  // Insert after [default]
  content = content.replace(
    /(\[default\]\s*\n)/,
    `$1${vmLine}`
  );

  await fs.writeFile(filePath, content, 'utf-8');
  logger.info('Voicemail entry added', { extension: vm.extension });
}

/**
 * Remove voicemail entry for an extension
 */
export async function removeVoicemailEntry(extension: string): Promise<void> {
  const filePath = config.voicemailConf;

  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    logger.warn('voicemail.conf not found, nothing to remove');
    return;
  }

  // Remove the extension line
  const extPattern = new RegExp(`^${extension}\\s*=>[^\\n]*\\n`, 'm');
  content = content.replace(extPattern, '');

  await fs.writeFile(filePath, content, 'utf-8');
  logger.info('Voicemail entry removed', { extension });
}

/**
 * Get extension password from pjsip.conf (for migration)
 */
export async function getExtensionPasswordFromPjsip(extension: string): Promise<string | null> {
  const filePath = config.pjsipConf;
  const content = await fs.readFile(filePath, 'utf-8');

  // Find the auth section for this extension and extract password
  // Note: pjsip.conf uses "password = value" with spaces around the equals sign
  const authPattern = new RegExp(
    `\\[${extension}\\]\\([^)]*auth[^)]*\\)[\\s\\S]*?password\\s*=\\s*([^\\n]+)`,
    'm'
  );

  const match = content.match(authPattern);
  return match ? match[1].trim() : null;
}
