import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTRAST_REQUIREMENTS, REQUIRED_COLOR_ROLES, contrastRatio, parseHexColor,
  relativeLuminance, validateDesignTokens,
} from '../src/design-tokens.mjs';

function scheme(overrides = {}) {
  return {
    surface: '#FFFFFF', onSurface: '#1A1C1E',
    surfaceVariant: '#E7E0EC', onSurfaceVariant: '#3A3A3C',
    primary: '#1B5E20', onPrimary: '#FFFFFF',
    error: '#B3261E', onError: '#FFFFFF',
    outline: '#6F6F70',
    ...overrides,
  };
}

function tokens(overrides = {}) {
  return {
    version: 1,
    font_family: 'Inter',
    signature_element: {
      name: 'Odak Şeridi',
      description: 'Her satırda kalan süreyi gösteren ince yatay şerit.',
      surfaces: ['Görev listesi', 'Görev detayı'],
    },
    colors: {
      light: scheme(),
      dark: scheme({
        surface: '#121316', onSurface: '#E3E2E6',
        surfaceVariant: '#2B2B2F', onSurfaceVariant: '#C9C8CC',
        primary: '#A6D8A8', onPrimary: '#0A2B0D',
        error: '#F2B8B5', onError: '#601410',
        outline: '#909094',
      }),
    },
    typography: [
      { role: 'display', size: 32, weight: 700, lineHeight: 1.15, letterSpacing: -0.5 },
      { role: 'title', size: 20, weight: 600, lineHeight: 1.3, letterSpacing: 0 },
      { role: 'body', size: 15, weight: 400, lineHeight: 1.5, letterSpacing: 0.1 },
      { role: 'label', size: 13, weight: 500, lineHeight: 1.4, letterSpacing: 0.5 },
      { role: 'numeric', size: 15, weight: 600, lineHeight: 1.2, letterSpacing: 0 },
    ],
    spacing: [4, 8, 12, 16, 24, 32],
    radius: [4, 8, 16],
    elevation: [0, 1, 6],
    motion: { fast: 150, medium: 220 },
    ...overrides,
  };
}

test('contrast maths matches the WCAG reference values', () => {
  // These four are the published anchors; if the formula drifts, every colour
  // judgement below becomes decoration rather than a check.
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF') * 100) / 100, 21);
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  assert.ok(Math.abs(contrastRatio('#767676', '#FFFFFF') - 4.54) < 0.02, 'AA sınırı kaydı');
  assert.ok(Math.abs(contrastRatio('#949494', '#FFFFFF') - 3.03) < 0.02, 'AA altı kaydı');
  // Flutter writes #AARRGGBB; the alpha channel says nothing about contrast.
  assert.equal(Math.round(contrastRatio('#FF000000', '#FFFFFFFF') * 100) / 100, 21);
  assert.equal(contrastRatio('mor', '#FFFFFF'), null);
  assert.equal(parseHexColor('#12345'), null);
  assert.equal(relativeLuminance({ r: 255, g: 255, b: 255 }), 1);
});

test('a complete token file is accepted and normalised', () => {
  const accepted = validateDesignTokens(tokens());
  assert.equal(accepted.font_family, 'Inter');
  assert.equal(accepted.signature_element.name, 'Odak Şeridi');
  assert.equal(accepted.typography.length, 5);
  assert.deepEqual(accepted.elevation, [0, 1, 6]);
});

test('every required colour role is demanded in both light and dark', () => {
  for (const role of REQUIRED_COLOR_ROLES) {
    const broken = tokens();
    delete broken.colors.dark[role];
    assert.throws(() => validateDesignTokens(broken), new RegExp(`colors\\.dark\\.${role} eksik`), role);
  }
});

test('an unreadable colour pair is rejected with its measured ratio', () => {
  // Grey-on-white is the classic near-miss: it looks fine to the eye that chose
  // it and fails for everyone else.
  const faint = tokens();
  faint.colors.light.onSurface = '#949494';
  assert.throws(() => validateDesignTokens(faint), error => {
    assert.match(error.message, /onSurface \/ surface kontrastı 3\.0\d:1/);
    assert.match(error.message, /en az 4\.5:1/);
    return true;
  });

  // The outline is held to the lower non-text bar, so the same value passes there.
  const outline = tokens();
  outline.colors.light.outline = '#949494';
  assert.doesNotThrow(() => validateDesignTokens(outline));
});

test('dark mode is checked as strictly as light mode', () => {
  const broken = tokens();
  broken.colors.dark.onPrimary = '#8FBF92';
  assert.throws(() => validateDesignTokens(broken), /colors\.dark: onPrimary \/ primary/);
});

test('a font family must be chosen, because the platform default is not a decision', () => {
  // Measured: two accepted MVPs shipped on the platform default font with no
  // assets and no depth. A named family is the smallest enforceable commitment.
  assert.throws(() => validateDesignTokens(tokens({ font_family: '   ' })), /font_family belirtilmelidir/);
  assert.throws(() => validateDesignTokens(tokens({ font_family: undefined })), /font_family belirtilmelidir/);
});

test('the signature element must be named and explained', () => {
  assert.throws(
    () => validateDesignTokens(tokens({
      signature_element: { name: '', description: 'x'.repeat(30), surfaces: ['A listesi', 'B detayı'] },
    })),
    /signature_element\.name boş olamaz/,
  );
  assert.throws(
    () => validateDesignTokens(tokens({
      signature_element: { name: 'Şerit', description: 'kısa', surfaces: ['A listesi', 'B detayı'] },
    })),
    /signature_element\.description/,
  );
});

test('the signature element must say where it appears', () => {
  // The first real run declared a signature element and built it on one screen
  // only. Nothing mechanical could see the omission; the reviewer blocked an
  // acceptance criterion over it. Naming the surfaces moves that into the contract.
  const signature = surfaces => ({
    name: 'Odak Şeridi', description: 'Her satırda kalan süreyi gösteren ince yatay şerit.', surfaces,
  });
  for (const value of [undefined, [], ['tek yüzey'], 'Görev listesi']) {
    assert.throws(
      () => validateDesignTokens(tokens({ signature_element: signature(value) })),
      /signature_element\.surfaces .* en az iki/s,
      JSON.stringify(value),
    );
  }
  assert.throws(
    () => validateDesignTokens(tokens({ signature_element: signature(['Görev listesi', '  ']) })),
    /signature_element\.surfaces girdileri boş olamaz/,
  );
  const accepted = validateDesignTokens(tokens({
    signature_element: signature(['  Görev listesi  ', 'Görev detayı']),
  }));
  assert.deepEqual(accepted.signature_element.surfaces, ['Görev listesi', 'Görev detayı']);
});

test('a typography list that is not a scale is rejected', () => {
  assert.throws(() => validateDesignTokens(tokens({
    typography: [{ role: 'body', size: 15, weight: 400, lineHeight: 1.5, letterSpacing: 0 }],
  })), /en az 5 rol/);
  // Five roles that are all the same size are a list, not a scale.
  assert.throws(() => validateDesignTokens(tokens({
    typography: ['a', 'b', 'c', 'd', 'e'].map((role, index) => ({
      role, size: 15, weight: 400 + index * 100, lineHeight: 1.4, letterSpacing: 0,
    })),
  })), /en az üç farklı boyut/);
  assert.throws(() => validateDesignTokens(tokens({
    typography: [
      { role: 'display', size: 32, weight: 700, lineHeight: 1.2, letterSpacing: 0 },
      { role: 'display', size: 20, weight: 600, lineHeight: 1.3, letterSpacing: 0 },
      { role: 'body', size: 15, weight: 400, lineHeight: 1.5, letterSpacing: 0 },
      { role: 'label', size: 13, weight: 500, lineHeight: 1.4, letterSpacing: 0 },
      { role: 'numeric', size: 11, weight: 600, lineHeight: 1.2, letterSpacing: 0 },
    ],
  })), /tekrarlanmış: display/);
});

test('scales must ascend, and only elevation may start at zero', () => {
  assert.throws(() => validateDesignTokens(tokens({ spacing: [8, 4, 16] })), /spacing artan sırada/);
  assert.throws(() => validateDesignTokens(tokens({ spacing: [0, 8, 16] })), /spacing sıfırdan büyük/);
  assert.throws(() => validateDesignTokens(tokens({ radius: [4] })), /radius en az üç değerli/);
  assert.throws(() => validateDesignTokens(tokens({ elevation: [-1, 0, 2] })), /elevation negatif olamaz/);
  assert.doesNotThrow(() => validateDesignTokens(tokens({ elevation: [0, 2, 8] })));
});

test('motion durations must be present and plausible', () => {
  assert.throws(() => validateDesignTokens(tokens({ motion: {} })), /motion en az bir adlandırılmış süre/);
  assert.throws(() => validateDesignTokens(tokens({ motion: { slow: 4000 } })), /50-1000 ms/);
  assert.doesNotThrow(() => validateDesignTokens(tokens({ motion: { fast: 120 } })));
});

test('every problem is reported at once, so one retry can fix them all', () => {
  // The contract allows a single correction round. Reporting one problem per
  // round would spend the retry discovering the second one.
  const broken = tokens({ font_family: '', spacing: [8, 4], motion: {} });
  delete broken.colors.light.primary;
  assert.throws(() => validateDesignTokens(broken), error => {
    const lines = error.message.split('\n').filter(line => line.startsWith('- '));
    assert.ok(lines.length >= 4, `tek turda düzeltilemez: ${lines.length} bulgu`);
    return true;
  });
});

test('the contrast requirements only name roles the contract demands', () => {
  for (const { foreground, background } of CONTRAST_REQUIREMENTS) {
    assert.ok(REQUIRED_COLOR_ROLES.includes(foreground), foreground);
    assert.ok(REQUIRED_COLOR_ROLES.includes(background), background);
  }
});

test('the scale carries the identity, because the family cannot', () => {
  // The product contract forbids INTERNET, google_fonts fetches faces at runtime
  // and the agent sandbox has no network — so no agent can ship a font file. The
  // family is a recorded decision; these are the parts that actually change how
  // the app reads.
  for (const missing of ['lineHeight', 'letterSpacing']) {
    const broken = tokens();
    delete broken.typography[2][missing];
    assert.throws(() => validateDesignTokens(broken), new RegExp(`typography\\.body\\.${missing}`), missing);
  }
  assert.throws(() => validateDesignTokens(tokens({
    typography: tokens().typography.map(entry => ({ ...entry, lineHeight: 3 })),
  })), /lineHeight 1\.0-2\.0/);
  assert.throws(() => validateDesignTokens(tokens({
    typography: tokens().typography.map(entry => ({ ...entry, letterSpacing: 9 })),
  })), /letterSpacing -2 ile 4/);
  // Zero letter spacing is a decision and must be allowed.
  assert.doesNotThrow(() => validateDesignTokens(tokens({
    typography: tokens().typography.map(entry => ({ ...entry, letterSpacing: 0 })),
  })));
});

test('one weight everywhere is not a typographic system', () => {
  assert.throws(() => validateDesignTokens(tokens({
    typography: tokens().typography.map(entry => ({ ...entry, weight: 400 })),
  })), /en az 3 farklı ağırlık/);
});

test('naming the platform family is accepted, leaving it blank is not', () => {
  assert.doesNotThrow(() => validateDesignTokens(tokens({ font_family: 'Roboto' })));
  assert.throws(() => validateDesignTokens(tokens({ font_family: '' })), /Çevrimdışı ürün sözleşmesi/);
});
