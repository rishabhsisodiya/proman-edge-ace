import { PrismaClient, Role, Region, CustomerType, EquipCategory, EquipStatus, WarrantyStatus, FrappeSite } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password@123', 10);

  const admin = await prisma.user.create({
    data: {
      fullName: 'Admin (Test)',
      email: 'admin@proman.test',
      passwordHash,
      mobile: '9000000000',
      role: Role.ADMIN,
    },
  });

  // Companies — one per known Frappe site for now. Real company-per-site
  // breakdown (the "9 entities" from the dashboard doc) is pending
  // confirmation from the internal manager; admin-editable later via the
  // Admin page rather than hardcoded further here.
  const companies = await Promise.all(
    [
      { name: 'PISPL', site: FrappeSite.PISPL },
      { name: 'ACE', site: FrappeSite.ACE },
      { name: 'PROMAX', site: FrappeSite.PROMAX },
      { name: 'Bluestone', site: FrappeSite.BLUESTONE },
      { name: 'QMS Pro', site: FrappeSite.QMSPRO },
    ].map((c) => prisma.company.create({ data: c })),
  );

  const manufacturingHead = await prisma.user.create({
    data: {
      fullName: 'Manoj Kumar',
      email: 'manufacturing@proman.test',
      passwordHash,
      mobile: '9000000005',
      role: Role.MANUFACTURING_HEAD,
      companies: { create: [{ companyId: companies[0].id }] }, // PISPL
    },
  });

  const salesHead = await prisma.user.create({
    data: {
      fullName: 'Satheesh P',
      email: 'sales@proman.test',
      passwordHash,
      mobile: '9000000006',
      role: Role.SALES_HEAD_AGGREGATE,
      companies: { create: [{ companyId: companies[0].id }] }, // PISPL
    },
  });

  const financeHead = await prisma.user.create({
    data: {
      fullName: 'Rakesh Finance',
      email: 'finance@proman.test',
      passwordHash,
      mobile: '9000000007',
      role: Role.FINANCE_HEAD,
      companies: { create: [{ companyId: companies[0].id }] }, // PISPL
    },
  });

  const procurementHead = await prisma.user.create({
    data: {
      fullName: 'Suresh Procurement',
      email: 'procurement@proman.test',
      passwordHash,
      mobile: '9000000008',
      role: Role.PROCUREMENT_HEAD,
      companies: { create: [{ companyId: companies[0].id }] }, // PISPL
    },
  });

  const storesHead = await prisma.user.create({
    data: {
      fullName: 'Vijay Stores',
      email: 'stores@proman.test',
      passwordHash,
      mobile: '9000000009',
      role: Role.STORES_HEAD,
      companies: { create: [{ companyId: companies[0].id }] }, // PISPL
    },
  });

  const dispatchHead = await prisma.user.create({
    data: {
      fullName: 'Anand Dispatch',
      email: 'dispatch@proman.test',
      passwordHash,
      mobile: '9000000010',
      role: Role.DISPATCH_HEAD,
      companies: { create: [{ companyId: companies[0].id }] }, // PISPL
    },
  });

  const manager = await prisma.user.create({
    data: {
      fullName: 'Ashwath Manager',
      email: 'manager@proman.test',
      passwordHash,
      mobile: '9000000001',
      role: Role.MANAGER,
      regions: { create: [{ region: Region.CENTRAL }] },
    },
  });

  const asm = await prisma.user.create({
    data: {
      fullName: 'Test ASM',
      email: 'asm@proman.test',
      passwordHash,
      mobile: '9000000002',
      role: Role.ASM,
      regions: { create: [{ region: Region.CENTRAL }] },
    },
  });

  const engineer = await prisma.user.create({
    data: {
      fullName: 'M. Kumar',
      email: 'engineer@proman.test',
      passwordHash,
      mobile: '9000000003',
      role: Role.ENGINEER,
      skillTags: ['CRUSHER', 'BEARINGS'],
      regions: { create: [{ region: Region.CENTRAL }] },
    },
  });

  const callCenter = await prisma.user.create({
    data: {
      fullName: 'Call Center Agent',
      email: 'callcenter@proman.test',
      passwordHash,
      mobile: '9000000004',
      role: Role.CALL_CENTER,
    },
  });

  const customer = await prisma.customer.create({
    data: {
      customerName: 'NTPC Sipat',
      customerType: CustomerType.PSU,
      region: Region.CENTRAL,
      primaryContactName: 'S. Verma',
      primaryContactMobile: '9111111111',
      primaryContactEmail: 'verma@ntpc.test',
      sites: {
        create: [
          {
            siteName: 'NTPC Sipat Plant',
            addressLine1: 'NH-30',
            city: 'Sipat',
            state: 'Chhattisgarh',
            pin: '495555',
          },
        ],
      },
    },
    include: { sites: true },
  });

  await prisma.item.create({
    data: {
      itemCode: 'JC-900',
      itemName: 'JC-900 Jaw Crusher',
      itemGroup: 'Crushing Systems',
      uom: 'Nos',
      standardRate: 1500000,
    },
  });

  await prisma.equipment.create({
    data: {
      serialNo: 'SN-JC900-0042',
      itemCode: 'JC-900',
      itemName: 'JC-900 Jaw Crusher',
      equipmentCategory: EquipCategory.CRUSHER,
      customerId: customer.id,
      siteId: customer.sites[0].id,
      installationDate: new Date('2024-01-15'),
      warrantyStartDate: new Date('2024-01-15'),
      warrantyEndDate: new Date('2026-01-15'),
      warrantyPeriodMonths: 24,
      warrantyStatus: WarrantyStatus.UNDER_WARRANTY,
      status: EquipStatus.ACTIVE,
      skillTagsRequired: ['CRUSHER'],
    },
  });

  console.log('Seed complete:', {
    admin: admin.email,
    manufacturingHead: manufacturingHead.email,
    salesHead: salesHead.email,
    financeHead: financeHead.email,
    procurementHead: procurementHead.email,
    storesHead: storesHead.email,
    dispatchHead: dispatchHead.email,
    manager: manager.email,
    asm: asm.email,
    engineer: engineer.email,
    callCenter: callCenter.email,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
