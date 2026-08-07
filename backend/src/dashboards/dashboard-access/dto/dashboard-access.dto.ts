import { IsBoolean, IsEnum, IsIn } from 'class-validator';
import { Role } from '@prisma/client';
import { DASHBOARD_KEYS } from '../dashboard-registry';

export class SetDashboardAccessRuleDto {
  @IsEnum(Role)
  role!: Role;

  @IsIn(DASHBOARD_KEYS)
  dashboardKey!: string;

  @IsBoolean()
  enabled!: boolean;
}
