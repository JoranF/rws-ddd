import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class StelDiagnoseDto {
  @IsString()
  @IsNotEmpty()
  kunstwerkId: string;

  @IsString()
  @IsOptional()
  incidentId?: string;

  @IsString()
  @IsNotEmpty()
  bevinding: string;

  @IsString()
  @IsNotEmpty()
  ernst: string;
}

export class StartOnderhoudDto {
  @IsString()
  @IsNotEmpty()
  datum: string;
}

export class RegistreerInspectieDto {
  @IsString()
  @IsNotEmpty()
  datum: string;

  @IsIn(['Goedgekeurd', 'Afgekeurd'])
  oordeel: 'Goedgekeurd' | 'Afgekeurd';

  @IsString()
  @IsOptional()
  opmerkingen?: string;
}

export class RondAfDto {
  @IsString()
  @IsNotEmpty()
  resultaat: string;

  @IsString()
  @IsNotEmpty()
  datum: string;
}

export class OntvangFactuurDto {
  @IsNumber()
  bedragEuro: number;

  @IsString()
  @IsNotEmpty()
  ontvangenOp: string;
}
