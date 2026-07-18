import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string) {
    return this.prisma.item.findMany({
      where: search ? { itemName: { contains: search, mode: 'insensitive' } } : undefined,
      take: 100,
    });
  }

  findOne(itemCode: string) {
    return this.prisma.item.findUniqueOrThrow({ where: { itemCode } });
  }
}
