import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { MeldStoring } from '../../application/storing/meld-storing';
import { STORING_REPOSITORY, type StoringRepository } from '../../domain/repositories';
import { MeldStoringDto } from './dto/meld-storing.dto';

@Controller('storingen')
export class StoringController {
  constructor(
    private readonly meldStoring: MeldStoring,
    @Inject(STORING_REPOSITORY) private readonly storingen: StoringRepository,
  ) {}

  @Post()
  async meld(@Body() dto: MeldStoringDto) {
    return this.meldStoring.uitvoeren(dto);
  }

  @Get()
  async lijst() {
    const storingen = await this.storingen.zoekAlle();
    return storingen.map((s) => ({
      storingId: s.id.waarde,
      kunstwerkId: s.kunstwerkId.waarde,
      omschrijving: s.omschrijving,
      ernst: s.ernst,
      status: s.status,
      onderhoudId: s.onderhoudId?.waarde ?? null,
    }));
  }
}
