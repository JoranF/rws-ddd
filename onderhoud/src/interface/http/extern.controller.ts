import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { OntvangFactuur } from '../../application/onderhoud/ontvang-factuur';
import { DienContractaanvraagIn } from '../../application/contractaanvraag/dien-contractaanvraag-in';
import { vertaalExterneFactuur } from '../../infrastructure/acl/aannemer-factuur-vertaler';
import { ContractaanvraagDto, ExterneFactuurDto } from './dto/extern.dto';

@Controller()
export class ExternController {
  constructor(
    private readonly ontvangFactuur: OntvangFactuur,
    private readonly dienContractaanvraagIn: DienContractaanvraagIn,
  ) {}

  @Post('extern/facturen')
  async factuur(@Body() dto: ExterneFactuurDto) {
    const command = vertaalExterneFactuur(dto);
    return this.ontvangFactuur.uitvoeren(command);
  }

  @Post('contractaanvragen')
  @HttpCode(202)
  async contractaanvraag(@Body() dto: ContractaanvraagDto) {
    await this.dienContractaanvraagIn.uitvoeren(dto);
    return { status: 'Ingediend' };
  }
}
