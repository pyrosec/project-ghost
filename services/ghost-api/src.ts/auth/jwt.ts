import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface JwtPayload {
  sub: string; // extension
  is_superuser: boolean;
  iat: number;
  exp: number;
}

export function signToken(extension: string, isSuperuser: boolean): string {
  const payload = {
    sub: extension,
    is_superuser: isSuperuser,
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiry as string,
    issuer: 'ghost-api',
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: 'ghost-api',
    }) as JwtPayload;
    return payload;
  } catch {
    return null;
  }
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
}
