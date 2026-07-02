export class DomeinFout extends Error {
  constructor(bericht: string) {
    super(bericht);
    this.name = 'DomeinFout';
  }
}
