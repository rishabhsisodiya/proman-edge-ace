import { Injectable } from '@nestjs/common';
import { Priority } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PriorityLabelService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.priorityLabel.findMany({ orderBy: { priority: 'asc' } });
  }

  update(priority: Priority, label: string, definition: string | undefined) {
    return this.prisma.priorityLabel.upsert({
      where: { priority },
      create: { priority, label, definition },
      update: { label, definition },
    });
  }
}
