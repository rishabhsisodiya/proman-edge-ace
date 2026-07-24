import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PartnerApiKeyService } from './partner-api-key.service';

/**
 * API-key auth for the partner/IoT webhook — deliberately not JWT, since the
 * caller here is a machine (IoT sensor / partner system), not a logged-in
 * ACE user. Keys are Admin-generated/revocable (PartnerApiKeyService), not a
 * single static env var — only the SHA-256 hash is ever stored, so a
 * revoked/never-issued key always fails, fail-closed.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: PartnerApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const provided = req.headers['x-api-key'];
    if (!provided || typeof provided !== 'string' || !(await this.apiKeys.verify(provided))) {
      throw new ForbiddenException('Invalid or missing API key');
    }
    return true;
  }
}
