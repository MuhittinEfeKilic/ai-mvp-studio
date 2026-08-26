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

  const openDecisions = sections.get(normalize('Açık Kararlar')) ?? '';
  if (openDecisions && !/^(yok\.?|none\.?|[-*]\s*yok\.?)$/i.test(openDecisions.trim())) {
    blocking_issues.push({ section: 'Açık Kararlar', message: 'Kodlama başlamadan önce açık kararlar kapatılmalıdır.' });
  }

  const recommended = ['Hedef Kullanıcılar', 'Veri Modeli', 'Tasarım Yönü', 'Kapsam Dışı'];
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
