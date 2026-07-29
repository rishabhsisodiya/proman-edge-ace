import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { PASSWORD_POLICY_REGEX } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const USER_SAFE_SELECT = {
  id: true,
  fullName: true,
  email: true,
  mobile: true,
  role: true,
  isActive: true,
  lockedUntil: true,
  failedLoginAttempts: true,
  skillTags: true,
  engineerLevel: true,
  erpEmployeeId: true,
  regions: true,
  companies: { include: { company: true } },
} as const;

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

  list(role?: Role, lockedOnly?: boolean, isActive?: boolean) {
    return this.prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(lockedOnly ? { lockedUntil: { gt: new Date() } } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      orderBy: { fullName: 'asc' },
      // Explicit select, not `include` on the full model — passwordHash must
      // never leave this service, not even to an Admin-only screen.
      select: USER_SAFE_SELECT,
    });
  }

  /** User Management (2026-07-28) — create any role except ADMIN, which is deliberately out of scope for this screen. */
  async create(dto: CreateUserDto) {
    if (dto.role === 'ADMIN') {
      throw new BadRequestException('Admin accounts cannot be created here');
    }
    if (!PASSWORD_POLICY_REGEX.test(dto.password)) {
      throw new BadRequestException('Password must be 8+ chars with upper, lower, number, and special character');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('A user with this email already exists');

    if (dto.erpEmployeeId) {
      const employee = await this.prisma.erpEmployee.findUnique({ where: { employeeId: dto.erpEmployeeId } });
      if (!employee) throw new BadRequestException('ERP employee not found — try re-syncing first');
      const alreadyLinked = await this.prisma.user.findUnique({ where: { erpEmployeeId: dto.erpEmployeeId } });
      if (alreadyLinked) throw new ConflictException('This ERP employee has already been imported as a User');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        passwordHash,
        mobile: dto.mobile,
        role: dto.role,
        skillTags: dto.skillTags ?? [],
        engineerLevel: dto.engineerLevel,
        erpEmployeeId: dto.erpEmployeeId,
        mustChangePassword: true,
        regions: dto.regions ? { create: dto.regions.map((region) => ({ region })) } : undefined,
        companies: dto.companyIds ? { create: dto.companyIds.map((companyId) => ({ companyId })) } : undefined,
      },
      select: USER_SAFE_SELECT,
    });
    // TODO(notification): once the notification gateway exists (0/23 triggers
    // wired today, per the build plan), send this user their login email +
    // initial password here instead of Admin having to relay it manually.
    return user;
  }

  /**
   * Edit an existing user. Role change and deactivation both go through the
   * same guard: blocked if the user currently has any non-Closed ticket
   * assigned to them as ASM or Engineer (client decision, 2026-07-28) —
   * Admin must reassign those tickets first. Reactivating (isActive: true)
   * and every other field are never blocked.
   */
  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (user.role === 'ADMIN') {
      throw new BadRequestException('Admin accounts cannot be edited here');
    }
    if (dto.role === 'ADMIN') {
      throw new BadRequestException('Admin accounts cannot be created here');
    }

    const roleChanging = dto.role !== undefined && dto.role !== user.role;
    const deactivating = dto.isActive === false && user.isActive;
    if (roleChanging || deactivating) {
      const openCount = await this.openTicketAssignmentCount(id);
      if (openCount > 0) {
        const action = roleChanging ? 'change this user\'s role' : 'deactivate this user';
        throw new ConflictException(
          `Cannot ${action} — they have ${openCount} open ticket(s) assigned as ASM/Engineer. Reassign those first.`,
        );
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        mobile: dto.mobile,
        role: dto.role,
        skillTags: dto.skillTags,
        engineerLevel: dto.engineerLevel,
        isActive: dto.isActive,
        ...(dto.regions
          ? { regions: { deleteMany: {}, create: dto.regions.map((region) => ({ region })) } }
          : {}),
        ...(dto.companyIds
          ? { companies: { deleteMany: {}, create: dto.companyIds.map((companyId) => ({ companyId })) } }
          : {}),
      },
      select: USER_SAFE_SELECT,
    });
  }

  /** Admin sets a new password directly (no email gateway exists yet) — forces a change on next login and invalidates existing sessions. */
  async resetPassword(id: string, newPassword: string) {
    if (!PASSWORD_POLICY_REGEX.test(newPassword)) {
      throw new BadRequestException('Password must be 8+ chars with upper, lower, number, and special character');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } },
    });
    // TODO(notification): once the notification gateway exists, send this
    // user their new password here instead of Admin relaying it manually.
    return { ok: true };
  }

  /** The 5 seeded Company rows (PISPL/ACE/PROMAX/Bluestone/QMS Pro) — for the company picker on this same screen. */
  listCompanies() {
    return this.prisma.company.findMany({ orderBy: { name: 'asc' } });
  }

  /**
   * ERP Employees (ACE_Service_Module_SQL.md §1) not yet linked to a real
   * ACE User — the "Prefill from ERP Employee" picker on Create User. Excludes
   * rows already imported (anti-join, cheap at this list's size — synced
   * ~23 rows on the reference instance).
   */
  async unimportedErpEmployees() {
    const linked = await this.prisma.user.findMany({
      where: { erpEmployeeId: { not: null } },
      select: { erpEmployeeId: true },
    });
    const linkedIds = new Set(linked.map((u) => u.erpEmployeeId));
    const employees = await this.prisma.erpEmployee.findMany({ orderBy: { employeeName: 'asc' } });
    return employees.filter((e) => !linkedIds.has(e.employeeId));
  }

  private async openTicketAssignmentCount(userId: string): Promise<number> {
    const [asAsm, asEngineer] = await Promise.all([
      this.prisma.ticket.count({ where: { assignedAsmId: userId, status: { not: 'CLOSED' } } }),
      this.prisma.ticket.count({ where: { assignedEngineerId: userId, status: { not: 'CLOSED' } } }),
    ]);
    return asAsm + asEngineer;
  }
}
