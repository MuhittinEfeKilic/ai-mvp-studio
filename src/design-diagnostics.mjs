import fs from 'node:fs';
import path from 'node:path';

import { DESIGN_TOKENS_PATH } from './design-tokens.mjs';
import { maskNonCode } from './app-completeness.mjs';

/**
 * Deterministic measurement of whether the design contract reached the code.
 *
 * Why this exists, and what it deliberately does not do. Two accepted MVPs were
 * measured after the fact: both had a real token file and a real signature
 * widget, and both shipped with zero shadows, zero gradients, zero drawn shapes
 * and one animation between them. The contract existed and nothing used it. So
 * the question worth asking mechanically is not "is this beautiful" — code
 * cannot answer that — but **"was the design that was agreed actually built?"**
 *
 * It is NOT a gate and it NEVER feeds a repair round. That restraint is the whole
 * design: a scan that blocked, or that a repair agent was told to satisfy, would
 * be optimised against. The pipeline would learn to add a meaningless gradient to
 * clear the check and we would have traded bland for decorated. Reporting keeps
 * the finding in front of a human and an agent that is already writing the screen,
 * without making the number the goal.
 *
 * Every check compares code against the project's own declared tokens, so there
 * is no house style to conform to and nothing to game by adding ornament.
 */

export const DESIGN_REPORT_PATH = 'DESIGN_REPORT.json';
export const PRODUCTION_ROOT = 'lib';

// Where the contract is legitimately turned into Flutter values. Literal colours
// belong here and nowhere else.
const THEME_PATH = /(^|\/)(app\/)?theme(\/|\.dart$)/;

// Case matters on the identifier and not on the hex digits. A single `i` flag
// over both alternatives made `Colors` case-insensitive too, so a local variable
// named `colors` — exactly what a theme extension is called — was counted as a
// hard-coded colour. The first real run reported 12 leaked colours that were all
// `colors.<role>` reads from the theme, i.e. the correct pattern being punished.
const COLOR_LITERAL = /\bColor\(\s*0[xX][0-9a-fA-F]{6,8}\s*\)|\bColors\.[a-z]\w*/g;
const DEPTH_USE = /\belevation\s*:|\bBoxShadow\b|\bshadowColor\s*:/g;
const MOTION_USE = /\bDuration\s*\(|\bAnimated[A-Z]\w*|\.animate\(/g;
const RADIUS_USE = /\bBorderRadius\b|\bRoundedRectangleBorder\b|\bborderRadius\s*:/g;
const SHAPE_USE = /\bCustomPaint\b|\bCustomPainter\b|\bgradient\s*:|\w*Gradient\s*\(|\bClipPath\b/g;
const TEXT_STYLE_USE = /\bTextStyle\s*\(|\btextTheme\b|\bTextTheme\s*\(/g;

function listDartFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      // Generated files are not authored design decisions.
      else if (entry.name.endsWith('.dart') && !/\.(g|freezed)\.dart$/.test(entry.name)) {
        files.push(absolute);
      }
    }
  };
  walk(root);
  return files.sort();
}

const countOf = (source, pattern) => (source.match(pattern) || []).length;

/**
 * Reads the generated production sources once and returns the raw counts every
 * check is derived from. Comments and string literals are masked out, so a colour
 * named in a doc comment is not mistaken for a hard-coded value.
 */
export function measureDesignUsage(workspace) {
  const files = listDartFiles(path.join(workspace, PRODUCTION_ROOT));
  const usage = {
    scanned_files: files.length,
    depth: 0,
    motion: 0,
    radius: 0,
    shape: 0,
    text_style: 0,
    hardcoded_colors: 0,
    hardcoded_color_files: [],
  };
  for (const absolute of files) {
    const relative = path.relative(workspace, absolute).replaceAll('\\', '/');
    const code = maskNonCode(fs.readFileSync(absolute, 'utf8'));
    usage.depth += countOf(code, DEPTH_USE);
    usage.motion += countOf(code, MOTION_USE);
    usage.radius += countOf(code, RADIUS_USE);
    usage.shape += countOf(code, SHAPE_USE);
    usage.text_style += countOf(code, TEXT_STYLE_USE);
    // The theme is where the contract becomes Flutter values, so literals there
    // are the point rather than a leak.
    if (THEME_PATH.test(relative.slice(PRODUCTION_ROOT.length + 1))) continue;
    const literals = countOf(code, COLOR_LITERAL);
    if (literals) {
      usage.hardcoded_colors += literals;
      usage.hardcoded_color_files.push({ file: relative, count: literals });
    }
  }
  usage.hardcoded_color_files.sort((left, right) => right.count - left.count);
  return usage;
}

const finding = (id, severity, summary, details, evidence = null) => ({
  id, severity, summary, details, ...(evidence === null ? {} : { evidence }),
});

/**
 * @param {object} usage from measureDesignUsage
 * @param {object|null} tokens the validated DESIGN_TOKENS.json, or null when the
 *   project predates the contract — then nothing is claimed about adherence.
 */
export function evaluateDesignChecks(usage, tokens = null) {
  const findings = [];

  if (!tokens) {
    findings.push(finding(
      'no_design_contract', 'info', 'Tasarım sözleşmesi yok',
      `${DESIGN_TOKENS_PATH} bulunmadığı için uyum ölçülmedi. Sözleşmeden önce üretilmiş `
      + 'bir proje eksik gösterilmez.',
    ));
    return findings;
  }

  // The core question: is the contract referenced, or is it decoration?
  if (tokens.elevation.some(value => value > 0) && usage.depth === 0) {
    findings.push(finding(
      'depth_unused', 'warning', 'Yükseklik ölçeği tanımlı ama hiç kullanılmıyor',
      `Sözleşme ${tokens.elevation.length} kademeli bir elevation ölçeği tanımlıyor, `
      + 'ama üretilen kaynakta tek bir elevation/BoxShadow kullanımı yok: her yüzey düz.',
      { declared: tokens.elevation, used: usage.depth },
    ));
  }

  const durations = Object.values(tokens.motion).filter(Number.isFinite);
  if (durations.length && usage.motion === 0) {
    findings.push(finding(
      'motion_unused', 'warning', 'Hareket süreleri tanımlı ama hiç kullanılmıyor',
      'Sözleşme animasyon süreleri tanımlıyor, ama üretilen kaynakta Duration veya '
      + 'Animated* kullanımı yok: hiçbir durum değişimi animasyonlanmıyor.',
      { declared: tokens.motion, used: usage.motion },
    ));
  }

  if (tokens.radius.length && usage.radius === 0) {
    findings.push(finding(
      'radius_unused', 'warning', 'Köşe ölçeği tanımlı ama hiç kullanılmıyor',
      'Sözleşme köşe yarıçapları tanımlıyor, ama üretilen kaynakta BorderRadius kullanımı yok.',
      { declared: tokens.radius, used: usage.radius },
    ));
  }

  if (usage.text_style === 0) {
    findings.push(finding(
      'typography_unused', 'warning', 'Tipografi rampası koda hiç yansımamış',
      `Sözleşme ${tokens.typography.length} tipografi rolü tanımlıyor, ama üretilen `
      + 'kaynakta TextStyle veya textTheme kullanımı yok.',
      { declared: tokens.typography.length, used: usage.text_style },
    ));
  }

  // Token drift: a literal outside the theme is a value the contract already named.
  if (usage.hardcoded_colors > 0) {
    findings.push(finding(
      'hardcoded_color', 'warning', 'Tema dışında sabit renk yazılmış',
      `${usage.hardcoded_colors} sabit renk değeri tema dizini dışında kullanılmış. `
      + 'Sözleşmede adı olan bir değer koda gömülünce tema değişse bile ekran değişmez.',
      usage.hardcoded_color_files.slice(0, 10),
    ));
  }

  // Recorded facts, no judgement: these are the numbers a later run is compared to.
  findings.push(finding(
    'usage_counts', 'info', 'Ölçülen kullanım',
    `dosya ${usage.scanned_files} · derinlik ${usage.depth} · hareket ${usage.motion} · `
    + `köşe ${usage.radius} · çizim/gradient ${usage.shape} · tipografi ${usage.text_style}`,
    usage,
  ));

  return findings;
}

/**
 * Not a gate. Returns findings and a status that describes the measurement, never
 * a verdict the pipeline acts on.
 */
export function runDesignDiagnostics({ workspace, tokens = null }) {
  const usage = measureDesignUsage(workspace);
  const findings = evaluateDesignChecks(usage, tokens);
  const warnings = findings.filter(item => item.severity === 'warning');
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    gate: false,
    contract: tokens
      ? { font_family: tokens.font_family, signature_element: tokens.signature_element.name }
      : null,
    usage,
    findings,
    warnings,
    status: tokens ? (warnings.length ? 'DRIFT' : 'APPLIED') : 'UNMEASURED',
  };
}

export function renderDesignReportJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function writeDesignReport(workspace, report) {
  fs.writeFileSync(path.join(workspace, DESIGN_REPORT_PATH), renderDesignReportJson(report), 'utf8');
  return report;
}
