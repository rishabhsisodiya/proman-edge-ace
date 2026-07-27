import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import * as path from 'path';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AmcContractService } from './amc-contract.service';
import { CreateAmcContractDto, UpdateAmcContractDto } from './dto/amc-contract.dto';

const AMC_DOCUMENT_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'amc-documents');
const ALLOWED_DOCUMENT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);

@UseGuards(JwtAuthGuard)
@Controller('amc-contracts')
export class AmcContractController {
  constructor(private readonly amc: AmcContractService) {}

  @Get()
  list(@Query('customerId') customerId?: string) {
    return this.amc.list(customerId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.amc.findOne(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() dto: CreateAmcContractDto) {
    return this.amc.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAmcContractDto) {
    return this.amc.update(id, dto);
  }

  /** Uploaded contract document (2026-07-27) — client request, "Add AMC contract option (upload contract option)". */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post(':id/document/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: AMC_DOCUMENT_UPLOAD_DIR,
        filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
          cb(new BadRequestException('Contract document must be a JPEG, PNG, or PDF file'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadDocument(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = `${req.protocol}://${req.get('host')}/uploads/amc-documents/${file.filename}`;
    return this.amc.uploadDocument(id, url);
  }
}
