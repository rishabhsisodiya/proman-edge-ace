import { Module } from '@nestjs/common';
import { SkillTagController } from './skill-tag.controller';
import { SkillTagService } from './skill-tag.service';

@Module({
  controllers: [SkillTagController],
  providers: [SkillTagService],
  exports: [SkillTagService],
})
export class SkillTagModule {}
