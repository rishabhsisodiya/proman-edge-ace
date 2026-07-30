import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles('ADMIN')
  @Get()
  list(@Query('role') role?: Role, @Query('lockedOnly') lockedOnly?: string, @Query('isActive') isActive?: string) {
    return this.users.list(role, lockedOnly === 'true', isActive === undefined ? undefined : isActive === 'true');
  }

  @Roles('ASM', 'MANAGER')
  @Get('engineer-candidates')
  engineerCandidates(@Query('region') region?: string, @Query('skillTag') skillTag?: string) {
    return this.users.engineerCandidates(region, skillTag);
  }

  @Roles('ADMIN')
  @Get('companies')
  companies() {
    return this.users.listCompanies();
  }

  @Roles('ADMIN')
  @Get('erp-employees/unimported')
  unimportedErpEmployees() {
    return this.users.unimportedErpEmployees();
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.newPassword);
  }

  // No @Roles() — any authenticated user registers/unregisters their own
  // device, this isn't an Admin-only action.
  @Post('me/push-tokens')
  registerPushToken(@Req() req: any, @Body('token') token: string, @Body('deviceInfo') deviceInfo?: string) {
    return this.users.registerPushToken(req.user.userId, token, deviceInfo);
  }

  @Delete('me/push-tokens/:token')
  unregisterPushToken(@Param('token') token: string) {
    return this.users.unregisterPushToken(token);
  }
}
