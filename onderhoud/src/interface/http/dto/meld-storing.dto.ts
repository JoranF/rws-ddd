import { IsNotEmpty, IsString } from 'class-validator';

export class MeldStoringDto {
  @IsString()
  @IsNotEmpty()
  kunstwerkId: string;

  @IsString()
  @IsNotEmpty()
  omschrijving: string;

  @IsString()
  @IsNotEmpty()
  ernst: string;
}
