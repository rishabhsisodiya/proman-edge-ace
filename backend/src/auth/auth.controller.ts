import { Body, Controller, Get, Param, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';

const ACCESS_COOKIE = 'ace_access_token';
const REFRESH_COOKIE = 'ace_refresh_token';
const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// httpOnly so client-side JS can never read these — closes the XSS exposure
// gap the plain-cookie version had. `secure` only in production since local
// dev runs over plain http.
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto.email, dto.password);
    res.cookie(ACCESS_COOKIE, result.accessToken, { ...COOKIE_OPTS, maxAge: ACCESS_MAX_AGE_MS });
    res.cookie(REFRESH_COOKIE, result.refreshToken, { ...COOKIE_OPTS, maxAge: REFRESH_MAX_AGE_MS });
    return { user: result.user, mustChangePassword: result.mustChangePassword };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) throw new UnauthorizedException('No refresh token');

    const { accessToken } = await this.authService.refresh(refreshToken);
    res.cookie(ACCESS_COOKIE, accessToken, { ...COOKIE_OPTS, maxAge: ACCESS_MAX_AGE_MS });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.user.userId);
    res.clearCookie(ACCESS_COOKIE, COOKIE_OPTS);
    res.clearCookie(REFRESH_COOKIE, COOKIE_OPTS);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    await this.authService.changePassword(req.user.userId, dto.currentPassword, dto.newPassword);
    // Password change bumps tokenVersion server-side, invalidating this
    // session's own tokens too — clear cookies so the user re-logs in cleanly
    // rather than holding a token that will fail on the next request.
    res.clearCookie(ACCESS_COOKIE, COOKIE_OPTS);
    res.clearCookie(REFRESH_COOKIE, COOKIE_OPTS);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.authService.me(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('users/:id/unlock')
  async unlock(@Param('id') id: string) {
    await this.authService.unlockUser(id);
    return { ok: true };
  }
}
