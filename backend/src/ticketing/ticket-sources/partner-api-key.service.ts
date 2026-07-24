import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

@Injectable()
export class PartnerApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.partnerApiKey.findMany({
      select: { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true, createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Generates a new key and returns the raw value exactly once — only its hash is ever persisted. */
  async generate(label: string, createdByUserId: string) {
    const rawKey = `ace_${crypto.randomBytes(24).toString('hex')}`;
    const record = await this.prisma.partnerApiKey.create({
      data: { label, keyHash: hashKey(rawKey), createdByUserId },
    });
    return { id: record.id, label: record.label, rawKey, createdAt: record.createdAt };
  }

  async revoke(id: string) {
    return this.prisma.partnerApiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  /** Used by ApiKeyGuard — verifies the raw key against stored hashes and records last-used. */
  async verify(rawKey: string): Promise<boolean> {
    const key = await this.prisma.partnerApiKey.findUnique({ where: { keyHash: hashKey(rawKey) } });
    if (!key || key.revokedAt) return false;
    await this.prisma.partnerApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return true;
  }
}
