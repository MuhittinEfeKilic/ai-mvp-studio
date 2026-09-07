# AI MVP Studio

AI MVP Studio, bilgisayarında çalışan ve Codex CLI süreçlerini yöneterek uygulama
prototipleri üreten local-first bir MVP atölyesidir. Studio'nun kendisi yayınlanmaz;
üretilen projeler kullanıcı onayından sonra ayrı olarak yayınlanabilir.

## Çalışma modeli

1. Ürün fikrini ChatGPT ile olgunlaştırın.
2. Taslağı doldurun: mobil ürün için
   [PROJECT_SPEC.mobile.template.md](templates/PROJECT_SPEC.mobile.template.md),
   diğer durumlarda [PROJECT_SPEC.template.md](templates/PROJECT_SPEC.template.md).
3. Açık kararları kapatıp frontmatter içindeki `status` değerini `approved` yapın.
4. Dosyayı Studio paneline yükleyin.
5. Doğrulama başarılıysa Codex üretimini başlatın.

`PROJECT_SPEC.md` uygulama üretiminde tek gerçek kaynak olarak kullanılır ve her
oluşturulan projenin repository köküne değişmeden kaydedilir.

Mobil spec'lerde `Kritik Kullanıcı Akışları` bölümü zorunludur. Studio bu akışları
proje oluşturulurken makinece okunabilir `USER_FLOWS.json` sözleşmesine dönüştürür;
planlama, uygulama, integration test ve review agent'ları aynı sözleşmeyi kullanır.

`Kabul Kriterleri` maddeleri de aynı biçimde `ACCEPTANCE_CRITERIA.json` sözleşmesine
dönüşür ve incelemenin bloklayabileceği tek liste olur. Bu yüzden maddeler
gözlemlenebilir ürün davranışı anlatmalıdır; toolchain sonuçları `Kalite
Gereksinimleri` bölümüne aittir.

Mobil template v2; özellik modülleri, iş kuralları, ekran durum matrisi, veri
sözleşmeleri, tasarım DNA/tokenları ve test izlenebilirliğini de zorunlu kılar.
`complexity_tier` (`simple`, `standard`, `advanced`) builder görev sayısını;
`target_parallelism` (2–6) doğrulanması gereken gerçek görev grafiği genişliğini
belirler. Varsayılan `advanced` profil 4–8 builder görevi ve en az dört eşzamanlı
çalışabilir görev ister. Eski v1 spec'ler geriye uyumlu çalışır.

## Kapsam

- Yerel panelden PROJECT_SPEC.md yükleme, doğrulama ve üretimi başlatma
- Her proje için izole Git repository'si ve agent başına ayrı worktree
- Codex CLI'yi etkileşimsiz, JSONL çıktıyla ve süre sınırıyla çalıştırma
- Kalıcı görev grafiği, bağımlılıklar ve path çakışmasını önleyen scheduler
- Orchestrator'ın ürettiği Flutter iskeleti ve merkezden kurulan bağımlılıklar
- Dört çekli kalite kapısı: analyze, test, debug APK ve kaynak teşhis taraması
- Emülatörü kendisi başlatan Android cihaz kapısı ve kritik akış doğrulaması
- Kalite, cihaz ve inceleme kapılarının her biri için sınırlı onarım döngüsü
- `ACCEPTANCE_CRITERIA.json` üzerinden kanıta bağlı inceleme sözleşmesi
- Git checkpoint tabanlı duraklatma, devam ettirme ve görev bazlı yeniden deneme
- Rol/görev bazlı dar context paketleri ve cache ayrıştırılmış token metrikleri
- Sekmeli panel: canlı agent etkinliği, görev grafiği, olay akışı ve kabul kapısı

Claude entegrasyonu ve otomatik yayınlama kapsam dışıdır.

## Çoklu-agent akışı

```text
PROJECT_SPEC.md ─→ USER_FLOWS.json + ACCEPTANCE_CRITERIA.json
        ↓
flutter create iskeleti (orchestrator) ──→ Gradle ısınması (arka planda)
        ↓
  ├─ Architecture Agent ─→ ARCHITECTURE.md
  ├─ UX Agent ───────────→ UX_SPEC.md
  ├─ Data Contract Agent ─→ DATA_MODEL.md         (advanced: dördü paralel)
  └─ Test Strategy Agent → TEST_STRATEGY.md
        ↓
Coordinator Agent ─→ TASK_PLAN.json ─→ flutter pub add
        ↓
Flutter Builder × N   (paralel, ayrık path sahipliği)
        ↓
Integration Agent
        ↓
Kalite kapısı: analyze · test · apk · diagnostics ──FAIL──→ Repair × 3
        ↓
Cihaz kapısı: akış kapsamı · integration · kurulum · açılış
        │                    ├─ ürün hatası  ──→ Device Repair × 2
        │                    └─ ortam arızası ──→ awaiting_device_test (bekler)
        ↓
Mobile Reviewer (cihaz kapısıyla eşzamanlı) ──FAIL──→ Review Repair × 2
        ↓
awaiting_user_review ─→ kullanıcı kabul eder veya geri bildirim gönderir
```

Her onarım döngüsü sınırlıdır ve aynı hata imzası tekrarlarsa erkenden durur; kod
değiştiği için her turdan sonra alt kapılar yeniden koşar.

PROJECT_SPEC içindeki `Kabul Kriterleri` maddeleri `ACCEPTANCE_CRITERIA.json` olarak
`AC1..ACn` kimlikleriyle repository'ye yazılır. Reviewer her maddeyi kanıtıyla
yanıtlamak zorundadır ve yalnız bu maddeler üzerinden bloklayabilir; listenin
dışındaki gözlemler engelleyici değil, not olarak raporlanır. Yeniden çalışan bir
inceleme kendi önceki bulgularını görür ve her birini açıkça kapatmak zorundadır.

Studio, agent'lar başlamadan önce `flutter create` ile uygulama iskeletini kendisi
üretir ve soğuk Gradle derlemesini planlama agent'larıyla eşzamanlı olarak arka
planda ısıtır. Paket bağımlılıkları `TASK_PLAN.json` içindeki `dependencies`
alanından okunup `flutter pub add` ile kurulur; hiçbir builder `pubspec.yaml`
sahiplenemez.

Planlama agent'ları ayrı Git worktree'lerinde çalışır ve yalnızca kendi plan
dosyalarını değiştirebilir. Advanced profilde Architecture, UX, Data Contract ve
Test Strategy aynı anda çalışır. Coordinator bu belgeleri birleştirerek doğrulanan `TASK_PLAN.json` dosyasını
üretir. Scheduler bağımsız Flutter Builder görevlerini ayrı worktree'lerde paralel
çalıştırır ve biten görevin slotunu hemen serbest bırakır. Plan sözleşmesi
paralelliği zorunlu kılar: birbirine bağlı olmayan görevler aynı yolları
sahiplenemez (iç içe yollar da çakışma sayılır); v2 planlarında görev sayısı ve
grafik genişliği spec'teki profile göre mekanik olarak doğrulanır. Reviewer, cihaz kapısı APK'yı çalıştırırken eş
zamanlı olarak incelemesini yapar. Integration, Flutter Test, koşullu Repair ve Mobile Reviewer aşamaları
bu grafiğin devamında çalışır.

## Checkpoint ve devam sistemi

Aynı proje için aynı anda yalnız bir çalışma yürütülür; devam ettirme, görev yeniden
deneme ve geri bildirim istekleri çalışan bir projede reddedilir. Devam ettirme
tamamlanmış Architecture, UX, Coordinator, Integration ve Reviewer aşamalarını atlar.

Tek bir Codex çağrısı `MVP_STUDIO_CODEX_TIMEOUT_MS` süresini aşarsa süreç ağacı
sonlandırılır ve proje devam ettirilebilir biçimde `failed` olur.

Bir çalışma `MVP_STUDIO_PROJECT_TOKEN_BUDGET` faturalanabilir tokenını (cache dışı
giriş + çıkış) aşarsa hat bir sonraki agent'ı başlatmadan durur. Sınır kesintisiz
bir çalışma içindir; devam ettirmek yeni bir bütçe başlatır. Panelin Agentlar
sekmesi tüketimi bütçeye göre gösterir.

Studio projelere sabit süre veya token sınırı koymaz. Her agent başlamadan önce
mevcut Git commit'i checkpoint olarak SQLite'a kaydedilir; Codex thread kimliği ve
bildirdiği token kullanımı da agent çalışmasına eklenir.

Codex kullanım limiti veya context penceresi nedeniyle durursa proje sırasıyla
`paused_usage` ya da `paused_context` durumuna geçer. Studio kapanır veya bilgisayar
yeniden başlarsa yarım kalan proje `interrupted` olarak işaretlenir. Paneldeki
**Checkpoint’ten devam et** düğmesi aynı repository ve worktree'leri kullanır,
tamamlanmış aşamaları atlar ve yarım kalan dosyaları yeni bir Codex oturumunda
inceleterek üretime devam eder. Gerçek hata durumundaki `failed` projeler de aynı
mekanizmayla tekrar denenebilir.

## Koordineli görev modeli

Yeni projeler varsayılan olarak `flutter_mobile` profiliyle açılır. V1'de Architecture
ve UX; v2/advanced profilde bunlara ek olarak Data Contract ve Test Strategy görevleri
paralel çalışır. Coordinator planlama görevleri tamamlandığında, Builder'lar plan
üretildiğinde, Integration bütün Builder'lar bittiğinde hazır hale gelir. Scheduler
aynı anda çalışacak görevlerin `allowed_paths` alanlarını karşılaştırır ve çakışan
dosya sahipliklerini paralel başlatmaz.

Görevler ve bağımlılıkları SQLite'taki `tasks` ve `task_dependencies` tablolarında
kalıcıdır. Durum, checkpoint commit'i, worktree/branch, deneme sayısı ve hata bilgisi
`PROJECT_STATE.json` dosyasına da yansıtılır. Panel görev grafiğini canlı gösterir.

Agent'lar tüm repository geçmişi yerine rollerine göre seçilen belgeler, görev
sözleşmesi ve yalnızca izinli path diff özetiyle çalışır. Her context manifesti ve
karakter boyutu agent run kaydında saklanır. Panel toplam giriş yerine cache dışındaki
gerçek yeni giriş tokenını ayrıca gösterir.

Flutter kalite kapısı `flutter analyze`, `flutter test` ve `flutter build apk --debug`
sonuçlarının üçünü de yapılandırılmış `TEST_REPORT.json` içinde PASS olarak ister ve
APK dosyasının workspace içinde gerçekten var olduğunu doğrular. Dördüncü çek olan
kaynak teşhis kontrolü, üretilen koddaki boş veya hatayı yutan `catch` bloklarını
bloklayıcı hata sayar; hata ya incelenmeli ya yeniden fırlatılmalıdır. Teknik başarı projeyi
`awaiting_user_review` durumuna getirir; kullanıcı panelden APK'yı indirebilir, ürünü
kabul edebilir veya hedefli bir Feedback Repair turu başlatabilir.

Mobil spec'te `device_test: "required"` ise teknik kontrolden sonra Android cihaz
kapısı çalışır. Aynı kapı kullanıcı geri bildirimi turundan sonra da işler; teknik
kontroller tek başına ürün kabulü için yeterli sayılmaz.

Kapı, kritik akışların `integration_test/` kapsamını, cihaz üstündeki Flutter
integration testlerini, APK kurulumunu, uygulama sürecini ve logcat crash kayıtlarını
doğrular. Kanıtlar `DEVICE_REPORT.json` ve `QUALITY_LOGS/DEVICE_*` dosyalarında
saklanır. Integration test dosyaları birbirinden ayrı süreçlerde ve dosya başına
180 saniyelik sınırla çalışır. Windows'ta süre aşımı bütün Flutter/Dart süreç ağacını
kapatır; takılan dosyanın yolu cihaz raporunda `failed_file` olarak görünür.

ADB yolu `ADB_BIN`, Android SDK platform-tools ve sistem PATH konumlarından sırayla
aranır; LDPlayer'a özel yol veya entegrasyon kullanılmaz. Bağlı cihaz yoksa Studio
`flutter emulators --launch` ile ilk Android Studio AVD'sini
kendisi başlatır ve `sys.boot_completed` özelliğini bekler; açılış tamamlanmadan
test başlatılmaz. Emülatör bulunamaz veya süresinde açılmazsa proje
`awaiting_device_test` durumunda güvenle bekler ve paneldeki **Cihaz testini
yeniden dene** düğmesiyle sürdürülür.

Test başlamadan önce yalnız hedef uygulamanın eski paketi AVD'den kaldırılır ve
`/data` boş alanı ölçülür. Varsayılan minimum 1536 MB'dir ve
`MVP_STUDIO_DEVICE_MIN_FREE_MB` ile değiştirilebilir. Alan yetersizse APK kurulumu
denenmeden proje `awaiting_device_test` durumuna geçer. Her cihaz testi sonucu
(başarılı, ürün hatası veya ortam hatası) raporlandıktan sonra yalnız kullanılan
Android Studio AVD kapatılır ve `-wipe-data` ile temiz olarak yeniden başlatılır.
Böylece bir üretimin uygulama/veri artıkları sonraki üretime taşınmaz. Fiziksel
Android cihazlar güvenlik nedeniyle hiçbir zaman otomatik sıfırlanmaz.

Cihazda ürün kaynaklı bir hata çıkarsa en fazla iki hedefli Device Repair turu
uygulanır; her turdan sonra APK yeniden üretilip doğrulanır. Aynı hata imzası
tekrarlarsa, tur hakkı biterse veya hata bir agent turuyla düzeltilemezse
`DEVICE_ROOT_CAUSE_REPORT.md` yazılır ve döngü durur.

Cihaz kapısı arızayı sınıflandırır. Emülatör kopması veya toolchain çöküşü gibi
ortam arızaları `DEVICE_REPORT.json` içinde `failure_kind: "environment"` ile
işaretlenir ve projeyi başarısız saymak yerine `awaiting_device_test` durumunda
bekletir. Testlerden gelen gerçek hatalar `failure_kind: "product"` olarak kalır;
tanınmayan hata da ürün hatası sayılır. Panel hata mesajında gerçekten başarısız olan
çeki, exit kodunu ve ilgili log dosyasını gösterir.

Kapılar yetkilidir: Mobile Reviewer `TEST_REPORT.json` ve `DEVICE_REPORT.json`
sonuçlarını yeniden yargılamaz, PASS'i kanıt kabul eder. Reviewer bloklarsa en fazla
iki hedefli Review Repair turu uygulanır; her turdan sonra kalite ve cihaz kapıları
yeniden koşar ve inceleme tekrarlanır. Bulgular iki turda değişmezse döngü durur ve
gerekçeler proje hatasına yazılır.

## Pipeline stabilizasyonu

Her Flutter üretimi başlamadan önce Flutter CLI ve Android SDK için preflight kontrolü
yapılır; sonuç `QUALITY_LOGS/PREFLIGHT.json` altında tutulur. Üretilen `.dart_tool`,
`build`, Gradle cache ve yerel SDK ayarları otomatik `.gitignore` kurallarıyla agent
branch'lerinden uzak tutulur.

Builder, Integration ve Repair agent'ları Flutter/Gradle komutlarını çalıştırmaz.
Bu komutları yalnızca orchestrator sırasıyla çalıştırır ve tam çıktıları
`QUALITY_LOGS/` altında saklar. Kalite kapısı başarısız olursa en fazla üç hedefli
Repair turu uygulanır. Aynı hata imzası iki ardışık kontrolde değişmeden kalırsa
gereksiz token tüketimini önlemek için döngü erken durur ve
`ROOT_CAUSE_REPORT.md` oluşturulur. Özet sonuçlar her zaman `TEST_REPORT.json` ve
`TEST_REPORT.md` içinde bulunur.

Codex, Flutter ve cihaz komutları ortak asenkron süreç çalıştırıcısını kullanır.
Timeout bütün süreç ağacını sonlandırır; Windows `taskkill` başarısız olur veya
yanıt vermezse doğrudan `SIGKILL` fallback'i devreye girer. Flutter komut sınırı
`MVP_STUDIO_FLUTTER_TIMEOUT_MS` ile yapılandırılır.

## Gereksinimler

- Node.js 24+
- Git
- Codex CLI
- Codex CLI içinde yapılmış ChatGPT oturumu

Flutter mobil profili için ek olarak:

- Flutter SDK (`FLUTTER_BIN` veya PATH üzerinden)
- Android SDK ve platform-tools
- `device_test: "required"` spec'ler için en az bir Android emülatörü veya cihaz

```powershell
node --version
git --version
codex --version
```

Codex oturumu henüz açılmadıysa bir kez `codex` çalıştırın.

Windows'ta Codex masaüstü uygulamasının içindeki binary otomasyona uygun olmayabilir.
Bağımsız CLI kurulumu için `npm install -g @openai/codex` kullanın. Studio Windows'ta
global paketin JavaScript giriş noktasını doğrudan Node.js ile çalıştırır.

## Çalıştırma

PowerShell veya Windows Terminal açın:

```powershell
cd C:\Users\efeklc\Documents\GitHub\ai-mvp-studio
npm start
```

Panel: <http://127.0.0.1:8000>

Ayarlar ortam değişkenleriyle değiştirilebilir; tüm anahtarlar ve varsayılanları
[.env.example](.env.example) dosyasındadır. Eşzamanlılık üç ayrı sınırla yönetilir:
aynı anda çalışan proje sayısı (`MVP_STUDIO_MAX_CONCURRENT_RUNS`), bir projedeki
paralel builder sayısı (`MVP_STUDIO_MAX_PARALLEL_BUILDERS`) ve tüm sistemdeki
Codex süreci sayısı (`MVP_STUDIO_MAX_CONCURRENT_AGENTS`). Sonuncusu diğer ikisinin
çarpımını sınırlayan üst kapıdır. Bir çalışmanın token sınırı
`MVP_STUDIO_PROJECT_TOKEN_BUDGET` (varsayılan 1.500.000, 0 = sınırsız).
Varsayılanlar proje başına 4 builder ve sistem genelinde 5 Codex sürecidir; kaynakları
kısıtlı makinelerde `.env` üzerinden düşürülebilir.

Terminalde aşağıdaki satır göründüğünde sunucu hazırdır:

```text
AI MVP Studio: http://127.0.0.1:8000
```

Sunucuyu durdurmak için aynı terminalde `Ctrl+C` kullanın. Geliştirme sırasında
dosya değişikliklerinde otomatik yeniden başlatma için `npm run dev` çalıştırılabilir.

8000 portunun kullanımda olup olmadığını kontrol etmek için:

```powershell
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
```

## Geliştirme ve doğrulama

Değişikliklerden sonra en az şu kontroller çalıştırılmalıdır:

```powershell
npm run check
npm test
```

`npm run check` bütün `src/*.mjs` modüllerinin sözdizimini, `npm test` ise veritabanı,
spec doğrulama, plan paralellik kuralları, scheduler, worktree, checkpoint, kalite ve
inceleme sözleşmeleri, kaynak teşhis taraması, cihaz kapısı, emülatör otomasyonu,
Codex timeout ve orchestrator davranışlarını denetler. Gerçek Codex kullanan düşük maliyetli kontrol
ayrı tutulur:

Tek gerçek ve çok kısa Codex çağrısıyla checkpoint akışını doğrulamak için:

```powershell
npm run test:minimal-live
```

Bu kontrol Architecture, UX, Reviewer ve context kesintisini yerel olarak simüle
eder; yalnızca devam eden Builder aşaması Codex kullanır ve tek bir `index.html`
üretir. Bittiğinde ölçülen token kullanımını terminale yazar.

Harici npm paketi kurulmaz; HTTP sunucusu, SQLite ve test altyapısı Node.js'in
yerleşik modüllerini kullanır. Runtime verileri `data/` ve `projects/` altında tutulur.

## Repository haritası

| Yol | Sorumluluk |
| --- | --- |
| `src/server.mjs` | Yerel HTTP API ve web paneli |
| `src/orchestrator.mjs` | Agent pipeline, checkpoint, Flutter kalite kapısı |
| `src/codex-runner.mjs` | Codex CLI sürecini çalıştırma, timeout ve JSONL olayları |
| `src/async-process-runner.mjs` | Codex, Flutter ve cihaz komutları için güvenli async süreç ağacı yönetimi |
| `src/database.mjs` | SQLite proje, görev, bağımlılık ve agent run kayıtları |
| `src/spec-validator.mjs` | Yüklenen PROJECT_SPEC doğrulaması |
| `src/task-*.mjs` | Görev planı, scheduler ve worktree/path izolasyonu |
| `src/quality-report.mjs` | Analyze, test ve APK raporlarının doğrulanması |
| `src/device-tester.mjs` | Android cihaz kapısı ve arıza sınıflandırması |
| `src/source-diagnostics.mjs` | Üretilen Dart kaynağında sessiz hata yutma taraması |
| `src/android-environment.mjs` | Emülatör başlatma, açılış bekleme, build-tools sağlığı |
| `src/context-packager.mjs` | Rol bazlı context paketleri |
| `src/config.mjs` | Ortam değişkenleri ve varsayılan ayarlar |
| `src/mvp_studio/static/index.html` | Web paneli |
| `templates/` | Genel ve Flutter mobil PROJECT_SPEC şablonları |
| `projects/<id>/repository/` | Üretilen uygulamanın ana Git repository'si |
| `projects/<id>/worktrees/` | Agent'ların izole çalışma alanları |
| `data/` | Studio'nun yerel SQLite/runtime verileri |

## Başka bir AI ile devam etme

Yeni bir AI oturumuna önce [AGENTS.md](AGENTS.md), ardından
[PROJECT_STATUS.md](PROJECT_STATUS.md) ve bu README dosyasını tamamen okutun. AI'ın
değişiklik yapmadan önce `git status --short`, `npm run check` ve ilgili testleri
incelemesini isteyin. `data/`, `projects/` ve mevcut Git worktree'leri çalışma
durumudur; açıkça istenmedikçe silinmemeli veya sıfırlanmamalıdır.

Yeni oturum için kısa başlangıç prompt'u:

```text
Bu repository'de çalışmaya devam et. Önce AGENTS.md, PROJECT_STATUS.md ve README.md
dosyalarını tamamen oku. Mevcut kullanıcı değişikliklerini koru; data/, projects/
ve worktree'leri silme. Git durumunu ve testleri incele, sonra mevcut hedefi özetle.
Değişiklik yapacaksan ilgili testleri çalıştır ve PROJECT_STATUS.md dosyasını güncelle.
```

## Güvenlik modeli

Codex yalnızca oluşturulan proje dizininde ve `workspace-write` sandbox modunda
çalıştırılır. Studio `danger-full-access` kullanmaz. İlk sürüm otomatik deployment
yapmaz; yayınlama daha sonra ayrı ve kullanıcı onaylı bir aşama olacaktır.
