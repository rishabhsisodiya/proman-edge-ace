import { Injectable, Logger } from '@nestjs/common';
import { ErpDbService } from '../../erp/erp-db.service';
import { PrismaService } from '../../prisma/prisma.service';

// ACE_Service_Module_SQL.md §1 — designation list is config, not hard-coded.
// These 6 are what exists on the reference instance (a stale restore);
// production PISPL carries more (e.g. GM-Technical Service, Junior Service
// Engineer, Manager- Service & Parts, Sr. Servce Engineer) with different
// casing/spacing — confirmed live against the client's own designation list.
// Override via ACE_SERVICE_DESIGNATIONS (comma-separated) at go-live —
// case-sensitive exact match against ERPNext's own designation strings.
const DEFAULT_DESIGNATIONS = [
  'DGM-Service',
  'GM -Service & Parts',
  'MANAGER SERVICE',
  'Senior Service Engineer',
  'SERVICE ENGINEER',
  'Service Manager',
];

function designations(): string[] {
  const raw = process.env.ACE_SERVICE_DESIGNATIONS;
  if (!raw) return DEFAULT_DESIGNATIONS;
  return raw
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

interface ErpEmployeeRow {
  employee_id: string;
  employee_name: string;
  designation: string;
  status: string;
  user_id: string | null;
  cell_number: string | null;
  department: string | null;
}

/**
 * Service Engineer dropdown sync (ACE_Service_Module_SQL.md §1) — pulls
 * ERPNext's tabEmployee (filtered to service designations) into the local
 * ErpEmployee reference table via the read-only DB connection, same pattern
 * as Customer/Item sync. Small, stable dataset (~23 rows on the reference
 * instance) — full re-pull every run, no delta/watermark needed.
 *
 * Reference data only: importing one of these rows into a real ACE User is a
 * separate, explicit Admin action via User Management's Create User form
 * (UsersService.create()'s erpEmployeeId param) — this service never creates
 * a User itself. See the build plan's writeup on why (a cross-division
 * designation-string match was found live during testing — QMS Pro's
 * "Service Manager" — proof a match alone isn't a safe signal for granting
 * ACE access).
 */
@Injectable()
export class EmployeeSyncService {
  private readonly logger = new Logger(EmployeeSyncService.name);

  constructor(
    private readonly erpDb: ErpDbService,
    private readonly prisma: PrismaService,
  ) {}

  async run(): Promise<void> {
    const startedAt = new Date();
    let synced = 0;
    let errorMessage: string | null = null;

    try {
      const list = designations();
      const placeholders = list.map(() => '?').join(',');
      const rows = await this.erpDb.query<ErpEmployeeRow>(
        `SELECT
            name          AS employee_id,
            employee_name AS employee_name,
            designation   AS designation,
            status        AS status,
            user_id       AS user_id,
            cell_number   AS cell_number,
            department    AS department
         FROM \`tabEmployee\`
         WHERE status = 'Active'
           AND designation IN (${placeholders})
         ORDER BY designation ASC, employee_name ASC`,
        list,
      );

      for (const row of rows) {
        await this.prisma.erpEmployee.upsert({
          where: { employeeId: row.employee_id },
          create: {
            employeeId: row.employee_id,
            employeeName: row.employee_name,
            designation: row.designation,
            status: row.status,
            erpUserId: row.user_id || null,
            cellNumber: row.cell_number,
            department: row.department,
          },
          update: {
            employeeName: row.employee_name,
            designation: row.designation,
            status: row.status,
            erpUserId: row.user_id || null,
            cellNumber: row.cell_number,
            department: row.department,
            lastSyncedAt: new Date(),
          },
        });
        synced++;
      }
    } catch (err: any) {
      errorMessage = err?.message ?? String(err);
      this.logger.error('Employee sync run failed', err);
    }

    await this.prisma.syncLog.create({
      data: {
        syncType: 'SCHEDULED',
        entity: 'ErpEmployee',
        erpDoctype: 'Employee',
        status: errorMessage ? 'FAILED' : 'SUCCESS',
        errorMessage: errorMessage ?? undefined,
        payload: { synced },
        startedAt,
        completedAt: new Date(),
      },
    });
    this.logger.log(`Employee sync complete — ${synced} synced`);
  }
}
