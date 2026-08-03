import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { SkillTagService } from './skill-tag.service';
import { CreateSkillTagDto } from './dto/skill-tag.dto';

// list() open to any authenticated role (User Management's picker and the
// engineer-candidate matching context both need it); writes Admin-only.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('skill-tags')
export class SkillTagController {
  constructor(private readonly skillTags: SkillTagService) {}

  @Get()
  list() {
    return this.skillTags.list();
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateSkillTagDto) {
    return this.skillTags.create(dto.label);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.skillTags.remove(id);
  }
}
