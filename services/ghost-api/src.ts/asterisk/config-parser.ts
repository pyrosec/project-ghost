import fs from 'fs/promises';
import { logger } from '../logger';

export interface PjsipEndpoint {
  name: string;
  template?: string;
  auth?: string;
  aors?: string;
  callerid?: string;
  context?: string;
  [key: string]: string | undefined;
}

export interface PjsipAuth {
  name: string;
  template?: string;
  password?: string;
  username?: string;
  auth_type?: string;
  [key: string]: string | undefined;
}

export interface PjsipAor {
  name: string;
  template?: string;
  max_contacts?: string;
  mailboxes?: string;
  [key: string]: string | undefined;
}

export interface PjsipExtension {
  name: string;
  endpoint: PjsipEndpoint;
  auth: PjsipAuth;
  aor: PjsipAor;
}

export interface ParsedPjsipConf {
  raw: string;
  sections: Map<string, { type: string; properties: Map<string, string> }>;
  extensions: Map<string, PjsipExtension>;
}

export async function parsePjsipConf(filePath: string): Promise<ParsedPjsipConf> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  const sections = new Map<string, { type: string; properties: Map<string, string> }>();
  let currentSection: string | null = null;
  let currentProperties = new Map<string, string>();
  let currentType = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith(';')) continue;

    // Section header: [name](template) or [name]
    const sectionMatch = trimmed.match(/^\[([^\]]+)\](?:\(([^)]+)\))?$/);
    if (sectionMatch) {
      // Save previous section
      if (currentSection) {
        sections.set(currentSection, { type: currentType, properties: currentProperties });
      }

      currentSection = sectionMatch[1];
      const template = sectionMatch[2];
      currentProperties = new Map();
      if (template) {
        currentProperties.set('_template', template);
      }
      continue;
    }

    // Property: key = value
    const propMatch = trimmed.match(/^(\w+)\s*=\s*(.*)$/);
    if (propMatch && currentSection) {
      const [, key, value] = propMatch;
      currentProperties.set(key, value.trim());

      // Track section type
      if (key === 'type') {
        currentType = value.trim();
      }
    }
  }

  // Save last section
  if (currentSection) {
    sections.set(currentSection, { type: currentType, properties: currentProperties });
  }

  // Extract extensions (sections that are endpoints, auth, and aor for the same name)
  const extensions = new Map<string, PjsipExtension>();

  for (const [name, section] of sections) {
    // Skip template sections (they end with !)
    if (name.endsWith('!') || name.endsWith('!)')) continue;

    // Check if this is an endpoint
    if (section.type === 'endpoint' || section.properties.get('_template')?.includes('endpoint')) {
      // Look for matching auth and aor
      const authSection = sections.get(name);
      const aorSection = sections.get(name);

      // Get the actual auth/aor sections (they might use different templates)
      let auth: PjsipAuth | undefined;
      let aor: PjsipAor | undefined;

      for (const [sectionName, sec] of sections) {
        if (sectionName === name) {
          if (sec.type === 'auth' || sec.properties.get('_template')?.includes('auth')) {
            auth = {
              name: sectionName,
              template: sec.properties.get('_template'),
              password: sec.properties.get('password'),
              username: sec.properties.get('username'),
              auth_type: sec.properties.get('auth_type'),
            };
          }
          if (sec.type === 'aor' || sec.properties.get('_template')?.includes('aor')) {
            aor = {
              name: sectionName,
              template: sec.properties.get('_template'),
              max_contacts: sec.properties.get('max_contacts'),
              mailboxes: sec.properties.get('mailboxes'),
            };
          }
        }
      }

      // Only add if we have all three components
      if (section.properties.get('auth') && section.properties.get('aors')) {
        extensions.set(name, {
          name,
          endpoint: {
            name,
            template: section.properties.get('_template'),
            auth: section.properties.get('auth'),
            aors: section.properties.get('aors'),
            callerid: section.properties.get('callerid'),
            context: section.properties.get('context'),
          },
          auth: auth || { name, password: '', username: '' },
          aor: aor || { name, mailboxes: '' },
        });
      }
    }
  }

  return { raw: content, sections, extensions };
}

export function findExtensionInPjsip(content: string, extension: string): {
  endpoint?: { start: number; end: number; content: string };
  auth?: { start: number; end: number; content: string };
  aor?: { start: number; end: number; content: string };
} {
  const result: ReturnType<typeof findExtensionInPjsip> = {};

  // Find each section for this extension
  const patterns = [
    { type: 'endpoint', regex: new RegExp(`^\\[${extension}\\]\\([^)]*endpoint[^)]*\\)[\\s\\S]*?(?=^\\[|$)`, 'gm') },
    { type: 'auth', regex: new RegExp(`^\\[${extension}\\]\\([^)]*auth[^)]*\\)[\\s\\S]*?(?=^\\[|$)`, 'gm') },
    { type: 'aor', regex: new RegExp(`^\\[${extension}\\]\\([^)]*aor[^)]*\\)[\\s\\S]*?(?=^\\[|$)`, 'gm') },
  ];

  for (const { type, regex } of patterns) {
    const match = regex.exec(content);
    if (match) {
      result[type as keyof typeof result] = {
        start: match.index,
        end: match.index + match[0].length,
        content: match[0],
      };
    }
  }

  return result;
}
