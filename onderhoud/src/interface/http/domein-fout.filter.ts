import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomeinFout } from '../../domain/gedeeld/fouten';
import { AclFout } from '../../infrastructure/acl/aannemer-factuur-vertaler';

@Catch(DomeinFout, AclFout)
export class DomeinFoutFilter implements ExceptionFilter {
  catch(fout: DomeinFout | AclFout, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.BAD_REQUEST;
    if (fout instanceof AclFout) status = HttpStatus.UNPROCESSABLE_ENTITY;
    else if (fout.message.includes('niet gevonden')) status = HttpStatus.NOT_FOUND;
    response.status(status).json({ fout: fout.message });
  }
}
