import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { MaakSchema } from '../../application/schema/maak-schema';
import { SCHEMA_REPOSITORY, type SchemaRepository } from '../../domain/repositories';
import { MaakSchemaDto } from './dto/schema.dto';

@Controller('schemas')
export class SchemaController {
  constructor(
    private readonly maakSchema: MaakSchema,
    @Inject(SCHEMA_REPOSITORY) private readonly schemas: SchemaRepository,
  ) {}

  @Post()
  async maak(@Body() dto: MaakSchemaDto) {
    return this.maakSchema.uitvoeren(dto);
  }

  @Get()
  async lijst() {
    return (await this.schemas.zoekAlle()).map((s) => ({
      schemaId: s.id.waarde,
      kunstwerkId: s.kunstwerkId.waarde,
      contractId: s.contractId.waarde,
      aannemer: s.aannemer,
      periodeStart: s.periode.start.toISOString(),
      periodeEind: s.periode.eind.toISOString(),
      momenten: s.momenten.map((m) => ({ datum: m.datum.toISOString(), omschrijving: m.omschrijving })),
    }));
  }
}
