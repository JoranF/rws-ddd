import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application/application.module';
import { InfrastructureModule } from '../infrastructure.module';
import { ConsumersService } from './consumers.service';

@Module({
  imports: [ApplicationModule, InfrastructureModule],
  providers: [ConsumersService],
})
export class ConsumersModule {}
