# AI MVP Studio

AI MVP Studio, bilgisayarında çalışan ve Codex CLI süreçlerini yöneterek uygulama
prototipleri üreten local-first bir MVP atölyesidir. Studio'nun kendisi yayınlanmaz;
üretilen projeler kullanıcı onayından sonra ayrı olarak yayınlanabilir.

## Çalışma modeli

1. Ürün fikrini ChatGPT ile olgunlaştırın.
2. [PROJECT_SPEC.template.md](templates/PROJECT_SPEC.template.md) taslağını doldurun.
3. Açık kararları kapatıp frontmatter içindeki `status` değerini `approved` yapın.
4. Dosyayı Studio paneline yükleyin.
5. Doğrulama başarılıysa Codex üretimini başlatın.

`PROJECT_SPEC.md` uygulama üretiminde tek gerçek kaynak olarak kullanılır ve her
oluşturulan projenin repository köküne değişmeden kaydedilir.

Mobil spec'lerde `Kritik Kullanıcı Akışları` bölümü zorunludur. Studio bu akışları
proje oluşturulurken makinece okunabilir `USER_FLOWS.json` sözleşmesine dönüştürür;
planlama, uygulama, integration test ve review agent'ları aynı sözleşmeyi kullanır.

## İlk sürümün kapsamı

- Yerel web panelinden PROJECT_SPEC.md yükleme ve doğrulama
- Her proje için izole bir Git çalışma alanı
- Codex CLI'yi etkileşimsiz ve JSONL çıktıyla çalıştırma
- SQLite üzerinde proje ve çalışma durumu
- Codex olaylarını ve son çıktıyı panelde görüntüleme
- Aynı anda sınırlı sayıda çalışma yürütme
- Aynı proje içinde paralel Architecture ve UX agent'ları
- İzole Git worktree'leri, Builder ve final Reviewer aşaması
- Süre/token bütçesi olmadan Git checkpoint tabanlı duraklatma ve devam ettirme
- Kalıcı görev grafiği, görev bağımlılıkları ve path çakışmasını önleyen scheduler
- Repository içindeki `PROJECT_STATE.json` ile context bağımsız proje hafızası
- Rol/görev bazlı dar context paketleri ve cache ayrıştırılmış token metrikleri
- Yapılandırılmış analyze/test/APK kalite raporu ve kullanıcı kabul kapısı

## Çoklu-agent akışı

```text
PROJECT_SPEC.md
  ├─ Architecture Agent ─→ ARCHITECTURE.md ┐
  └─ UX Agent ───────────→ UX_SPEC.md ──────┤ (paralel)
                                             ↓
                                      Builder Agent
                                             ↓
                                      Reviewer Agent
                                             ↓
                                       completed
```

Architecture ve UX agent'ları ayrı Git worktree'lerinde çalışır ve yalnızca kendi
plan dosyalarını değiştirebilir. Coordinator doğrulanan `TASK_PLAN.json` dosyasını
üretir. Scheduler bağımsız Flutter Builder görevlerini en fazla üç ayrı worktree'de
paralel çalıştırır; dosya kapsamını doğrulayıp branch'leri deterministik sırayla
birleştirir. Integration, Flutter Test, koşullu Repair ve Mobile Reviewer aşamaları
bu grafiğin devamında çalışır.

## Checkpoint ve devam sistemi

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

Claude entegrasyonu ilk sürümün kapsamında değildir.

## Koordineli görev modeli

Yeni projeler varsayılan olarak `flutter_mobile` profiliyle açılır. Architecture ve
UX görevleri paralel çalışabilir; Builder ancak ikisi tamamlandığında, Reviewer ise
Builder tamamlandığında hazır hale gelir. Scheduler aynı anda çalışacak görevlerin
`allowed_paths` alanlarını karşılaştırır ve çakışan dosya sahipliklerini paralel
başlatmaz.

Görevler ve bağımlılıkları SQLite'taki `tasks` ve `task_dependencies` tablolarında
kalıcıdır. Durum, checkpoint commit'i, worktree/branch, deneme sayısı ve hata bilgisi
`PROJECT_STATE.json` dosyasına da yansıtılır. Panel görev grafiğini canlı gösterir.

Agent'lar tüm repository geçmişi yerine rollerine göre seçilen belgeler, görev
sözleşmesi ve yalnızca izinli path diff özetiyle çalışır. Her context manifesti ve
karakter boyutu agent run kaydında saklanır. Panel toplam giriş yerine cache dışındaki
gerçek yeni giriş tokenını ayrıca gösterir.

Flutter kalite kapısı `flutter analyze`, `flutter test` ve `flutter build apk --debug`
sonuçlarının üçünü de yapılandırılmış `TEST_REPORT.json` içinde PASS olarak ister ve
APK dosyasının workspace içinde gerçekten var olduğunu doğrular. Teknik başarı projeyi
`awaiting_user_review` durumuna getirir; kullanıcı panelden APK'yı indirebilir, ürünü
kabul edebilir veya hedefli bir Feedback Repair turu başlatabilir.

Mobil spec'te `device_test: "required"` ise teknik kontrolden sonra Android cihaz
kapısı çalışır. Studio `ADB_BIN`, Android SDK platform-tools ve LDPlayer 9 yollarını
sırayla arar. Bağlı cihaz yoksa proje `awaiting_device_test` durumunda bekler. Cihaz
bağlandığında paneldeki **Cihaz testini yeniden dene** düğmesi kullanılabilir. Kapı,
kritik akışların `integration_test/` kapsamını, cihaz üstündeki Flutter integration
testlerini, APK kurulumunu, uygulama sürecini ve logcat crash kayıtlarını doğrular.
Kanıtlar `DEVICE_REPORT.json` ve `QUALITY_LOGS/DEVICE_*` dosyalarında saklanır.

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

## Gereksinimler

- Node.js 24+
- Git
- Codex CLI
- Codex CLI içinde yapılmış ChatGPT oturumu

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

`npm run check` ana JavaScript modüllerinin sözdizimini, `npm test` ise veritabanı,
spec doğrulama, görev grafiği, scheduler, worktree, checkpoint, kalite raporu ve
orchestrator davranışlarını denetler. Gerçek Codex kullanan düşük maliyetli kontrol
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
| `src/codex-runner.mjs` | Codex CLI sürecini çalıştırma ve JSONL olaylarını okuma |
| `src/database.mjs` | SQLite proje, görev, bağımlılık ve agent run kayıtları |
| `src/spec-validator.mjs` | Yüklenen PROJECT_SPEC doğrulaması |
| `src/task-*.mjs` | Görev planı, scheduler ve worktree/path izolasyonu |
| `src/quality-report.mjs` | Analyze, test ve APK raporlarının doğrulanması |
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
