/**
 * Gerador vetorial puro (SVG) de códigos de barras padrão comercial (EAN-13, EAN-8, UPC-A e Code 128).
 * Utiliza exclusivamente o código de barras real cadastrado no produto — nunca inventa ou modifica dígitos.
 */

export type BarcodeFormat = 'EAN13' | 'EAN8' | 'UPCA' | 'CODE128';

export interface BarcodeBar {
  x: number;
  width: number;
  isGuard?: boolean;
}

export interface EncodedBarcode {
  format: BarcodeFormat;
  value: string;
  bars: BarcodeBar[];
  totalModules: number;
  quietZoneLeft: number;
  quietZoneRight: number;
}

const EAN_L_CODES = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];

const EAN_G_CODES = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
];

const EAN_R_CODES = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
];

const EAN13_PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

// Tabela oficial ISO/IEC 15417 Code 128 (valores 0..106)
// Cada string representa larguras alternadas de barra/espaço (soma = 11 módulos; Stop 106 = 13 módulos)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131',
  '211412', // 103: Start A
  '211214', // 104: Start B
  '211232', // 105: Start C
  '2331112', // 106: Stop
];

const INVALID_BARCODE_PLACEHOLDERS = new Set([
  '-',
  '--',
  'n/a',
  'na',
  'null',
  'undefined',
  'sem codigo',
  'sem código',
  'sem codigo de barras',
  'sem código de barras',
  'sem gtin',
  's/n',
  'sn',
]);

/**
 * Normaliza e verifica se o código de barras cadastrado é real e apto para renderização.
 * Rejeita valores vazios, placeholders textuais ou strings compostas apenas por zeros.
 */
export function normalizeValidBarcode(rawBarcode?: string | null): string | null {
  if (!rawBarcode) return null;
  const trimmed = rawBarcode.trim();
  if (trimmed.length < 3 || trimmed.length > 32) return null;
  if (INVALID_BARCODE_PLACEHOLDERS.has(trimmed.toLowerCase())) return null;
  if (/^0+$/.test(trimmed)) return null;

  // Exige apenas caracteres ASCII imprimíveis (32..126) para compatibilidade com leitores
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 32 || code > 126) {
      return null;
    }
  }
  return trimmed;
}

function isValidEan13CheckDigit(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(code[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(code[12]);
}

function isValidEan8CheckDigit(code: string): boolean {
  if (!/^\d{8}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const digit = Number(code[i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(code[7]);
}

function isValidUpcACheckDigit(code: string): boolean {
  if (!/^\d{12}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = Number(code[i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(code[11]);
}

function binaryToBars(
  bits: string,
  offsetX: number,
  guardRanges: Array<[number, number]> = []
): BarcodeBar[] {
  const bars: BarcodeBar[] = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      const start = i;
      while (i < bits.length && bits[i] === '1') {
        i++;
      }
      const isGuard = guardRanges.some(([gStart, gEnd]) => start >= gStart && i <= gEnd);
      bars.push({
        x: offsetX + start,
        width: i - start,
        isGuard,
      });
    } else {
      i++;
    }
  }
  return bars;
}

function encodeEan13(code: string): EncodedBarcode {
  const firstDigit = Number(code[0]);
  const parity = EAN13_PARITY[firstDigit];
  let bits = '101'; // Guarda inicial (0..3)

  for (let i = 0; i < 6; i++) {
    const d = Number(code[i + 1]);
    bits += parity[i] === 'L' ? EAN_L_CODES[d] : EAN_G_CODES[d];
  }

  bits += '01010'; // Guarda central (45..50)

  for (let i = 7; i < 13; i++) {
    const d = Number(code[i]);
    bits += EAN_R_CODES[d];
  }

  bits += '101'; // Guarda final (92..95)

  const quietZoneLeft = 11;
  const quietZoneRight = 7;
  const bars = binaryToBars(bits, quietZoneLeft, [
    [0, 3],
    [45, 50],
    [92, 95],
  ]);

  return {
    format: 'EAN13',
    value: code,
    bars,
    totalModules: quietZoneLeft + bits.length + quietZoneRight,
    quietZoneLeft,
    quietZoneRight,
  };
}

function encodeEan8(code: string): EncodedBarcode {
  let bits = '101'; // Guarda inicial (0..3)
  for (let i = 0; i < 4; i++) {
    bits += EAN_L_CODES[Number(code[i])];
  }
  bits += '01010'; // Guarda central (31..36)
  for (let i = 4; i < 8; i++) {
    bits += EAN_R_CODES[Number(code[i])];
  }
  bits += '101'; // Guarda final (64..67)

  const quietZoneLeft = 7;
  const quietZoneRight = 7;
  const bars = binaryToBars(bits, quietZoneLeft, [
    [0, 3],
    [31, 36],
    [64, 67],
  ]);

  return {
    format: 'EAN8',
    value: code,
    bars,
    totalModules: quietZoneLeft + bits.length + quietZoneRight,
    quietZoneLeft,
    quietZoneRight,
  };
}

function encodeUpcA(code: string): EncodedBarcode {
  let bits = '101'; // Guarda inicial (0..3)
  for (let i = 0; i < 6; i++) {
    bits += EAN_L_CODES[Number(code[i])];
  }
  bits += '01010'; // Guarda central (45..50)
  for (let i = 6; i < 12; i++) {
    bits += EAN_R_CODES[Number(code[i])];
  }
  bits += '101'; // Guarda final (92..95)

  const quietZoneLeft = 9;
  const quietZoneRight = 9;
  const bars = binaryToBars(bits, quietZoneLeft, [
    [0, 3],
    [45, 50],
    [92, 95],
  ]);

  return {
    format: 'UPCA',
    value: code,
    bars,
    totalModules: quietZoneLeft + bits.length + quietZoneRight,
    quietZoneLeft,
    quietZoneRight,
  };
}

function encodeCode128(value: string): EncodedBarcode {
  const codes: number[] = [];
  const isAllDigits = /^\d+$/.test(value);

  if (isAllDigits && value.length >= 4 && value.length % 2 === 0) {
    // Code 128C puro para códigos numéricos pares: metade da largura e maior legibilidade
    codes.push(105); // Start C
    for (let i = 0; i < value.length; i += 2) {
      codes.push(Number(value.slice(i, i + 2)));
    }
  } else {
    // Code 128B com alternância automática para C em sequências de >= 4 dígitos
    let mode: 'B' | 'C' = 'B';
    codes.push(104); // Start B

    let i = 0;
    while (i < value.length) {
      if (mode === 'B') {
        const digitMatch = value.slice(i).match(/^\d+/);
        const digitRun = digitMatch ? digitMatch[0].length : 0;
        if (digitRun >= 4 && (digitRun % 2 === 0 || i + digitRun < value.length)) {
          const usablePairs = Math.floor(digitRun / 2);
          if (usablePairs >= 2) {
            codes.push(99); // Code C latch
            mode = 'C';
            continue;
          }
        }
        codes.push(value.charCodeAt(i) - 32);
        i++;
      } else {
        if (i + 2 <= value.length && /^\d{2}$/.test(value.slice(i, i + 2))) {
          codes.push(Number(value.slice(i, i + 2)));
          i += 2;
        } else {
          codes.push(100); // Code B latch
          mode = 'B';
        }
      }
    }
  }

  // Cálculo do dígito verificador Módulo 103
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) {
    checksum += codes[i] * i;
  }
  codes.push(checksum % 103);
  codes.push(106); // Stop

  const quietZoneLeft = 10;
  const quietZoneRight = 10;
  const bars: BarcodeBar[] = [];
  let cursor = quietZoneLeft;

  for (const sym of codes) {
    const pattern = CODE128_PATTERNS[sym];
    for (let p = 0; p < pattern.length; p++) {
      const width = Number(pattern[p]);
      if (p % 2 === 0) {
        bars.push({ x: cursor, width });
      }
      cursor += width;
    }
  }

  return {
    format: 'CODE128',
    value,
    bars,
    totalModules: cursor + quietZoneRight,
    quietZoneLeft,
    quietZoneRight,
  };
}

/**
 * Codifica o código de barras real do produto no formato padrão mais adequado
 * (EAN-13, EAN-8, UPC-A ou Code 128). Retorna null se inexistente ou inválido.
 */
export function encodeProductBarcode(rawBarcode?: string | null): EncodedBarcode | null {
  const valid = normalizeValidBarcode(rawBarcode);
  if (!valid) return null;

  if (isValidEan13CheckDigit(valid)) {
    return encodeEan13(valid);
  }
  if (isValidEan8CheckDigit(valid)) {
    return encodeEan8(valid);
  }
  if (isValidUpcACheckDigit(valid)) {
    return encodeUpcA(valid);
  }
  return encodeCode128(valid);
}
