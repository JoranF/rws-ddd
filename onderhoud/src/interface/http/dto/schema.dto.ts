import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class GeplandMomentDto {
  @IsString()
  @IsNotEmpty()
  datum: string;

  @IsString()
  @IsNotEmpty()
  omschrijving: string;
}

export class MaakSchemaDto {
  @IsString()
  @IsNotEmpty()
  kunstwerkId: string;

  @IsString()
  @IsNotEmpty()
  periodeStart: string;

  @IsString()
  @IsNotEmpty()
  periodeEind: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GeplandMomentDto)
  momenten: GeplandMomentDto[];
}
