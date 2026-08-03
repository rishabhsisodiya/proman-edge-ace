import { IsInt, Min } from 'class-validator';

export class UpdateAmcEngineSettingsDto {
  @IsInt()
  @Min(1)
  lookAheadDays!: number;
}
