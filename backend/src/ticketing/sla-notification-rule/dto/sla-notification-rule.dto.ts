import { IsBoolean, IsEnum } from 'class-validator';
import { Role, SlaBreachType } from '@prisma/client';

export class SetSlaNotificationRuleDto {
  @IsEnum(SlaBreachType)
  breachType!: SlaBreachType;

  @IsEnum(Role)
  role!: Role;

  @IsBoolean()
  enabled!: boolean;
}
