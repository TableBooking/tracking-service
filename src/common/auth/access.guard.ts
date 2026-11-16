import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
  type OnModuleInit,
} from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { createPublicKey } from 'node:crypto';
import { importSPKI, jwtVerify } from 'jose';
import { config } from '../../config/env.js';
export interface Principal {
  sub: string;
  role: 'CUSTOMER' | 'STAFF' | 'MANAGER';
}
@Injectable()
export class AccessGuard implements CanActivate, OnModuleInit {
  private key?: Awaited<ReturnType<typeof importSPKI>>;
  async onModuleInit() {
    const pem = await readFile(config.JWT_PUBLIC_KEY_PATH, 'utf8');
    const parsed = createPublicKey(pem);
    if (
      parsed.asymmetricKeyType !== 'rsa' ||
      (parsed.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    )
      throw new Error('Invalid RSA public key');
    this.key = await importSPKI(pem, 'RS256');
  }
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    try {
      const token = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '')?.[1];
      if (!token || !this.key) throw new Error();
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['RS256'],
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
        requiredClaims: ['sub', 'exp', 'role'],
      });
      if (
        !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(payload.sub ?? '') ||
        !['CUSTOMER', 'STAFF', 'MANAGER'].includes(String(payload.role))
      )
        throw new Error();
      req.user = { sub: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'A valid access token is required',
      });
    }
  }
}
export function roleAllowed(user: Principal) {
  if (!['CUSTOMER', 'STAFF', 'MANAGER'].includes(user.role)) throw new ForbiddenException();
}
