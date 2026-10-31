import { compile } from '../pipeline';

export const codes = (src: string) => compile(src).diagnostics.map((d) => d.code);
export const errorCodes = (src: string) =>
  compile(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

export const SAMPLE = `BOARD Jahangirpuri ON Yellow;
VIA Kashmere Gate;
CHANGE Violet AT Kashmere Gate;
VIA Mandi House;
EXIT Central Secretariat;`;
