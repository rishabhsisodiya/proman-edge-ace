import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAmcContractDto, UpdateAmcContractDto } from './dto/amc-contract.dto';

@Injectable()
export class AmcContractService {
  constructor(private readonly prisma: PrismaService) {}

  list(customerId?: string) {
    return this.prisma.amcContract.findMany({
      where: customerId ? { customerId } : undefined,
      include: { customer: true, coveredEquipment: true },
      orderBy: { startDate: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.amcContract.findUniqueOrThrow({
      where: { id },
      include: { customer: true, coveredEquipment: true, scheduledVisits: true },
    });
  }

  async create(dto: CreateAmcContractDto) {
    const contract = await this.prisma.amcContract.create({
      data: {
        contractReferenceNo: dto.contractReferenceNo,
        customerId: dto.customerId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        contractValue: dto.contractValue,
        visitsIncluded: dto.visitsIncluded,
        partsCoverage: dto.partsCoverage,
        scopeOfServices: dto.scopeOfServices,
        exclusions: dto.exclusions,
        owningAsmId: dto.owningAsmId,
        previousContractId: dto.previousContractId,
        signedAgreementUrl: dto.signedAgreementUrl,
        coveredEquipment: { connect: dto.coveredEquipmentIds.map((id) => ({ id })) },
      },
      include: { customer: true, coveredEquipment: true },
    });
    const overlapWarnings = await this.findOverlaps(contract.id, dto.coveredEquipmentIds, dto.startDate, dto.endDate);
    return { contract, overlapWarnings };
  }

  async update(id: string, dto: UpdateAmcContractDto) {
    const contract = await this.prisma.amcContract.update({
      where: { id },
      data: {
        contractReferenceNo: dto.contractReferenceNo,
        customerId: dto.customerId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        contractValue: dto.contractValue,
        visitsIncluded: dto.visitsIncluded,
        partsCoverage: dto.partsCoverage,
        scopeOfServices: dto.scopeOfServices,
        exclusions: dto.exclusions,
        owningAsmId: dto.owningAsmId,
        previousContractId: dto.previousContractId,
        signedAgreementUrl: dto.signedAgreementUrl,
        coveredEquipment: { set: dto.coveredEquipmentIds.map((eid) => ({ id: eid })) },
      },
      include: { customer: true, coveredEquipment: true },
    });
    const overlapWarnings = await this.findOverlaps(contract.id, dto.coveredEquipmentIds, dto.startDate, dto.endDate);
    return { contract, overlapWarnings };
  }

  /**
   * §14.5: overlapping AMC contracts on the same equipment — system uses the
   * one with the later start_date as active, but Admin still gets a warning
   * so it's a visible decision, not a silent one.
   */
  private async findOverlaps(
    excludeContractId: string,
    equipmentIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<{ equipmentId: string; equipmentSerialNo: string; otherContractRefNo: string }[]> {
    if (equipmentIds.length === 0) return [];
    const others = await this.prisma.amcContract.findMany({
      where: {
        id: { not: excludeContractId },
        startDate: { lte: new Date(endDate) },
        endDate: { gte: new Date(startDate) },
        coveredEquipment: { some: { id: { in: equipmentIds } } },
      },
      include: { coveredEquipment: true },
    });

    const warnings: { equipmentId: string; equipmentSerialNo: string; otherContractRefNo: string }[] = [];
    for (const other of others) {
      for (const eq of other.coveredEquipment) {
        if (equipmentIds.includes(eq.id)) {
          warnings.push({ equipmentId: eq.id, equipmentSerialNo: eq.serialNo, otherContractRefNo: other.contractReferenceNo });
        }
      }
    }
    return warnings;
  }
}
