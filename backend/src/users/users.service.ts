import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Engineer candidates for the Manager Console's "Assign engineer" panel —
   * ranked by territory match + skill match + current open ticket count
   * (Manager Console prototype: "BEST MATCH", "Skills", "Open load").
   */
  async engineerCandidates(region?: string, skillTag?: string) {
    const engineers = await this.prisma.user.findMany({
      where: {
        role: Role.ENGINEER,
        isActive: true,
        ...(region ? { regions: { some: { region: region as any } } } : {}),
        ...(skillTag ? { skillTags: { has: skillTag } } : {}),
      },
      include: {
        regions: true,
        _count: {
          select: {
            ticketsAsEngineer: { where: { status: { notIn: ['CLOSED', 'ASM_RESOLVED'] } } },
          },
        },
      },
    });

    return engineers
      .map((e) => ({
        id: e.id,
        fullName: e.fullName,
        skillTags: e.skillTags,
        regions: e.regions.map((r) => r.region),
        openLoad: e._count.ticketsAsEngineer,
        territoryMatch: region ? e.regions.some((r) => r.region === region) : false,
        skillMatch: skillTag ? e.skillTags.includes(skillTag) : false,
      }))
      .sort((a, b) => a.openLoad - b.openLoad);
  }

  list(role?: Role, lockedOnly?: boolean) {
    return this.prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(lockedOnly ? { lockedUntil: { gt: new Date() } } : {}),
      },
      // Explicit select, not `include` on the full model — passwordHash must
      // never leave this service, not even to an Admin-only screen.
      select: {
        id: true,
        fullName: true,
        email: true,
        mobile: true,
        role: true,
        isActive: true,
        lockedUntil: true,
        failedLoginAttempts: true,
        regions: true,
      },
    });
  }
}
