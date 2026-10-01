import fs from 'node:fs';
import path from 'node:path';

/**
 * The machine-readable half of the design system.
 *
 * `UX_SPEC.md` describes the design in prose, which nothing downstream can check.
 * Measured consequence: two accepted MVPs shipped with a real token file and a
 * real signature widget, and also with the platform default font, zero assets,
 * zero shadows, zero gradients and one animation between them — a correct app
 * with no visual identity. Prose could not be enforced, so it was advice.
 *
 * This file is a contract in the same sense as `TASK_PLAN.json`: an agent writes
 * it, the shape is checked mechanically, and a violation is re-requested once
 * with reasons. The checks are deliberately the ones a machine can defend —
 * present roles, parseable colours, real contrast ratios, an ordered scale — and
 * never "does this look good", which is not a question code can answer.
 */

export const DESIGN_TOKENS_PATH = 'DESIGN_TOKENS.json';

/** Roles every theme must define, in both light and dark. */
export const REQUIRED_COLOR_ROLES = Object.freeze([
  'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'primary', 'onPrimary', 'error', 'onError', 'outline',
]);

/**
 * Foreground/background pairs and the ratio each must reach. WCAG AA is 4.5:1
 * for body text and 3:1 for non-text boundaries, so the outline is held to the
 * lower bar and everything a user reads to the higher one.
 */
export const CONTRAST_REQUIREMENTS = Object.freeze([
  { foreground: 'onSurface', background: 'surface', minimum: 4.5 },
  { foreground: 'onSurfaceVariant', background: 'surfaceVariant', minimum: 4.5 },
  { foreground: 'onPrimary', background: 'primary', minimum: 4.5 },
  { foreground: 'onError', background: 'error', minimum: 4.5 },
  { foreground: 'outline', background: 'surface', minimum: 3 },
]);

const MIN_TYPOGRAPHY_ROLES = 5;
const MIN_DISTINCT_WEIGHTS = 3;

/**
 * Why the scale carries the identity and the family does not.
 *
 * The product contract forbids the INTERNET permission, `google_fonts` fetches
 * faces at runtime, and the agent sandbox runs with no network — so no agent can
 * obtain a font file. A `font_family` requirement on its own is therefore
 * satisfied by writing "Roboto" and changes nothing anyone can see.
 *
 * So the family is recorded as a stated decision, and the enforced part is what
 * is actually reachable offline and is where most of the perceived quality lives:
 * a real size ramp, a deliberate line height, deliberate letter spacing and more
 * than one weight.
 */
const HEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function parseHexColor(value) {
  const text = String(value ?? '').trim();
  if (!HEX.test(text)) return null;
  // An 8-digit value is #AARRGGBB, the form Flutter writes; the alpha channel
  // says nothing about contrast, so only the colour part is read.
  const digits = text.slice(1).length === 8 ? text.slice(3) : text.slice(1);
  return {
    r: Number.parseInt(digits.slice(0, 2), 16),
    g: Number.parseInt(digits.slice(2, 4), 16),
    b: Number.parseInt(digits.slice(4, 6), 16),
  };
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }) {
  const channel = value => {
    const ratio = value / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. Returns null when either colour is unreadable. */
export function contrastRatio(foreground, background) {
  const first = parseHexColor(foreground);
  const second = parseHexColor(background);
  if (!first || !second) return null;
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)]
    .sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

function tokenError(message) {
  const error = new Error(message);
  error.designTokens = true;
  return error;
}

function validateScheme(scheme, brightness, problems) {
  if (!scheme || typeof scheme !== 'object') {
    problems.push(`colors.${brightness} bir nesne olmalıdır.`);
    return;
  }
  for (const role of REQUIRED_COLOR_ROLES) {
    const value = scheme[role];
    if (value === undefined) {
      problems.push(`colors.${brightness}.${role} eksik.`);
    } else if (!parseHexColor(value)) {
      problems.push(`colors.${brightness}.${role} geçerli bir hex renk değil: ${JSON.stringify(value)}.`);
    }
  }
  for (const { foreground, background, minimum } of CONTRAST_REQUIREMENTS) {
    const ratio = contrastRatio(scheme[foreground], scheme[background]);
    if (ratio === null) continue;
    if (ratio < minimum) {
      problems.push(
        `colors.${brightness}: ${foreground} / ${background} kontrastı ${ratio.toFixed(2)}:1, `
        + `en az ${minimum}:1 olmalı.`,
      );
    }
  }
}

function validateTypography(roles, problems) {
  if (!Array.isArray(roles) || roles.length < MIN_TYPOGRAPHY_ROLES) {
    problems.push(`typography en az ${MIN_TYPOGRAPHY_ROLES} rol içermelidir.`);
    return;
  }
  const names = new Set();
  for (const entry of roles) {
    const name = String(entry?.role ?? '').trim();
    if (!name) { problems.push('typography girdilerinin her birinde `role` olmalıdır.'); continue; }
    if (names.has(name)) problems.push(`typography rolü tekrarlanmış: ${name}.`);
    names.add(name);
    if (!Number.isFinite(entry.size) || entry.size < 10 || entry.size > 96) {
      problems.push(`typography.${name}.size 10-96 arasında bir sayı olmalıdır.`);
    }
    if (!Number.isFinite(entry.weight) || entry.weight < 100 || entry.weight > 900) {
      problems.push(`typography.${name}.weight 100-900 arasında olmalıdır.`);
    }
    if (!Number.isFinite(entry.lineHeight) || entry.lineHeight < 1 || entry.lineHeight > 2) {
      problems.push(`typography.${name}.lineHeight 1.0-2.0 arasında bir sayı olmalıdır.`);
    }
    if (!Number.isFinite(entry.letterSpacing) || entry.letterSpacing < -2 || entry.letterSpacing > 4) {
      problems.push(`typography.${name}.letterSpacing -2 ile 4 arasında olmalıdır (0 da bir karardır).`);
    }
  }
  // A scale with one size repeated everywhere is not a scale.
  const sizes = new Set(roles.map(entry => entry?.size).filter(Number.isFinite));
  if (sizes.size < 3) problems.push('typography en az üç farklı boyut içermelidir.');
  // One weight everywhere reads as a single block of text whatever the sizes are.
  const weights = new Set(roles.map(entry => entry?.weight).filter(Number.isFinite));
  if (weights.size < MIN_DISTINCT_WEIGHTS) {
    problems.push(`typography en az ${MIN_DISTINCT_WEIGHTS} farklı ağırlık içermelidir.`);
  }
}

function validateScale(values, label, problems, { allowZeroFirst = false } = {}) {
  if (!Array.isArray(values) || values.length < 3) {
    problems.push(`${label} en az üç değerli bir dizi olmalıdır.`);
    return;
  }
  const numbers = values.filter(Number.isFinite);
  if (numbers.length !== values.length) {
    problems.push(`${label} yalnız sayı içermelidir.`);
    return;
  }
  const ascending = numbers.every((value, index) => index === 0 || value > numbers[index - 1]);
  if (!ascending) problems.push(`${label} artan sırada olmalıdır.`);
  if (allowZeroFirst ? numbers[0] < 0 : numbers[0] <= 0) {
    problems.push(allowZeroFirst
      ? `${label} negatif olamaz.`
      : `${label} sıfırdan büyük başlamalıdır.`);
  }
}

/**
 * @param {object} raw parsed DESIGN_TOKENS.json
 * @returns {object} the validated tokens
 * @throws when the contract is violated; the message lists every problem so the
 *   agent can fix them all in its single retry instead of one per round.
 */
export function validateDesignTokens(raw = {}) {
  const problems = [];

  const signature = raw.signature_element;
  const signatureName = String(signature?.name ?? '').trim();
  if (!signatureName) {
    problems.push('signature_element.name boş olamaz: ürüne özgü imza öğesi adlandırılmalıdır.');
  }
  if (String(signature?.description ?? '').trim().length < 20) {
    problems.push('signature_element.description imza öğesinin ne yaptığını anlatmalıdır (en az 20 karakter).');
  }
  // Where the element appears is the half the contract used to leave out. In the
  // first real run the signature widget was built on one screen only, and nothing
  // mechanical could tell: the reviewer found it and blocked a criterion. Naming
  // the surfaces makes the omission a contract violation instead of a judgement
  // call. Only the declaration is enforced — counting uses of the widget in code
  // would be trivially satisfied by adding one.
  if (!Array.isArray(signature?.surfaces) || signature.surfaces.length < 2) {
    problems.push(
      'signature_element.surfaces imza öğesinin göründüğü en az iki ekranı/yüzeyi saymalıdır '
      + '(örn. ["Bugün listesi", "Alışkanlık detayı"]).',
    );
  } else if (signature.surfaces.some(entry => String(entry ?? '').trim().length < 3)) {
    problems.push('signature_element.surfaces girdileri boş olamaz.');
  }

  if (!raw.colors || typeof raw.colors !== 'object') {
    problems.push('colors nesnesi light ve dark şemalarını içermelidir.');
  } else {
    validateScheme(raw.colors.light, 'light', problems);
    validateScheme(raw.colors.dark, 'dark', problems);
  }

  validateTypography(raw.typography, problems);
  validateScale(raw.spacing, 'spacing', problems);
  validateScale(raw.radius, 'radius', problems);
  // A flat surface is elevation 0, so the scale starts there rather than above it.
  validateScale(raw.elevation, 'elevation', problems, { allowZeroFirst: true });

  const motion = raw.motion;
  const durations = Object.values(motion ?? {}).filter(Number.isFinite);
  if (!motion || typeof motion !== 'object' || durations.length < 1) {
    problems.push('motion en az bir adlandırılmış süre içermelidir (ms).');
  } else if (durations.some(value => value < 50 || value > 1000)) {
    problems.push('motion süreleri 50-1000 ms arasında olmalıdır.');
  }

  const fontFamily = String(raw.font_family ?? '').trim();
  if (!fontFamily) {
    problems.push('font_family belirtilmelidir. Çevrimdışı ürün sözleşmesi nedeniyle '
      + 'platform ailesini (ör. "Roboto") açıkça adlandırmak geçerli bir karardır; '
      + 'boş bırakmak karar vermemektir.');
  }

  if (problems.length) {
    throw tokenError(`DESIGN_TOKENS.json sözleşmeye uymuyor:\n- ${problems.join('\n- ')}`);
  }

  return {
    version: 1,
    font_family: fontFamily,
    signature_element: {
      name: signatureName,
      description: String(signature.description).trim(),
      surfaces: signature.surfaces.map(entry => String(entry).trim()),
    },
    colors: { light: { ...raw.colors.light }, dark: { ...raw.colors.dark } },
    typography: raw.typography.map(entry => ({
      role: String(entry.role).trim(),
      size: entry.size,
      weight: entry.weight,
      lineHeight: entry.lineHeight,
      letterSpacing: entry.letterSpacing,
    })),
    spacing: [...raw.spacing],
    radius: [...raw.radius],
    elevation: [...raw.elevation],
    motion: { ...motion },
  };
}

export function readDesignTokens(workspace) {
  const filePath = path.join(workspace, DESIGN_TOKENS_PATH);
  return validateDesignTokens(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

export function designTokensExist(workspace) {
  return fs.existsSync(path.join(workspace, DESIGN_TOKENS_PATH));
}
