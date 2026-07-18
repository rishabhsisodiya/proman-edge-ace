import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from './auth.service';

const ACCESS_COOKIE = 'ace_access_token';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      // Tokens are httpOnly cookies now (client JS can't read them to set an
      // Authorization header) — extract straight from the cookie instead.
      jwtFromRequest: (req: Request) => req?.cookies?.[ACCESS_COOKIE] ?? null,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me',
    });
  }

  async validate(payload: AccessTokenPayload) {
    if (payload.type !== 'access') throw new UnauthorizedException('Invalid token type');

    // Checked against the DB (not just the JWT signature) so a logout or
    // password change invalidates already-issued access tokens immediately,
    // not just on their natural 15-minute expiry.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session no longer valid');
    }

    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
