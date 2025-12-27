// Auth types
export interface LoginRequest {
  extension: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  extension: string;
  is_superuser: boolean;
  expires_at: string;
}

export interface CreateTokenRequest {
  name: string;
  expires_in_days?: number;
}

export interface CreateTokenResponse {
  api_key: string;
  key_id: string;
  name: string;
  key_prefix: string;
  expires_at: string | null;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface UserInfo {
  extension: string;
  display_name: string | null;
  email: string | null;
  is_superuser: boolean;
  api_keys: ApiKeyInfo[];
}

// Extension types
export interface ExtensionInfo {
  extension: string;
  callerid: string;
  context: string;
  did: string | null;
  devices: string[];
  voicemail_enabled: boolean;
  settings: {
    fallback: string | null;
    sms_fallback: string | null;
    is_superuser: boolean;
  };
  blacklist: string[];
}

export interface CreateExtensionRequest {
  extension: string;
  password?: string;
  callerid: string;
  did?: string;
  context?: string;
  voicemail?: {
    enabled: boolean;
    password?: string;
    email?: string;
  };
}

export interface CreateExtensionResponse {
  extension: string;
  password: string;
  sip_username: string;
  created: boolean;
}

export interface UpdateExtensionRequest {
  extension: string;
  password?: string;
  callerid?: string;
  did?: string;
  settings?: {
    fallback?: string;
    sms_fallback?: string;
  };
  blacklist?: {
    add?: string[];
    remove?: string[];
  };
}

// Error response
export interface ErrorResponse {
  error: string;
  details?: any;
}
