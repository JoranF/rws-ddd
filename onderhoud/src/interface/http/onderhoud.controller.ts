import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StelDiagnose } from '../../application/diagnose/stel-diagnose';
import { StartOnderhoud } from '../../application/onderhoud/start-onderhoud';
import { RegistreerInspectie } from '../../application/onderhoud/registreer-inspectie';
import { RondOnderhoudAf } from '../../application/onderhoud/rond-onderhoud-af';
import { OntvangFactuur } from '../../application/onderhoud/ontvang-factuur';
import { KeurFactuurGoed } from '../../application/onderhoud/keur-factuur-goed';
import { ONDERHOUD_REPOSITORY, type OnderhoudRepository } from '../../domain/repositories';
import { OnderhoudId } from '../../domain/gedeeld/waarden';
import type { Onderhoud } from '../../domain/onderhoud/onderhoud';
import { OntvangFactuurDto, RegistreerInspectieDto, RondAfDto, StartOnderhoudDto, StelDiagnoseDto } from './dto/onderhoud.dto';

function naarDto(o: Onderhoud) {
  return {
    onderhoudId: o.id.waarde,
    kunstwerkId: o.kunstwerkId.waarde,
    status: o.status,
    aanleiding: o.aanleiding.soort,
    contractId: o.contractId?.waarde ?? null,
    gestartOp: o.gestartOp?.toISOString() ?? null,
    afgerondOp: o.afgerondOp?.toISOString() ?? null,
    resultaat: o.resultaat ?? null,
    inspecties: o.inspecties.map((i) => ({ inspectieId: i.id.waarde, datum: i.datum.toISOString(), oordeel: i.oordeel, opmerkingen: i.opmerkingen ?? null })),
    facturen: o.facturen.map((f) => ({ factuurId: f.id.waarde, bedragEuro: f.bedrag.euro, status: f.status, ontvangenOp: f.ontvangenOp.toISOString() })),
  };
}

@Controller()
export class OnderhoudController {
  constructor(
    private readonly stelDiagnose: StelDiagnose,
    private readonly start: StartOnderhoud,
    private readonly inspecteer: RegistreerInspectie,
    private readonly rondAf: RondOnderhoudAf,
    private readonly ontvangFactuur: OntvangFactuur,
    private readonly keurFactuurGoed: KeurFactuurGoed,
    @Inject(ONDERHOUD_REPOSITORY) private readonly onderhouden: OnderhoudRepository,
  ) {}

  @Post('diagnoses')
  async diagnose(@Body() dto: StelDiagnoseDto, @Res({ passthrough: true }) res: Response) {
    const uitkomst = await this.stelDiagnose.uitvoeren(dto);
    res.status(uitkomst.onderhoudId ? 201 : 200);
    return uitkomst;
  }

  @Get('onderhoud')
  async lijst() {
    return (await this.onderhouden.zoekAlle()).map(naarDto);
  }

  @Get('onderhoud/:id')
  async detail(@Param('id') id: string) {
    const traject = await this.onderhouden.zoek(OnderhoudId.van(id));
    if (!traject) throw new NotFoundException({ fout: 'onderhoudstraject niet gevonden' });
    return naarDto(traject);
  }

  @Post('onderhoud/:id/start')
  @HttpCode(200)
  async startTraject(@Param('id') id: string, @Body() dto: StartOnderhoudDto) {
    await this.start.uitvoeren({ onderhoudId: id, datum: dto.datum });
    return { status: 'Gestart' };
  }

  @Post('onderhoud/:id/inspecties')
  async inspectie(@Param('id') id: string, @Body() dto: RegistreerInspectieDto) {
    await this.inspecteer.uitvoeren({ onderhoudId: id, ...dto });
    return { status: 'Geregistreerd' };
  }

  @Post('onderhoud/:id/afronden')
  @HttpCode(200)
  async afronden(@Param('id') id: string, @Body() dto: RondAfDto) {
    await this.rondAf.uitvoeren({ onderhoudId: id, ...dto });
    return { status: 'Afgerond' };
  }

  @Post('onderhoud/:id/facturen')
  async factuur(@Param('id') id: string, @Body() dto: OntvangFactuurDto) {
    return this.ontvangFactuur.uitvoeren({ onderhoudId: id, ...dto });
  }

  @Post('onderhoud/:id/facturen/:factuurId/goedkeuring')
  @HttpCode(200)
  async keurGoed(@Param('id') id: string, @Param('factuurId') factuurId: string) {
    await this.keurFactuurGoed.uitvoeren({ onderhoudId: id, factuurId });
    return { status: 'Goedgekeurd' };
  }
}
