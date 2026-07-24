import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { PartnerApiKeyService } from './partner-api-key.service';

class CreatePartnerApiKeyDto {
  @IsString()
  @MinLength(1)
  label!: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/partner-api-keys')
export class PartnerApiKeyController {
  constructor(private readonly apiKeys: PartnerApiKeyService) {}

  @Get()
  list() {
    return this.apiKeys.list();
  }

  @Post()
  generate(@Body() dto: CreatePartnerApiKeyDto, @Req() req: any) {
    return this.apiKeys.generate(dto.label, req.user.userId);
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.apiKeys.revoke(id);
  }
}
