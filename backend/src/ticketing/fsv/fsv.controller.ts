import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { FsvService } from './fsv.service';
import { AddFsvPartDto, AddFsvPhotoDto, CreateFsvDto, UpdateFsvDto } from './dto/fsv.dto';

const FSV_PHOTO_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'fsv-photos');
const ALLOWED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const FSV_SIGNATURE_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'fsv-signatures');
const ALLOWED_SIGNATURE_MIME_TYPES = new Set(['image/png']);

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FsvController {
  constructor(private readonly fsv: FsvService) {}

  @Get('tickets/:ticketId/fsv')
  listForTicket(@Param('ticketId') ticketId: string) {
    return this.fsv.listForTicket(ticketId);
  }

  @Roles('ENGINEER')
  @Post('tickets/:ticketId/fsv')
  createDraft(@Param('ticketId') ticketId: string, @Body() dto: CreateFsvDto, @Req() req: any) {
    return this.fsv.createDraft(ticketId, dto, { userId: req.user.userId, role: req.user.role });
  }

  @Get('fsv/:id')
  findOne(@Param('id') id: string) {
    return this.fsv.findOne(id);
  }

  @Roles('ENGINEER')
  @Patch('fsv/:id')
  update(@Param('id') id: string, @Body() dto: UpdateFsvDto) {
    return this.fsv.update(id, dto);
  }

  @Roles('ENGINEER')
  @Post('fsv/:id/parts')
  addPart(@Param('id') id: string, @Body() dto: AddFsvPartDto) {
    return this.fsv.addPart(id, dto);
  }

  @Roles('ENGINEER')
  @Delete('fsv/:id/parts/:partId')
  removePart(@Param('id') id: string, @Param('partId') partId: string) {
    return this.fsv.removePart(id, partId);
  }

  @Roles('ENGINEER')
  @Post('fsv/:id/photos')
  addPhoto(@Param('id') id: string, @Body() dto: AddFsvPhotoDto) {
    return this.fsv.addPhoto(id, dto);
  }

  @Roles('ENGINEER')
  @Post('fsv/:id/photos/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: FSV_PHOTO_UPLOAD_DIR,
        filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_PHOTO_MIME_TYPES.has(file.mimetype)) {
          cb(new BadRequestException('Only JPEG, PNG, WEBP, or HEIC/HEIF images are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption: string | undefined,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = `${req.protocol}://${req.get('host')}/uploads/fsv-photos/${file.filename}`;
    return this.fsv.addPhoto(id, { url, caption });
  }

  @Roles('ENGINEER')
  @Post('fsv/:id/signature/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: FSV_SIGNATURE_UPLOAD_DIR,
        filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || '.png'}`),
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_SIGNATURE_MIME_TYPES.has(file.mimetype)) {
          cb(new BadRequestException('Signature must be a PNG image'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadSignature(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = `${req.protocol}://${req.get('host')}/uploads/fsv-signatures/${file.filename}`;
    return this.fsv.setSignature(id, url);
  }

  @Roles('ENGINEER')
  @Post('fsv/:id/submit')
  submit(@Param('id') id: string, @Req() req: any) {
    return this.fsv.submit(id, { userId: req.user.userId, role: req.user.role });
  }
}
