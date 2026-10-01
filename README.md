# AI MVP Studio

Kendi bilgisayarımda çalışan, Codex CLI süreçlerini yöneterek onaylanmış bir
`PROJECT_SPEC.md` dosyasını çalışan bir Flutter mobil MVP'ye dönüştüren local-first
bir üretim hattı.

## Neden var

Bu bir kodlama-agent'ı ürünü değil; **kendi startup/MVP fabrikam**. Amaç genel
amaçlı bir geliştirme platformu olmak değil, tek bir döngüyü hızlandırmak:

```text
Fikir → çalışan MVP → yayınlanabilir MVP → gerçek kullanıcı
      → ölçülebilir geri bildirim → KILL / ITERATE / SCALE
```

Optimize edilen şeyler, sırayla:

- yayınlanabilir MVP'ye kadar geçen **süre**,
- gereken **insan müdahalesi**,
- başarılı MVP başına **token/maliyet**,
- üretimin **güvenilirliği ve tekrarlanabilirliği**,
- arızadan **hızlı kurtarma**,
- ve nihayetinde **gerçek pazar doğrulamasına** ulaşma hızı.

Bu döngünün bugün uygulanmış kısmı **"fikir → doğrulanmış MVP → ölçülmüş
yayınlanabilirlik"**tir. Kabul edilmiş bir projenin harici bir kullanıcıya
verilmeye teknik olarak hazır olup olmadığı deterministik biçimde ölçülür; **ama
yayınlama otomasyonu yoktur.** Gerçek kullanıcı ve pazar ölçümü tarafı henüz
yazılmadı — aşağıdaki [Bugün ne var, ne yok](#bugün-ne-var-ne-yok) bölümüne bakın.

Studio'nun kendisi yayınlanmaz. Ürettiği uygulamalar, kullanıcı kararıyla ayrıca
yayınlanabilir.

## Bugün ne var, ne yok

**Uygulanmış ve regresyon testiyle korunuyor**

- Sözleşme güdümlü orkestrasyon: spec → `USER_FLOWS.json` + `ACCEPTANCE_CRITERIA.json`
- Planlama agent'ları ve mekanik olarak doğrulanan görev DAG'ı (`TASK_PLAN.json`)
- İlk builder dalgasında gerçek paralellik zorunluluğu
- Builder başına izole Git worktree'si ve ayrık path sahipliği
- Deterministik kalite kapısı: analyze · test · debug APK · kaynak teşhis taraması
  (sessiz hata yutma **ve** agent'ın bozduğu metin kodlaması)
- Android çalışma zamanında cihaz doğrulaması ve kritik akış kapsamı kontrolü
- Üç desteklenen cihaz hedefi kategorisi ve hedefe özgü temizlik politikası
- Kanıta bağlı inceleme sözleşmesi ve sözleşme ihlalinde tek turluk düzeltme isteği
- Kalite/cihaz/inceleme kapılarının her biri için **sınırlı** onarım döngüsü
- Deterministik süreç timeout'u ve process-tree sonlandırma
- Bloklamayan Flutter/Android toolchain yürütmesi
- Çalışma başına token bütçesi ve Git checkpoint tabanlı devam ettirme
- Deterministik release hazırlık değerlendirmesi ve `RELEASE_READINESS.json` raporu
- Deterministik uygulama bütünlüğü ölçümü ve `APPLICATION_COMPLETENESS.json` raporu
- Doğrulanan tasarım sözleşmesi (`DESIGN_TOKENS.json`): WCAG kontrast oranları,
  tipografi rampası ve ölçek bütünlüğü mekanik olarak denetlenir
- Tasarım uyumunun ölçümü ve `DESIGN_REPORT.json` raporu — sözleşmenin koda gerçekten
  yansıyıp yansımadığı; **bilinçli olarak kapı değildir**

**Henüz uygulanmadı** (bu repository'de kodu yok)

- İmzalama anahtarı üretimi/yönetimi, keystore veya parola saklama
- Mağaza yükleme, store listing üretimi, Play App Signing
- Dağıtım/deployment otomasyonu
- Analitik, crash reporting, faturalama
- Deney sözleşmeleri veya pazar deneyi panoları
- Bütünlük bulgularının otomatik onarımı (bugün yalnız ölçülür ve raporlanır)
- Bütünlüğün görsel/anlamsal tarafı: ölü uçlu navigasyon, eksik yükleniyor/boş/hata
  durumları, kısmen uygulanmış özellikler
- Claude entegrasyonu (bilinçli olarak kapsam dışı)

## Deterministik olan ve olmayan

Bu ayrım hattın nasıl okunacağını belirler. Soldakiler kodda mekanik olarak
doğrulanır ve bir agent'ın ikna kabiliyetine bağlı değildir.

| Kod garanti eder (deterministik) | Agent'a bırakılmıştır (AI güdümlü) |
| --- | --- |
| Spec bölümlerinin sözleşme dosyalarına dönüşmesi | Mimari, UX ve veri modeli kararlarının kalitesi |
| Plan sözleşmesi: görev sayısı, grafik genişliği, ilk dalga paralelliği, path ayrıklığı, döngüsüzlük | Görevlerin nasıl bölündüğü ve prompt içerikleri |
| Aynı anda çalışan görevlerin path çakışmaması | Üretilen Dart kodu ve testlerin içeriği |
| Kalite kapısının dört çekinin de PASS olması ve APK'nın diskte bulunması | Kodun spec'i gerçekten karşılayıp karşılamadığına dair yargı |
| Cihaz kapısının akış kapsamı, kurulum, açılış ve senaryo sonuçları | Onarım turlarında yapılan düzeltmelerin isabeti |
| Reviewer çıktısının şekli, kriter kimliklerinin sınırı, bloklama yetkisi | Reviewer'ın kriterler içindeki kanaati |
| Onarım turu üst sınırları ve aynı-imza erken durması | — |
| Release hazırlığı: kimlik, sürüm, artefakt varlığı/boyutu/SHA-256, imza durumu | — |
| Uygulama bütünlüğü: iskelet artığı, boş eylem geri çağrısı, yer tutucu metin, `UnimplementedError`, TODO/FIXME | Ekranın gerçekten bitmiş görünüp görünmediğine dair yargı |
| Tasarım sözleşmesi: kontrast oranları, tipografi rampasının bütünlüğü, ölçeklerin geçerliliği | Palet, tipografi ve imza bileşeninin **estetik** kalitesi |
| Timeout, süreç ağacı sonlandırma, token bütçesi, checkpoint/resume | — |

Kapılar **yetkilidir**: reviewer `TEST_REPORT.json` ve `DEVICE_REPORT.json`
sonuçlarını yeniden yargılamaz, PASS'i kanıt kabul eder.

## Çalışma modeli

1. Ürün fikrini ChatGPT ile olgunlaştırın.
2. Taslağı doldurun: mobil ürün için
   [PROJECT_SPEC.mobile.template.md](templates/PROJECT_SPEC.mobile.template.md),
   diğer durumlarda [PROJECT_SPEC.template.md](templates/PROJECT_SPEC.template.md).
3. Açık kararları kapatıp frontmatter içindeki `status` değerini `approved` yapın.
4. Dosyayı Studio paneline yükleyin.
5. Doğrulama başarılıysa üretimi başlatın.

`PROJECT_SPEC.md` tek gerçek kaynaktır ve her projenin repository köküne değişmeden
kaydedilir. İki bölüm makinece okunabilir sözleşmeye dönüşür:

- `Kritik Kullanıcı Akışları` → `USER_FLOWS.json`. Planlama, uygulama, integration
  test ve inceleme agent'ları aynı sözleşmeyi kullanır.
- `Kabul Kriterleri` → `ACCEPTANCE_CRITERIA.json`. İncelemenin bloklayabileceği
  **tek** liste budur; maddeler gözlemlenebilir ürün davranışı anlatmalıdır.
  Toolchain sonuçları `Kalite Gereksinimleri` bölümüne aittir. İki biçim de
  tanınır: `- ...` maddeleri (sırayla `AC1..ACn`) veya `### AC1 — Başlık`
  bölümleri — bu ikincisinde **kimlik spec'in kendisinden** okunur, konumdan
  değil, çünkü reviewer aynı belgeyi okur ve yeniden numaralandırmak onun
  yanıtlarını sözleşmeye yabancı hâle getirir. Bölüm dolu ama ayrıştırılamıyorsa
  spec doğrulaması **engel** bildirir: ayrıştırılamayan bir liste, reviewer'ın
  bloklama sınırını sessizce tamamen kaldırır. Sözleşme dosyaları her koşu
  başında idempotent olarak onarılır; **mevcut dosya asla yeniden yazılmaz.**

Mobil template v2; özellik modülleri, iş kuralları, ekran durum matrisi, veri
sözleşmeleri, tasarım DNA/tokenları ve test izlenebilirliğini de zorunlu kılar.
`complexity_tier` (`simple`, `standard`, `advanced`) builder görev sayısını,
`target_parallelism` (2–6) doğrulanması gereken gerçek grafik genişliğini belirler.
`advanced` profil 4–8 builder görevi ve en az dört eşzamanlı çalışabilir görev ister.
Eski v1 spec'ler geriye uyumlu çalışır.

## Hat

Aşağıdaki şema hattın tamamıdır. Her durağın ne ölçtüğü, kapıların eşikleri ve
onarım turlarının kuralları [docs/PIPELINE.md](docs/PIPELINE.md) içindedir.

```text
PROJECT_SPEC.md ─→ USER_FLOWS.json + ACCEPTANCE_CRITERIA.json
        ↓
Preflight (Flutter + Android SDK + build-tools sağlığı + spec/toolchain uyumu)
        ↓
flutter create iskeleti (orchestrator) ──→ Gradle ısınması (arka planda, paralel)
        ↓
  ├─ Architecture Agent ─→ ARCHITECTURE.md
  ├─ UX Agent ───────────→ UX_SPEC.md
  ├─ Data Contract Agent ─→ DATA_MODEL.md        (advanced profilde dördü paralel)
  └─ Test Strategy Agent → TEST_STRATEGY.md
        ↓
Coordinator Agent ─→ TASK_PLAN.json ──sözleşme ihlali──→ gerekçeyle 1 kez yeniden iste
        ↓                                                (ikinci ihlal → proje düşer)
flutter pub add (plandaki bağımlılıklar, merkezî)
        ↓
Flutter Builder × N   (ayrı worktree, ayrık path sahipliği, biten slot hemen serbest)
        ↓
Integration Agent
        ↓
Kalite kapısı: analyze · test · apk · diagnostics ──FAIL──→ Repair × 3
        ↓                                                   (aynı imza 2 kez → durur)
Cihaz kapısı: hedef sınıflandırma · akış kapsamı · depolama
              · integration · kurulum · açılış
        │            ├─ ürün hatası   ──→ Device Repair × 2 ──→ kapılar yeniden koşar
        │            └─ ortam arızası ──→ awaiting_device_test (bekler, düşmez)
        ↓
        └─ test sonrası temizlik (paket kaldırma, cihaz artefaktları,
           gerekiyorsa snapshot ile sıfırlama) → karara karışmaz
        ↓
Mobile Reviewer (cihaz kapısıyla eşzamanlı başlar) ──FAIL──→ Review Repair × 2
        ↓
awaiting_user_review ─→ kullanıcı kabul eder veya geri bildirim turu başlatır
        ↓ (accepted)
Release hazırlığı  (elle tetiklenir, proje durumunu değiştirmez)
  kimlik · sürüm · simge · geliştirme adresi ──engel──→ BLOCKED (derleme atlanır)
        ↓
  flutter build apk --release · artefakt · SHA-256 · imza durumu
        ↓
  RELEASE_READINESS.json  →  READY (sideload) veya BLOCKED
```

Her onarım döngüsü sınırlıdır ve aynı hata imzası tekrarlarsa erkenden durur. Kod
değiştiği için her turdan sonra alt kapılar yeniden koşar; **final inceleme her zaman
son doğrulanmış duruma bakar.**

## Gereksinimler

- Node.js 24+
- Git
- Codex CLI ve içinde yapılmış ChatGPT oturumu

Flutter mobil profili için ek olarak:

- Flutter SDK (`FLUTTER_BIN` veya PATH üzerinden)
- Android SDK ve platform-tools
- `device_test: "required"` spec'ler için en az bir Android çalışma zamanı hedefi

```powershell
node --version
git --version
codex --version
```

Codex oturumu henüz açılmadıysa bir kez `codex` çalıştırın. Windows'ta Codex masaüstü
uygulamasının içindeki binary otomasyona uygun olmayabilir; bağımsız CLI için
`npm install -g @openai/codex` kullanın. Studio Windows'ta global paketin JavaScript
giriş noktasını doğrudan Node.js ile çalıştırır.

Harici npm paketi kurulmaz; HTTP sunucusu, SQLite ve test altyapısı Node.js'in
yerleşik modüllerini kullanır. Runtime verileri `data/` ve `projects/` altındadır.

## Çalıştırma

```powershell
cd C:\Users\efeklc\Documents\GitHub\ai-mvp-studio
npm start
```

Panel: <http://127.0.0.1:8000>. Sunucu hazır olduğunda terminalde
`AI MVP Studio: http://127.0.0.1:8000` satırı görünür. Durdurmak için `Ctrl+C`.
Geliştirme sırasında `npm run dev` dosya değişikliğinde yeniden başlatır.
**`src/*.mjs` değiştiyse sunucu yeniden başlatılmadan değişiklik devreye girmez.**

Ayarların tamamı [.env.example](.env.example) dosyasındadır. Eşzamanlılık üç ayrı
sınırla yönetilir: aynı anda çalışan proje sayısı (`MVP_STUDIO_MAX_CONCURRENT_RUNS`),
bir projedeki paralel builder sayısı (`MVP_STUDIO_MAX_PARALLEL_BUILDERS`) ve tüm
sistemdeki Codex süreci sayısı (`MVP_STUDIO_MAX_CONCURRENT_AGENTS`). Sonuncusu diğer
ikisinin çarpımını sınırlayan üst kapıdır. Varsayılanlar proje başına 4 builder ve
sistem genelinde 5 Codex sürecidir.

Agent modeli rol bazında seçilebilir (`MVP_STUDIO_AGENT_MODELS`) ama **varsayılan
olarak seçilmez**: ucuz modele geçmek gerçek bir koşuda denendi ve hattı böldü.
Gerekçe ve sayılar [docs/LESSONS.md → 1](docs/LESSONS.md). `agent_runs` tablosu
**istenen** modeli kaydeder, kullanılanı değil — `exec --json` akışı model bilgisi
taşımaz, bu yüzden atanmayan rolde alan boş kalır ve bu "Codex kendi
yapılandırmasıyla karar verdi" anlamına gelir.

Panel sekmeli ve proje odaklıdır: **Genel · Çalışma · Doğrulama · Etkinlik**. Yoklama,
görünen veri değişmedikçe yeniden çizim yapmaz; açık panel, taslak metin ve kaydırma
konumu korunur. Sekmelerin bilgi hiyerarşisi
[docs/UI_DESIGN_SYSTEM.md](docs/UI_DESIGN_SYSTEM.md) §12–§15 içindedir.

## Doğrulama

```powershell
npm run check     # 20 birinci taraf src/*.mjs modülünün sözdizimi
npm test          # 235 test, tamamı Codex'i taklit eder
```

`npm test` veritabanı, spec doğrulama, plan paralellik kuralları, scheduler,
worktree/path izolasyonu, checkpoint, kalite ve inceleme sözleşmeleri, kaynak teşhis
taraması, cihaz kapısı, cihaz hedefi sınıflandırması, emülatör otomasyonu, süreç
timeout semantiği, event loop canlılığı, path-scoped commit davranışı, analiz şiddet
politikası, spec/toolchain Android API uyumu, cihaz sıfırlama politikası, cihaz testi
kırılganlık taraması, tasarım sözleşmesi ve uyum taraması, release hazırlık
değerlendirmesi, uygulama bütünlüğü taraması ve orchestrator davranışlarını kapsar.

Gerçek Codex'e dokunan tek ucuz kontrol ayrı tutulur:

```powershell
npm run test:minimal-live
```

Bu betik Architecture, UX, Coordinator, Integration ve Reviewer aşamalarını yerel
fixture'larla simüle eder; yalnız duraklamadan sonra devam eden Builder aşaması gerçek
bir Codex çağrısı yapar ve tek bir `index.html` üretir. Böylece checkpoint/resume
akışı, plan sözleşmesi, kalite kapısı ve inceleme sözleşmesi tek bir gerçek çağrı
maliyetiyle uçtan uca doğrulanır. Bitince ölçülen token kullanımını yazar.

Uçtan uca hat gerçek koşularda kanıtlanmıştır. Tarihli doğrulama kanıtları, gerçek
toolchain ölçümleri ve proje bazlı sonuçlar
[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) içindedir.

## Bilinen sınırlar

- **Üretim imzası yok.** Release APK, Flutter şablonunun debug anahtarıyla imzalanır:
  sideload testi için yeterli, mağaza dağıtımı için değil. Studio anahtar üretmez ve
  saklamaz.
- **Yayınlama otomasyonu yok.** Hazırlık ölçülür, dağıtım yapılmaz. Döngünün
  "gerçek kullanıcı → ölçüm" tarafı henüz yazılmadı.
- **Release değerlendirmesi yeniden başlatmaya dayanıklı değil.** Studio değerlendirme
  sırasında kapanırsa koşu kaybolur; proje durumu değişmediği için zararsızdır,
  panelden yeniden tetiklenir.
- **Reviewer'ın önceki bulgu hafızası gerçek koşuda tetiklenmedi**; yalnız birim
  testleriyle korunuyor. (Review Repair'in kendisi tetiklendi ve ölçüldü.)
- **Uygulama bütünlüğü yalnız mekanik izleri görür.** Ölü uçlu navigasyon, eksik
  yükleniyor/boş/hata durumu, doğrulanmayan form veya yarım kalmış bir özellik bu
  ölçümün kapsamında değildir; `COMPLETE` "ürün bitmiştir" demek değildir.
- **Tasarım uyumu ölçülür, zorlanmaz.** `DESIGN_REPORT.json` bir kapı değildir ve
  hiçbir onarım turunu beslemez; gerekçe [docs/LESSONS.md → 4](docs/LESSONS.md).
  Sözleşme imza öğesinin adını, açıklamasını ve **göründüğü yüzeyleri** zorlar;
  kodun onu gerçekten çizip çizmediğini zorlamaz.
- **Eski örnek projeler güncel sözleşmelerin gerisinde.** Ayrıntı ve proje bazlı durum
  için [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

## Repository haritası

| Yol | Sorumluluk |
| --- | --- |
| `src/server.mjs` | Yerel HTTP API ve web paneli |
| `src/orchestrator.mjs` | Agent pipeline, kapılar, onarım döngüleri, checkpoint |
| `src/codex-runner.mjs` | Codex CLI süreci, timeout ve JSONL olayları |
| `src/async-process-runner.mjs` | Bütün harici süreçler: asenkron yürütme, deterministik timeout, process-tree sonlandırma |
| `src/database.mjs` | SQLite proje, görev, bağımlılık ve agent run kayıtları |
| `src/spec-validator.mjs` | Spec doğrulama, kritik akış ve kabul kriteri ayrıştırma |
| `src/task-plan.mjs` | Plan sözleşmesi ve paralellik kuralları |
| `src/task-scheduler.mjs`, `src/task-worktree.mjs` | Hazır görev seçimi ve path izolasyonu |
| `src/quality-report.mjs` | Kalite raporu ve inceleme sözleşmesi doğrulaması |
| `src/source-diagnostics.mjs` | Üretilen Dart kaynağında sessiz hata yutma taraması |
| `src/integration-test-diagnostics.mjs` | Üretilen cihaz testlerinde klavyeye bağımlı kırılgan iddia taraması |
| `src/design-tokens.mjs` | `DESIGN_TOKENS.json` sözleşmesi: kontrast, tipografi rampası, ölçekler |
| `src/design-diagnostics.mjs` | Tasarım sözleşmesinin koda yansıyıp yansımadığının ölçümü (kapı değil) |
| `src/device-tester.mjs` | Cihaz kapısı, arıza sınıflandırması, hata imzası |
| `src/release-readiness.mjs` | Deterministik release hazırlık değerlendirmesi ve rapor |
| `src/app-completeness.mjs` | Üretilen uygulamada tamamlanmamışlık izlerinin deterministik taraması |
| `src/android-environment.mjs` | Cihaz hedefi tespiti, emülatör başlatma, AVD temizliği, build-tools sağlığı |
| `src/context-packager.mjs` | Rol bazlı context paketleri |
| `src/config.mjs` | Ortam değişkenleri ve varsayılan ayarlar |
| `src/mvp_studio/static/index.html` | Web paneli |
| `templates/` | Genel ve Flutter mobil PROJECT_SPEC şablonları |
| `test/` | Tüm regresyon testleri (`node --test`) |
| `scripts/` | `check-sources.mjs` ve canlı asgari doğrulama betiği |
| `examples/`, `work/` | Örnek ve çalışma spec'leri (`work/` gitignore'lu) |
| `projects/<id>/repository/` | Üretilen uygulamanın ana Git repository'si |
| `projects/<id>/artifacts/` | Teslim APK'sı — `build/` silinse de kalır, panel bağlantısı buraya bakar |
| `projects/<id>/worktrees/` | Agent'ların izole çalışma alanları |
| `data/` | Studio'nun yerel SQLite/runtime verileri |

## Belge haritası

Her belgenin **tek** bir işi var; bir bilgi yalnız bir yerde tutulur.

| Belge | Sorusu | Ne zaman okunur |
| --- | --- | --- |
| **README.md** (bu dosya) | Sistem nedir, nasıl çalıştırılır, hangi dosya nerededir | Her zaman önce |
| [AGENTS.md](AGENTS.md) | Bu repository'de nasıl çalışılır, neye dokunulmaz | Değişiklik yapmadan önce |
| [docs/PIPELINE.md](docs/PIPELINE.md) | Her aşama ve kapı tam olarak ne ölçer | Hattı veya bir kapıyı değiştirirken |
| [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) | Bugün nerede duruyoruz, neyin kanıtı var | Mevcut hedefi anlarken |
| [docs/LESSONS.md](docs/LESSONS.md) | Ne denendi ve neden başarısız oldu | Bir kapıyı/modeli/sözleşmeyi değiştirmeden önce |
| [docs/TODO.md](docs/TODO.md) | Kalan iş ve öncelik sırası | Sıradaki işi seçerken |
| [docs/UI_DESIGN_SYSTEM.md](docs/UI_DESIGN_SYSTEM.md) | Panelin tasarım sistemi ve bilgi hiyerarşisi | Panel arayüzüne dokunurken |

## Güvenlik modeli

Codex yalnızca oluşturulan proje dizininde ve `workspace-write` sandbox modunda
çalıştırılır; `danger-full-access` kullanılmaz. Studio otomatik deployment yapmaz.
Yayınlama, uygulandığında ayrı ve kullanıcı onaylı bir aşama olacaktır.

## Yeni bir oturuma devretme

Yeni bir AI oturumuna aşağıdaki promptu tek başına verin. İki dosya yeterlidir:
bu README sistemin ne olduğunu ve nerede durduğunu, `AGENTS.md` nasıl
çalışılacağını anlatır; derinlik gerektiğinde ikisi de doğru belgeye yönlendirir.

```text
Bu repository AI MVP Studio: onaylanmış bir PROJECT_SPEC.md dosyasını Codex CLI
agent'larıyla çalışan bir Flutter Android MVP'sine çeviren local-first üretim hattı.

Önce README.md ve AGENTS.md dosyalarını tamamen oku; README'deki "Belge haritası"
hangi konuda hangi belgeye gideceğini söyler. Göreve başlamadan önce
docs/PROJECT_STATUS.md içinden mevcut hedefi, docs/TODO.md içinden sıradaki işi ve
docs/LESSONS.md içinden denenip reddedilmiş yaklaşımları oku — bir kapıyı, model
seçimini veya sözleşmeyi değiştirecek bir iş yapacaksan LESSONS zorunludur.

Sonra `git status --short` çalıştır ve mevcut hedefi bana özetle.

Kurallar: mevcut kullanıcı değişikliklerini koru; data/, projects/, .git ve agent
worktree'lerini açık talimat olmadan silme, taşıma veya sıfırlama; yıkıcı git
komutları kullanma. Kod davranışı değiştiyse `npm run check` ve ilgili testleri,
pipeline davranışı değiştiyse tam `npm test` çalıştır. src/*.mjs değiştiyse panel
sunucusunun yeniden başlatılması gerektiğini unutma. Değişiklikten sonra
docs/PROJECT_STATUS.md dosyasını güncelle.
```
