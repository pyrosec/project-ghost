import AsteriskManager from 'asterisk-manager';
import { config } from '../config';
import { logger } from '../logger';

let ami: AsteriskManager | null = null;
let connected = false;
let reconnecting = false;

/**
 * Initialize AMI connection
 */
export function initializeAmi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ami && connected) {
      resolve();
      return;
    }

    ami = new AsteriskManager(
      config.ami.port,
      config.ami.host,
      config.ami.username,
      config.ami.password,
      true // Events on
    );

    ami.keepConnected();

    ami.on('connect', () => {
      connected = true;
      reconnecting = false;
      logger.info('AMI connected', { host: config.ami.host, port: config.ami.port });
      resolve();
    });

    ami.on('error', (err: Error) => {
      logger.error('AMI error', err);
      connected = false;
      if (!reconnecting) {
        reject(err);
      }
    });

    ami.on('disconnect', () => {
      logger.warn('AMI disconnected');
      connected = false;
      reconnecting = true;
    });

    // Timeout for initial connection
    setTimeout(() => {
      if (!connected) {
        reject(new Error('AMI connection timeout'));
      }
    }, 10000);
  });
}

/**
 * Execute an AMI action
 */
export function amiAction(action: Record<string, string>): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    if (!ami || !connected) {
      reject(new Error('AMI not connected'));
      return;
    }

    ami.action(action, (err: Error | null, res: Record<string, any>) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}

/**
 * Reload PJSIP module
 */
export async function reloadPjsip(): Promise<void> {
  try {
    const result = await amiAction({
      action: 'Command',
      command: 'pjsip reload',
    });
    logger.info('PJSIP reload triggered', { result: result.content || result });
  } catch (error) {
    logger.error('Failed to reload PJSIP', error);
    throw new Error('Failed to reload PJSIP configuration');
  }
}

/**
 * Reload voicemail module
 */
export async function reloadVoicemail(): Promise<void> {
  try {
    const result = await amiAction({
      action: 'Command',
      command: 'voicemail reload',
    });
    logger.info('Voicemail reload triggered', { result: result.content || result });
  } catch (error) {
    logger.error('Failed to reload voicemail', error);
    throw new Error('Failed to reload voicemail configuration');
  }
}

/**
 * Reload dialplan
 */
export async function reloadDialplan(): Promise<void> {
  try {
    const result = await amiAction({
      action: 'Command',
      command: 'dialplan reload',
    });
    logger.info('Dialplan reload triggered', { result: result.content || result });
  } catch (error) {
    logger.error('Failed to reload dialplan', error);
    throw new Error('Failed to reload dialplan');
  }
}

/**
 * Get PJSIP endpoint status
 */
export async function getPjsipEndpointStatus(extension: string): Promise<{
  state: string;
  contacts: Array<{ uri: string; status: string }>;
}> {
  try {
    const result = await amiAction({
      action: 'PJSIPShowEndpoint',
      endpoint: extension,
    });

    // Parse the result
    const state = result.endpoint_state || 'Unknown';
    const contacts: Array<{ uri: string; status: string }> = [];

    // Handle contact info from response
    if (result.contacts) {
      const contactList = Array.isArray(result.contacts) ? result.contacts : [result.contacts];
      for (const contact of contactList) {
        contacts.push({
          uri: contact.uri || contact,
          status: contact.status || 'Unknown',
        });
      }
    }

    return { state, contacts };
  } catch (error) {
    logger.warn('Failed to get endpoint status', { extension, error });
    return { state: 'Unknown', contacts: [] };
  }
}

/**
 * Get all PJSIP endpoints
 */
export async function getAllPjsipEndpoints(): Promise<string[]> {
  try {
    const result = await amiAction({
      action: 'PJSIPShowEndpoints',
    });

    const endpoints: string[] = [];
    if (result.events) {
      for (const event of result.events) {
        if (event.objectname) {
          endpoints.push(event.objectname);
        }
      }
    }

    return endpoints;
  } catch (error) {
    logger.error('Failed to get PJSIP endpoints', error);
    return [];
  }
}

/**
 * Check if extension is registered
 */
export async function isExtensionRegistered(extension: string): Promise<boolean> {
  const status = await getPjsipEndpointStatus(extension);
  return status.contacts.some(c => c.status === 'Reachable' || c.status === 'NonQualified');
}

/**
 * Send a reload command after config changes
 */
export async function reloadAfterConfigChange(): Promise<void> {
  await reloadPjsip();
  await reloadVoicemail();
}

/**
 * Cleanup AMI connection
 */
export function closeAmi(): void {
  if (ami) {
    ami.disconnect();
    ami = null;
    connected = false;
  }
}
