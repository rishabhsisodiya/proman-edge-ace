import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query('role') role?: Role) {
    return this.users.list(role);
  }

  @Roles('ASM', 'MANAGER')
  @Get('engineer-candidates')
  engineerCandidates(@Query('region') region?: string, @Query('skillTag') skillTag?: string) {
    return this.users.engineerCandidates(region, skillTag);
  }
}
