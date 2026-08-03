import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Skill Tags master list (2026-08-03) — see schema.prisma's SkillTag model doc for scope/reasoning. */
@Injectable()
export class SkillTagService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.skillTag.findMany({ orderBy: { label: 'asc' } });
  }

  async create(label: string) {
    const existing = await this.prisma.skillTag.findUnique({ where: { label } });
    if (existing) throw new ConflictException(`Skill tag "${label}" already exists`);
    return this.prisma.skillTag.create({ data: { label } });
  }

  remove(id: string) {
    return this.prisma.skillTag.delete({ where: { id } });
  }

  /** Used by UsersService to validate User.skillTags server-side — every tag must exist in the master list. */
  async allLabels(): Promise<Set<string>> {
    const rows = await this.prisma.skillTag.findMany({ select: { label: true } });
    return new Set(rows.map((r) => r.label));
  }
}
