-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CALL_CENTER', 'ASM', 'ENGINEER', 'MANAGER', 'ADMIN', 'MD', 'SALES_HEAD_AGGREGATE', 'SALES_HEAD_IM_BMH', 'ENGINEERING_DESIGN_HEAD', 'MANUFACTURING_HEAD', 'PROCUREMENT_HEAD', 'STORES_HEAD', 'QMS_HEAD', 'DISPATCH_HEAD', 'SERVICE_AFTERSALES_HEAD', 'FINANCE_HEAD');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL', 'BANGLADESH');

-- CreateEnum
CREATE TYPE "FrappeSite" AS ENUM ('PISPL', 'ACE', 'PROMAX', 'BLUESTONE', 'QMSPRO');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('DIRECT', 'DEALER', 'OEM_PARTNER', 'GOVERNMENT', 'PSU');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "EquipCategory" AS ENUM ('CRUSHER', 'CONVEYOR', 'WAGON_TIPPLER', 'STACKER_RECLAIMER', 'SCREEN', 'DRY_MORTAR', 'BULK_RECEPTION', 'OTHER');

-- CreateEnum
CREATE TYPE "EquipStatus" AS ENUM ('ACTIVE', 'UNDER_REPAIR', 'DECOMMISSIONED', 'SOLD');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('UNDER_WARRANTY', 'EXPIRING_SOON', 'OUT_OF_WARRANTY');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('WARRANTY_REPAIR', 'BREAKDOWN_CHARGEABLE', 'SCHEDULED_PM', 'TECHNICAL_AUDIT', 'RETROFIT_UPGRADE', 'AMC', 'SPARES_SUPPLY_INSTALLATION');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('CUSTOMER_CALL', 'CUSTOMER_WHATSAPP', 'INTERNAL', 'BULK_IMPORT', 'API_PARTNER');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'ENGINEER_ASSIGNED', 'ACCEPTED', 'REACHED_SITE', 'WORKING', 'PENDING', 'ENGINEER_RESOLVED', 'ASM_RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PendingReason" AS ENUM ('AWAITING_PARTS', 'AWAITING_CUSTOMER', 'AWAITING_APPROVAL', 'OTHER');

-- CreateEnum
CREATE TYPE "FsvStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "NotifChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'ON_VISIT', 'ON_LEAVE', 'OFF_DUTY');

-- CreateEnum
CREATE TYPE "CallReceivedVia" AS ENUM ('WHATSAPP', 'PHONE', 'EMAIL', 'WALK_IN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotifStatus" AS ENUM ('SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('SCHEDULED', 'EVENT');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ChangeSource" AS ENUM ('WEB_UI', 'API', 'SYSTEM_JOB');

-- CreateEnum
CREATE TYPE "PartsCoverage" AS ENUM ('NONE', 'CONSUMABLES_ONLY', 'ALL_PARTS');

-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('ACTIVE', 'RENEWAL_DUE', 'FINAL_NOTICE', 'LAPSED', 'RENEWED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('SCHEDULED_PENDING', 'COMPLETED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'CUSTOMER_ACCEPTED', 'PO_RECEIVED', 'CONVERTED_TO_SALES_ORDER', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PARTIAL', 'DELIVERED');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "site" "FrappeSite" NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCompany" (
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "UserCompany_pkey" PRIMARY KEY ("userId","companyId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "skillTags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availabilityStatus" "AvailabilityStatus",
    "currentGpsLat" DOUBLE PRECISION,
    "currentGpsLong" DOUBLE PRECISION,
    "lastLocationUpdate" TIMESTAMP(3),
    "erpnextUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRegion" (
    "userId" TEXT NOT NULL,
    "region" "Region" NOT NULL,

    CONSTRAINT "UserRegion_pkey" PRIMARY KEY ("userId","region")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "erpnextCustomerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerType" "CustomerType" NOT NULL,
    "region" "Region" NOT NULL,
    "primaryContactName" TEXT NOT NULL,
    "primaryContactMobile" TEXT NOT NULL,
    "primaryContactEmail" TEXT NOT NULL,
    "secondaryContactName" TEXT,
    "secondaryContactMobile" TEXT,
    "secondaryContactEmail" TEXT,
    "billingAddressLine1" TEXT,
    "billingAddressLine2" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingPin" TEXT,
    "billingCountry" TEXT,
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "gstNumber" TEXT,
    "creditTerms" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSite" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "siteName" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "gpsLat" DOUBLE PRECISION,
    "gpsLong" DOUBLE PRECISION,

    CONSTRAINT "CustomerSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemGroup" TEXT NOT NULL,
    "itemDescription" TEXT,
    "uom" TEXT NOT NULL,
    "standardRate" DECIMAL(65,30) NOT NULL,
    "valuationRate" DECIMAL(65,30),
    "currentStock" DOUBLE PRECISION,
    "compatibleEquipmentCategories" "EquipCategory"[],
    "minimumStockLevel" DOUBLE PRECISION,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "Item_pkey" PRIMARY KEY ("itemCode")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "equipmentCategory" "EquipCategory" NOT NULL,
    "modelNumber" TEXT,
    "customerId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "gpsLat" DOUBLE PRECISION,
    "gpsLong" DOUBLE PRECISION,
    "installationDate" TIMESTAMP(3) NOT NULL,
    "deliveryDate" TIMESTAMP(3),
    "warrantyStartDate" TIMESTAMP(3) NOT NULL,
    "warrantyEndDate" TIMESTAMP(3) NOT NULL,
    "warrantyPeriodMonths" INTEGER NOT NULL,
    "warrantyStatus" "WarrantyStatus" NOT NULL,
    "operatingHoursMeter" DOUBLE PRECISION,
    "status" "EquipStatus" NOT NULL DEFAULT 'ACTIVE',
    "skillTagsRequired" TEXT[],
    "notes" TEXT,
    "erpnextSerialNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "source" "Source" NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "priority" "Priority" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "siteId" TEXT,
    "warrantyStatusAtCreation" "WarrantyStatus",
    "warrantyEligible" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "slaResponseDue" TIMESTAMP(3),
    "slaResolutionDue" TIMESTAMP(3),
    "slaResponseMet" BOOLEAN NOT NULL DEFAULT false,
    "slaResolutionMet" BOOLEAN NOT NULL DEFAULT false,
    "slaPolicyId" TEXT,
    "callReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "callReceivedVia" "CallReceivedVia",
    "createdByUserId" TEXT NOT NULL,
    "assignedAsmId" TEXT,
    "assignedEngineerId" TEXT,
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "rejectionReasons" JSONB NOT NULL DEFAULT '[]',
    "pendingReason" "PendingReason",
    "pendingNotes" TEXT,
    "resolutionSummary" TEXT,
    "csatSurveySent" BOOLEAN NOT NULL DEFAULT false,
    "csatScore" INTEGER,
    "csatResponseText" TEXT,
    "erpnextInvoiceId" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAuditLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeSource" "ChangeSource" NOT NULL,
    "ipAddress" TEXT,

    CONSTRAINT "TicketAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldServiceVisit" (
    "id" TEXT NOT NULL,
    "visitNo" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "visitNumber" INTEGER NOT NULL,
    "engineerId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "travelStartTime" TIMESTAMP(3),
    "siteArrivalTime" TIMESTAMP(3),
    "workStartTime" TIMESTAMP(3),
    "workEndTime" TIMESTAMP(3),
    "workPerformed" TEXT,
    "findingsRootCause" TEXT,
    "recommendations" TEXT,
    "customerRepName" TEXT,
    "customerRepDesignation" TEXT,
    "customerSignOff" BOOLEAN NOT NULL DEFAULT false,
    "customerSignatureUrl" TEXT,
    "gpsLatAtCheckin" DOUBLE PRECISION,
    "gpsLongAtCheckin" DOUBLE PRECISION,
    "status" "FsvStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "erpnextStockEntryId" TEXT,
    "visitReportUrl" TEXT,

    CONSTRAINT "FieldServiceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FsvPartConsumed" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "uom" TEXT NOT NULL,
    "warehouse" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "sellingRate" DECIMAL(65,30) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "FsvPartConsumed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FsvPhoto" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,

    CONSTRAINT "FsvPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT,
    "channel" "NotifChannel" NOT NULL DEFAULT 'EMAIL',
    "recipient" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryStatus" "NotifStatus" NOT NULL,
    "gatewayMessageId" TEXT,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingKpiSnapshot" (
    "date" TEXT NOT NULL,
    "activeWOs" INTEGER NOT NULL,
    "completedToday" INTEGER NOT NULL,
    "delayed" INTEGER NOT NULL,
    "atRisk" INTEGER NOT NULL,
    "onHold" INTEGER NOT NULL,

    CONSTRAINT "ManufacturingKpiSnapshot_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "FinanceKpiSnapshot" (
    "date" TEXT NOT NULL,
    "cashBank" DECIMAL(65,30) NOT NULL,
    "overdueReceivables" DECIMAL(65,30) NOT NULL,
    "revenueMtd" DECIMAL(65,30) NOT NULL,
    "gstLiability" DECIMAL(65,30) NOT NULL,
    "payablesDue7d" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "FinanceKpiSnapshot_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "ProcurementKpiSnapshot" (
    "date" TEXT NOT NULL,
    "prsPending" INTEGER NOT NULL,
    "openPOs" INTEGER NOT NULL,
    "overduePOs" INTEGER NOT NULL,
    "criticalStock" INTEGER NOT NULL,
    "spendMtd" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "ProcurementKpiSnapshot_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "FinanceSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultGmTarget" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "gmTargetByEntity" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "FinanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmcContract" (
    "id" TEXT NOT NULL,
    "contractReferenceNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "contractValue" DECIMAL(65,30) NOT NULL,
    "visitsIncluded" INTEGER NOT NULL,
    "partsCoverage" "PartsCoverage" NOT NULL,
    "scopeOfServices" TEXT,
    "exclusions" TEXT,
    "renewalStatus" "RenewalStatus" NOT NULL DEFAULT 'ACTIVE',
    "owningAsmId" TEXT,
    "previousContractId" TEXT,
    "signedAgreementUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmcContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmcScheduledVisit" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "visitSeqNo" INTEGER NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "notes" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'SCHEDULED_PENDING',
    "linkedTicketId" TEXT,
    "actualDate" TIMESTAMP(3),

    CONSTRAINT "AmcScheduledVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "quotationNo" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "amcContractId" TEXT,
    "quotationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "labourCharges" DECIMAL(65,30),
    "subtotal" DECIMAL(65,30),
    "taxAmount" DECIMAL(65,30),
    "grandTotal" DECIMAL(65,30),
    "notesToCustomer" TEXT,
    "termsAndConditions" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "customerPoNumber" TEXT,
    "customerPoDate" TIMESTAMP(3),
    "customerPoDocUrl" TEXT,
    "erpnextQuotationId" TEXT,
    "erpnextSalesOrderId" TEXT,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "erpnextDeliveryNoteId" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "trackingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "syncType" "SyncType" NOT NULL,
    "entity" TEXT NOT NULL,
    "erpDoctype" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "errorMessage" TEXT,
    "payload" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_erpnextUserId_key" ON "User"("erpnextUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_erpnextCustomerId_key" ON "Customer"("erpnextCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_serialNo_key" ON "Equipment"("serialNo");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketNo_key" ON "Ticket"("ticketNo");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_slaResolutionDue_idx" ON "Ticket"("slaResolutionDue");

-- CreateIndex
CREATE INDEX "Ticket_assignedAsmId_idx" ON "Ticket"("assignedAsmId");

-- CreateIndex
CREATE INDEX "Ticket_assignedEngineerId_idx" ON "Ticket"("assignedEngineerId");

-- CreateIndex
CREATE INDEX "TicketAuditLog_ticketId_idx" ON "TicketAuditLog"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldServiceVisit_visitNo_key" ON "FieldServiceVisit"("visitNo");

-- CreateIndex
CREATE UNIQUE INDEX "AmcContract_contractReferenceNo_key" ON "AmcContract"("contractReferenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quotationNo_key" ON "Quotation"("quotationNo");

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRegion" ADD CONSTRAINT "UserRegion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSite" ADD CONSTRAINT "CustomerSite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CustomerSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "CustomerSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedAsmId_fkey" FOREIGN KEY ("assignedAsmId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedEngineerId_fkey" FOREIGN KEY ("assignedEngineerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAuditLog" ADD CONSTRAINT "TicketAuditLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldServiceVisit" ADD CONSTRAINT "FieldServiceVisit_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldServiceVisit" ADD CONSTRAINT "FieldServiceVisit_engineerId_fkey" FOREIGN KEY ("engineerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FsvPartConsumed" ADD CONSTRAINT "FsvPartConsumed_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "FieldServiceVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FsvPhoto" ADD CONSTRAINT "FsvPhoto_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "FieldServiceVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmcScheduledVisit" ADD CONSTRAINT "AmcScheduledVisit_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "AmcContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_amcContractId_fkey" FOREIGN KEY ("amcContractId") REFERENCES "AmcContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

