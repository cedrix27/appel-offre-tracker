import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfig } from '../config/app-config';
import { AuthRateLimited, CurrentUser, Public } from '../common/decorators';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../common/guards/jwt-auth.guard';
import type { AuthUser } from '../common/request';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  type RegisterInput,
  tokenPasswordSchema,
  tokenSchema,
} from './auth.schemas';
import { AuthService, SessionTokens } from './auth.service';
import { TOKEN_TTL_MS } from './tokens';

const ACCESS_TTL_MS = 15 * 60 * 1000;

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  private baseCookie(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
    };
  }

  private setSession(res: Response, tokens: SessionTokens): void {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...this.baseCookie(),
      path: '/',
      maxAge: ACCESS_TTL_MS,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.baseCookie(),
      path: this.config.env.REFRESH_COOKIE_PATH,
      maxAge: TOKEN_TTL_MS.REFRESH,
    });
  }

  private clearSession(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { ...this.baseCookie(), path: '/' });
    res.clearCookie(REFRESH_COOKIE, {
      ...this.baseCookie(),
      path: this.config.env.REFRESH_COOKIE_PATH,
    });
  }

  private refreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as
      Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  @Public()
  @AuthRateLimited()
  @Post('auth/register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
  ) {
    return { user: await this.auth.register(body) };
  }

  @Public()
  @HttpCode(200)
  @Post('auth/verify-email')
  async verifyEmail(
    @Body(new ZodValidationPipe(tokenSchema)) body: { token: string },
  ) {
    await this.auth.verifyEmail(body.token);
    return { ok: true };
  }

  @Public()
  @AuthRateLimited()
  @HttpCode(202)
  @Post('auth/resend-verification')
  async resend(
    @Body(new ZodValidationPipe(emailOnlySchema)) body: { email: string },
  ) {
    await this.auth.resendVerification(body.email);
    return {
      ok: true,
      message:
        'Si un compte non vérifié existe pour cette adresse, un nouvel e-mail a été envoyé.',
    };
  }

  @Public()
  @AuthRateLimited()
  @HttpCode(200)
  @Post('auth/login')
  async login(
    @Body(new ZodValidationPipe(loginSchema))
    body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.auth.login(body.email, body.password);
    this.setSession(res, tokens);
    return { user };
  }

  @Public()
  @HttpCode(200)
  @Post('auth/refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { user, tokens } = await this.auth.refresh(this.refreshCookie(req));
      this.setSession(res, tokens);
      return { user };
    } catch (err) {
      this.clearSession(res);
      throw err;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('auth/logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.refreshCookie(req));
    this.clearSession(res);
  }

  @Public()
  @AuthRateLimited()
  @HttpCode(202)
  @Post('auth/forgot-password')
  async forgot(
    @Body(new ZodValidationPipe(emailOnlySchema)) body: { email: string },
  ) {
    await this.auth.forgotPassword(body.email);
    return {
      ok: true,
      message:
        'Si un compte existe pour cette adresse, un e-mail de réinitialisation a été envoyé.',
    };
  }

  @Public()
  @AuthRateLimited()
  @HttpCode(200)
  @Post('auth/reset-password')
  async reset(
    @Body(new ZodValidationPipe(tokenPasswordSchema))
    body: {
      token: string;
      password: string;
    },
  ) {
    await this.auth.resetPassword(body.token, body.password);
    return { ok: true };
  }

  @Public()
  @AuthRateLimited()
  @HttpCode(200)
  @Post('auth/accept-invite')
  async acceptInvite(
    @Body(new ZodValidationPipe(tokenPasswordSchema))
    body: {
      token: string;
      password: string;
    },
  ) {
    await this.auth.acceptInvite(body.token, body.password);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
