import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { NotificationTemplateService } from './notification-template.service';
import { UpdateNotificationTemplateDto } from './dto/update-notification-template.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/notification-templates')
export class NotificationTemplateController {
  constructor(private readonly templates: NotificationTemplateService) {}

  @Get()
  list() {
    return this.templates.list();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNotificationTemplateDto) {
    return this.templates.update(id, dto);
  }
}
