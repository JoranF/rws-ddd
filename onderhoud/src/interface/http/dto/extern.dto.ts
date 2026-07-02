import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class ExterneFactuurDto {
  @IsString()
  @IsNotEmpty()
  invoiceNumber: string;

  @IsString()
  @IsNotEmpty()
  workOrderRef: string;

  @IsInt()
  totalExVatCents: number;

  @IsInt()
  vatCents: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsString()
  @IsNotEmpty()
  issuedAt: string;
}

export class ContractaanvraagDto {
  @IsString()
  @IsNotEmpty()
  kunstwerkId: string;

  @IsString()
  @IsNotEmpty()
  aanleiding: string;
}
