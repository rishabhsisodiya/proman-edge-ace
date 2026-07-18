import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  tokenVersion: number;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  tokenVersion: number;
  type: 'refresh';
}

const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// FSD §8.2: 5 attempts / 15 min window -> 30 min lockout, Admin can unlock early.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000;

// All business-facing times in this app are IST (matches business-hours.util.ts's
// 08:00-18:00 IST convention) — raw ISO/UTC would confuse users on lockout messages.
function formatIst(date: Date): string {
  return (
    date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' IST'
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        `Account locked until ${formatIst(user.lockedUntil)} after too many failed attempts`,
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const lockingNow = attempts >= MAX_FAILED_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lockingNow ? 0 : attempts,
          lockedUntil: lockingNow ? new Date(Date.now() + LOCKOUT_MS) : null,
        },
      });
      if (lockingNow) {
        throw new UnauthorizedException(`Account locked for 30 minutes after ${MAX_FAILED_ATTEMPTS} failed attempts`);
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful login clears any prior failed-attempt count/lock.
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    return {
      accessToken: this.signAccessToken(user.id, user.email, user.role, user.tokenVersion),
      refreshToken: this.signRefreshToken(user.id, user.tokenVersion),
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
      mustChangePassword: user.mustChangePassword,
    };
  }

  /** Admin-only early unlock — clears the lockout before its natural 30-min expiry. */
  async unlockUser(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  /** Redeems a refresh token (from the httpOnly cookie) for a new access token. */
  async refresh(refreshToken: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwt.verify<RefreshTokenPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    // tokenVersion mismatch means the user logged out (or was force-logged-out)
    // since this refresh token was issued — reject even though the JWT itself is
    // still cryptographically valid and unexpired.
    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session no longer valid');
    }

    return {
      accessToken: this.signAccessToken(user.id, user.email, user.role, user.tokenVersion),
    };
  }

  /** Invalidates every outstanding refresh token (and future access-token checks) for this user. */
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!PASSWORD_POLICY_REGEX.test(newPassword)) {
      throw new BadRequestException(
        'Password must be at least 8 characters and include an uppercase letter, a number, and a special character',
      );
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { regions: true },
    });
    const { passwordHash, ...safe } = user;
    return safe;
  }

  private signAccessToken(sub: string, email: string, role: string, tokenVersion: number) {
    const payload: AccessTokenPayload = { sub, email, role, tokenVersion, type: 'access' };
    return this.jwt.sign(payload, { expiresIn: '15m' });
  }

  private signRefreshToken(sub: string, tokenVersion: number) {
    const payload: RefreshTokenPayload = { sub, tokenVersion, type: 'refresh' };
    return this.jwt.sign(payload, { expiresIn: '7d' });
  }
}
