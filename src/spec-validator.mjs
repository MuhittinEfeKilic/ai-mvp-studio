const REQUIRED_SECTIONS = [
  'Ürün Özeti',
  'MVP Kapsamı',
  'Kullanıcı Akışları',
  'Ekranlar',
  'Teknik Kararlar',
  'Kabul Kriterleri',
  'Kalite Gereksinimleri',
  'Açık Kararlar',
];

const MOBILE_REQUIRED_SECTIONS = [
  'Mobil Platform Kararları',
  'Navigasyon ve Ekran Davranışları',
  'İzinler ve Cihaz Özellikleri',
  'Kritik Kullanıcı Akışları',
];

const MOBILE_REQUIRED_METADATA = [
  ['framework', 'Flutter'],
  ['target_platform', 'Android'],
  ['package_name', 'Android paket adı'],
  ['min_android_sdk', 'Minimum Android SDK'],
  ['orientation', 'Ekran yönü'],
  ['device_test', 'Cihaz testi kararı'],
];

const MOBILE_V2_REQUIRED_SECTIONS = [
  'Özellik Modülleri ve Sınırlar',
  'İş Kuralları ve Değişmezler',
  'Ekran Durum Matrisi',
  'Veri Modeli ve Sözleşmeler',
  'Tasarım Sistemi ve Görsel Yön',
  'Test Stratejisi ve İzlenebilirlik',
];

function specMajorVersion(value) {
  const match = String(value ?? '').match(/^(\d+)/);
  return match ? Number(match[1]) : 1;
}

function normalize(value) {
  return value.trim().toLocaleLowerCase('tr-TR');
}

export function parseSpec(markdown) {
  const text = String(markdown ?? '').replace(/^\uFEFF/, '');
  const metadata = {};
  const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (frontmatter) {
    for (const line of frontmatter[1].split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z][\w-]*):\s*["']?(.*?)["']?\s*$/);
      if (match) metadata[match[1]] = match[2];
    }
  }

  const sections = new Map();
  const headings = [...text.matchAll(/^(#{1,2})\s+(.+)$/gm)];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const level = heading[1].length;
    const title = heading[2].trim();
    const start = heading.index + heading[0].length;
    const nextPeer = headings.slice(index + 1).find(candidate => candidate[1].length <= level);
    const end = nextPeer?.index ?? text.length;
    sections.set(normalize(title), text.slice(start, end).trim());
  }
  return { metadata, sections, text };
}

export function parseCriticalUserFlows(markdown) {
  const { sections } = parseSpec(markdown);
  const content = sections.get(normalize('Kritik Kullanıcı Akışları')) || '';
  const headings = [...content.matchAll(/^###\s+(.+)$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? content.length;
    const body = content.slice(start, end).trim();
    const steps = [...body.matchAll(/^\s*\d+[.)]\s+(.+)$/gm)].map(match => match[1].trim());
    const expected = body.match(/^\s*-\s*Beklenen(?:\s+sonuç)?:\s*(.+)$/im)?.[1]?.trim() || null;
    return { name: heading[1].trim(), steps, expected };
  });
}

/**
 * Turns the spec's acceptance criteria into an identified checklist. The reviewer
 * may only block on these, which keeps its verdict comparable between runs
 * instead of depending on what it happened to notice.
 */
export function parseAcceptanceCriteria(markdown) {
  const { sections } = parseSpec(markdown);
  const content = sections.get(normalize('Kabul Kriterleri')) || '';

  // Heading form: `### AC1 — Başlık` followed by the observable behaviour.
  // Measured: a real spec wrote all ten criteria this way, the bullet-only parser
  // returned zero, ACCEPTANCE_CRITERIA.json was never written and the whole
  // reviewer id contract silently switched itself off — the reviewer then
  // invented a criterion and blocked the project with it.
  //
  // The id comes from the spec, not from position. A spec that skips or reorders
  // ids keeps them, because the reviewer reads the same document: renumbering
  // here would make its answers unknown to the contract that checks them.
  const headings = [...content.matchAll(/^#{3,6}[ \t]+(AC\d+)\b[ \t]*[—–:.-]?[ \t]*(.*)$/gm)];
  if (headings.length) {
    return headings.map((heading, index) => {
      const start = heading.index + heading[0].length;
      const end = headings[index + 1]?.index ?? content.length;
      const body = content.slice(start, end).trim();
      const title = heading[2].trim();
      return { id: heading[1].toUpperCase(), text: [title, body].filter(Boolean).join(' — ') };
    });
  }

  return content.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^[-*]\s+\S/.test(line))
    // Specs are often written as task lists; the checkbox is not part of the criterion.
    .map(line => line.replace(/^[-*]\s+/, '').replace(/^\[[ xX]\]\s*/, '').trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `AC${index + 1}`, text }));
}

/**
 * Compares the minimum Android API the spec asks for against the floor the
 * installed toolchain enforces. A spec below that floor cannot be satisfied at
 * all: Flutter rewrites the value back on every Gradle command, so the reviewer
 * blocks, the repair agent fixes the file, the next gate reverts it and the loop
 * runs out of rounds. Measured on a real run: three repair rounds, two review
 * rounds and 568k billable tokens spent on a requirement no agent could meet.
 *
 * Pure on purpose — `validateSpec` cannot probe the toolchain, so the floor is
 * passed in. An unknown floor yields SKIPPED: an unmeasured requirement is not
 * reported as met.
 */
export function evaluateMinSdkCompatibility(metadata = {}, toolchainMinSdk = null) {
  const requested = Number(String(metadata.min_android_sdk ?? '').trim());
  const floor = Number(toolchainMinSdk);
  if (!Number.isInteger(requested) || requested <= 0) {
    return { status: 'SKIPPED', spec_min_sdk: null, toolchain_min_sdk: toolchainMinSdk ?? null,
      details: 'Spec `min_android_sdk` değeri okunamadı.' };
  }
  if (!Number.isInteger(floor) || floor <= 0) {
    return { status: 'SKIPPED', spec_min_sdk: requested, toolchain_min_sdk: null,
      details: 'Toolchain minimum Android API değeri okunamadı.' };
  }
  if (requested < floor) {
    return { status: 'FAIL', spec_min_sdk: requested, toolchain_min_sdk: floor,
      details: `Spec minimum Android API ${requested} istiyor, kurulu Flutter yalnız API ${floor} ve üstünü destekliyor. `
        + `Flutter bu değeri her Gradle komutunda \`flutter.minSdkVersion\` (${floor}) olarak geri yazar, `
        + `bu yüzden istek hiçbir onarım turuyla karşılanamaz. Spec'i API ${floor} veya üstüne çekin.` };
  }
  return { status: 'PASS', spec_min_sdk: requested, toolchain_min_sdk: floor,
    details: `Spec minimum Android API ${requested}, toolchain tabanı API ${floor}.` };
}

export function validateSpec(markdown) {
  const { metadata, sections, text } = parseSpec(markdown);
  const blocking_issues = [];
  const warnings = [];
  const checks = [];

  if (text.trim().length < 300) {
    blocking_issues.push({ section: 'Belge', message: 'Spec uygulanabilir ayrıntı içermek için çok kısa.' });
  }

  for (const title of REQUIRED_SECTIONS) {
    const content = sections.get(normalize(title));
    const isOpenDecisions = title === 'Açık Kararlar';
    const passed = Boolean(content && (content.length >= 10 || (isOpenDecisions && /^yok\.?$/i.test(content))));
    checks.push({ name: title, passed });
    if (!passed) blocking_issues.push({ section: title, message: `“${title}” bölümü eksik veya boş.` });
  }

  if (!metadata.project_name) {
    blocking_issues.push({ section: 'Frontmatter', message: '`project_name` alanı zorunludur.' });
  }
  if (normalize(metadata.status ?? '') !== 'approved') {
    blocking_issues.push({ section: 'Frontmatter', message: '`status: "approved"` olmalıdır.' });
  }

  const isMobileSpec = normalize(metadata.project_profile ?? '') === 'flutter_mobile'
    || normalize(metadata.application_type ?? '') === 'mobile';
  if (isMobileSpec) {
    for (const title of MOBILE_REQUIRED_SECTIONS) {
      const content = sections.get(normalize(title));
      const passed = Boolean(content && content.length >= 10);
      checks.push({ name: title, passed });
      if (!passed) blocking_issues.push({ section: title, message: `Mobil profil için “${title}” bölümü zorunludur.` });
    }

    for (const [field, label] of MOBILE_REQUIRED_METADATA) {
      const value = String(metadata[field] ?? '').trim();
      const passed = Boolean(value && !/^(belirlenecek|tbd|todo)$/i.test(value));
      checks.push({ name: `Frontmatter: ${field}`, passed });
      if (!passed) blocking_issues.push({ section: 'Frontmatter', message: `Mobil profil için \`${field}\` (${label}) kararı zorunludur.` });
    }

    if (metadata.framework && normalize(metadata.framework) !== 'flutter') {
      blocking_issues.push({ section: 'Frontmatter', message: '`flutter_mobile` profili için `framework: "flutter"` olmalıdır.' });
    }
    if (metadata.target_platform && !normalize(metadata.target_platform).includes('android')) {
      blocking_issues.push({ section: 'Frontmatter', message: 'İlk mobil profil `target_platform` içinde Android gerektirir.' });
    }
    if (metadata.device_test && normalize(metadata.device_test) !== 'required') {
      blocking_issues.push({ section: 'Frontmatter', message: '`device_test` değeri mobil profil için `required` olmalıdır.' });
    }

    if (specMajorVersion(metadata.spec_version) >= 2) {
      for (const title of MOBILE_V2_REQUIRED_SECTIONS) {
        const content = sections.get(normalize(title));
        const passed = Boolean(content && content.length >= 20);
        checks.push({ name: title, passed });
        if (!passed) blocking_issues.push({
          section: title,
          message: `Mobil spec v2 için “${title}” bölümü zorunludur.`,
        });
      }
      const tier = normalize(metadata.complexity_tier ?? '');
      if (!['simple', 'standard', 'advanced'].includes(tier)) {
        blocking_issues.push({
          section: 'Frontmatter',
          message: '`complexity_tier` simple, standard veya advanced olmalıdır.',
        });
      }
      const parallelism = Number(metadata.target_parallelism);
      if (!Number.isInteger(parallelism) || parallelism < 2 || parallelism > 6) {
        blocking_issues.push({
          section: 'Frontmatter',
          message: '`target_parallelism` 2 ile 6 arasında bir tam sayı olmalıdır.',
        });
      }
      if (!['auto', 'guided', 'custom'].includes(normalize(metadata.design_mode ?? ''))) {
        blocking_issues.push({
          section: 'Frontmatter',
          message: '`design_mode` auto, guided veya custom olmalıdır.',
        });
      }
    }

    const criticalFlows = parseCriticalUserFlows(text);
    const validFlows = criticalFlows.filter(flow => flow.steps.length >= 3 && flow.expected);
    checks.push({ name: 'Çalıştırılabilir kritik kullanıcı akışları', passed: validFlows.length > 0 });
    if (!criticalFlows.length) {
      blocking_issues.push({
        section: 'Kritik Kullanıcı Akışları',
        message: 'En az bir `###` başlıklı kritik akış tanımlanmalıdır.',
      });
    } else if (validFlows.length !== criticalFlows.length) {
      blocking_issues.push({
        section: 'Kritik Kullanıcı Akışları',
        message: 'Her kritik akış en az üç numaralı adım ve `- Beklenen sonuç:` satırı içermelidir.',
      });
    }
  }

  // The reviewer may block on these and nothing else, so a checklist that cannot
  // be parsed is not a cosmetic problem: it disables that limit entirely.
  const acceptanceCriteria = parseAcceptanceCriteria(text);
  const duplicateCriteria = [...acceptanceCriteria
    .reduce((counts, item) => counts.set(item.id, (counts.get(item.id) || 0) + 1), new Map())]
    .filter(([, count]) => count > 1).map(([id]) => id);
  checks.push({ name: 'Ayrıştırılabilir kabul kriterleri', passed: acceptanceCriteria.length > 0 && !duplicateCriteria.length });
  if (!acceptanceCriteria.length) {
    blocking_issues.push({
      section: 'Kabul Kriterleri',
      message: 'Kabul kriterleri ayrıştırılamadı. Her kriteri `- ...` maddesi veya '
        + '`### AC1 — Başlık` bölümü olarak yazın; bölümün dolu olması yeterli değildir.',
    });
  } else if (duplicateCriteria.length) {
    blocking_issues.push({
      section: 'Kabul Kriterleri',
      message: `Kabul kriteri kimliği birden fazla kez tanımlanmış: ${duplicateCriteria.join(', ')}.`,
    });
  }

  const openDecisions = sections.get(normalize('Açık Kararlar')) ?? '';
  if (openDecisions && !/^(yok\.?|none\.?|[-*]\s*yok\.?)$/i.test(openDecisions.trim())) {
    blocking_issues.push({ section: 'Açık Kararlar', message: 'Kodlama başlamadan önce açık kararlar kapatılmalıdır.' });
  }

  const recommended = ['Hedef Kullanıcılar', 'Kapsam Dışı'];
  const dataSection = sections.get(normalize('Veri Modeli'))
    || sections.get(normalize('Veri Modeli ve Sözleşmeler'));
  if (!dataSection) warnings.push('Önerilen “Veri Modeli” bölümü bulunamadı.');
  const designSection = sections.get(normalize('Tasarım Yönü'))
    || sections.get(normalize('Tasarım Sistemi ve Görsel Yön'));
  if (!designSection) warnings.push('Önerilen “Tasarım Yönü” bölümü bulunamadı.');
  for (const title of recommended) {
    if (!sections.get(normalize(title))) warnings.push(`Önerilen “${title}” bölümü bulunamadı.`);
  }

  const score = Math.max(0, Math.round(100 - blocking_issues.length * 12 - warnings.length * 3));
  return {
    ready: blocking_issues.length === 0,
    score,
    project_name: metadata.project_name ?? null,
    metadata,
    checks,
    blocking_issues,
    warnings,
  };
}
