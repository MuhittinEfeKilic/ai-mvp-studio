# AI MVP Studio — Güncel Durum ve Handoff

Son güncelleme: 28 Ağustos 2026

## Mevcut durum

- Yerel panel `npm start` ile `http://127.0.0.1:8000` adresinde çalışır.
- Çoklu-agent Flutter pipeline; Architecture, UX, Coordinator, paralel Builder,
  Integration, Test, Repair ve Reviewer aşamalarını içerir.
- SQLite görev grafiği, Git checkpoint/resume, path izolasyonu ve üç turlu repair
  stabilizasyonu uygulanmıştır.
- Flutter preflight, tam `QUALITY_LOGS`, yapılandırılmış `TEST_REPORT` ve gerçek APK
  varlık kontrolü mevcuttur.
- Son Studio regresyon sonucu: 81/81 test başarılı (28 Ağustos 2026, Node 24.15).
  Yeni oturum bunu güncel ortamda yeniden doğrulamalıdır.

## Örnek proje: Servis Cep

- Proje kimliği: `a87cfbf38ea4`
- Repository: `projects/a87cfbf38ea4/repository/`
- APK analyze/test/build kalite kapısından geçmiş ve LDPlayer'a kurulmuştur.
- LDPlayer testi ana ekranın ve yeni iş emri formunun açıldığını doğruladı.
- Kritik ürün hatası (açık): Yeni İş Emri formundaki müşteri alanı serbest metin alıyor,
  repository ise `customers` tablosundaki gerçek `customer_id` değerini bekliyor.
  Bu nedenle dashboard üzerinden iş emri kaydı foreign-key hatasıyla başarısız oluyor
  ve UI yalnız “İşlem tamamlanamadı. Tekrar deneyin.” mesajını gösteriyor.
- Bu hata Studio'nun mevcut unit/repository kalite kapısının özellikler arası gerçek
  kullanıcı akışlarını garanti etmediğini göstermiştir.

## Örnek proje: Stok Cep

- Proje kimliği: `b9c53b9a14bf`, durum: `failed` (28 Ağustos 2026 öncesi kodla).
- Analyze/test/APK kapısı geçti; cihaz kapısı LDPlayer emülatörünün kopması nedeniyle
  düştü (`No application found for TargetPlatform.android_x64`, `device offline`,
  aapt çöküşü). Uygulama kodunda kanıtlanmış bir hata yok.
- T2 düzeltmesinden sonra bu senaryo `awaiting_device_test` üretir; proje panelden
  **Cihaz testini yeniden dene** ile kurtarılabilir.
- Kök neden ABI eksikliği DEĞİL (28 Ağustos 2026'da doğrulandı): üretilen APK
  x86_64 içeriyor. Gerçek sebep host toolchain'i — `aapt`,
  `build-tools/36.1.0-rc1` altından exit `-1073741502` (DLL init failure) ile
  çökmüş, ardından emülatör offline olmuş. Makinede 36.0.0 dahil stabil sürümler
  kurulu; tekrar denemeden önce release candidate yerine stabil build-tools
  kullanıldığından emin olun.

## Stabilizasyon V2 ilerlemesi

Tamamlanan ilk paket:

- Mobil spec için `device_test: "required"` kararı zorunlu hâle getirildi.
- `Kritik Kullanıcı Akışları` bölümü; başlıklı akış, en az üç numaralı adım ve
  `Beklenen sonuç` sözleşmesi olmadan spec onaylanmıyor.
- Akışlar yeni proje repository'sine `USER_FLOWS.json` olarak kaydediliyor.
- Architecture, UX, Coordinator, Integration ve Reviewer prompt'ları bu sözleşmeyi
  kullanıyor; foreign-key/reference değerlerinin serbest metin alanından gelmesi
  bloklayıcı hata olarak tanımlandı.
- Coordinator her kritik akış için `integration_test` çıktısı istemekle yükümlü.

Tamamlanan bağlantı paketi:

- Kritik akış sayısı kadar `integration_test/*_test.dart` dosyası zorunlu.
- ADB yolu ortam değişkeni, Android SDK ve LDPlayer konumlarından bulunuyor.
- Bağlı cihazda integration test, APK kurulum, uygulama açılışı, process ve logcat
  crash kontrolleri çalışıyor.
- `DEVICE_REPORT.json`, cihaz ekran görüntüsü, UI ağacı ve tam loglar saklanıyor.
- Cihaz yokken proje `awaiting_device_test` durumunda güvenli biçimde bekliyor.
- Cihaz sonucu SQLite ve web panelinde gösteriliyor.

## Tamamlanan güvenilirlik paketi (28 Ağustos 2026)

Tam repository incelemesinde bulunan on sorun kapatıldı. Test sayısı 44'ten 58'e çıktı;
her madde kendi regresyon testiyle korunuyor. Bu bölüm kalıcı kayıttır — aynı hataları
yeniden açmamak için önce burayı okuyun.

### Kalite kapısının güvenilirliği

1. **Cihaz kapısı hatası artık batan çeki bildiriyor.** Eskiden hangi çek düşerse düşsün
   `flow_coverage.details` yazılıyordu; `Stok Cep` hatası bu yüzden PASS olan bir çekin
   metnini gösteriyordu. Yeni saf `describeDeviceFailure(report)`
   (`src/device-tester.mjs`) ilk FAIL çekini, exit kodunu ve log dosyasını döndürür.
2. **Ortam arızası ürün hatasından ayrıldı.** `classifyDeviceFailure(logText)` →
   `{ kind, signal }`. Ürün sinyalleri (`EXCEPTION CAUGHT BY FLUTTER TEST FRAMEWORK`,
   `Expected:`/`Actual:`, `FATAL EXCEPTION`) ortam sinyallerini yener. Emülatör kopması,
   ABI uyumsuzluğu veya toolchain çöküşü artık `WAITING` + `failure_kind: "environment"`
   üretir ve proje `failed` yerine `awaiting_device_test` durumunda bekler.
   **Tanınmayan hata bilinçli olarak `product` kalır**; aksi hâlde gerçek bir kusur
   sessizce bekleme durumuna park edilirdi. Sinyal seçimi log içinde en erken geçene
   göre yapılır, kök nedene en yakın olan odur.
3. **Kullanıcı geri bildirimi turu cihaz kapısını atlayamaz.** `#executeFeedbackRepair`
   teknik kapıdan sonra ana hattaki cihaz kapısını aynı koşulla çalıştırır. Aynı yerde
   iki yan hata daha kapandı: feedback yolundaki `catch` her hatayı `failed` yapıyordu
   (artık ortak `#failureStatus` ile `paused_*` / `awaiting_device_test` üretiyor) ve
   resume ana hatta düşüp tamamlanmış Repair agent'ını yeniden ücretlendiriyordu.
   Açık `user_feedback` artık bitmemiş bir feedback turunu işaretler; resume o yola
   döner ve başarıda alan temizlenir.

### Kurtarılamaz duruma düşmeyi engelleme

4. **Coordinator görev sınırı tek kaynaktan geliyor.** `builderTaskLimit(spec)`
   (`src/orchestrator.mjs`) hem prompt'a yazılıyor hem validator'a veriliyor. Eskiden
   prompt "2–4 görev" isterken validator 15 KB altındaki spec'lerde 3 ile sınırlıydı;
   4 görevlik plan projeyi kalıcı olarak kilitliyordu (`TASK_PLAN.json` diskte kaldığı
   için her resume aynı hataya düşüyordu). `#produceTaskPlan` reddedilen planı silip
   gerekçesiyle bir kez daha istiyor ve `task_plan.rejected` olayı yazıyor.
5. **Tüm ara proje durumları kurtarılabilir.** `IN_FLIGHT_PROJECT_STATUSES` ve
   `RESUMABLE_PROJECT_STATUSES` (`src/database.mjs`) açık sözleşme oldu; eksik olan
   `testing`, `device_testing`, `technically_verified` ve `device_test_passed`
   kapsama girdi. Bu listeye yeni durum eklerken testi de güncelleyin.
6. **Resume tamamlanmış agent'ları atlıyor.** Integration ve Reviewer artık görev
   `completed` ise çalıştırılmıyor; Reviewer kararı `final_message`'tan okunuyor.
7. **Aynı proje iki kez kuyruğa alınamıyor.** Tüm kuyruğa alma `#enqueue`'dan geçiyor;
   `busyProjects` seti kuyruk ve yürütme boyunca dolu. Asıl açık `retryTask`'taydı:
   çalışan bir projede başka bir görevi yeniden denemek aynı worktree üzerinde ikinci
   bir `#execute` başlatıyordu.

### Dayanıklılık

8. **Codex çağrılarının süre sınırı var.** `MVP_STUDIO_CODEX_TIMEOUT_MS` (varsayılan
   60 dakika) ve ayrı bir `version()` sınırı. Zaman aşımında süreç ağacı Windows'ta
   `taskkill /t /f` ile öldürülür; proje `failed` olur, yani panelden devam ettirilebilir.
9. **Eşzamanlılık üç ayrı ayara bölündü.** `MVP_STUDIO_MAX_CONCURRENT_RUNS` (proje),
   `MVP_STUDIO_MAX_PARALLEL_BUILDERS` (proje içi builder) ve
   `MVP_STUDIO_MAX_CONCURRENT_AGENTS` (tüm sistemdeki Codex süreci). Eskiden tek ayar
   ikisini birden yönetiyordu ve varsayılan 3 ile en kötü durumda 9 eşzamanlı süreç
   oluşuyordu. Global sınır `Orchestrator` içindeki semaforla uygulanır; hiçbir agent
   slot tutarken başka bir agent'ı beklemediği için kilitlenme oluşmaz.
10. **Küçük düzeltmeler.** `#commitArtifact` artık tam yol karşılaştırıyor (eskiden
    `endsWith` kullandığı için `DRAFT_ARCHITECTURE.md` gibi dosyalar kaçıyordu);
    `config.mjs` `APPDATA` yoksa `codex`'e düşüyor; boş `tests/` dizini kaldırıldı,
    tek test kaynağı `test/`.

### Bilinçli kararlar

- **Codex thread resume kullanılmıyor.** `CodexRunner` içindeki ölü `resumeThreadId`
  dalı kaldırıldı. `paused_context` sonrası aynı thread'e dönmek tükenmiş context
  penceresine geri dönmek olurdu. `thread_id` yine kaydediliyor (panel/teşhis için).
  Yeniden bağlamak isteyen önce hangi duraklama türünde güvenli olduğunu tanımlamalı.
- **Teknik kapı ürün kabulü değildir.** Analyze/test/APK PASS, kritik akışların
  çalıştığını kanıtlamaz; cihaz kapısı bu yüzden hem ana hatta hem feedback turunda
  zorunludur.

## Tamamlanan teşhis ve device repair paketi (28 Ağustos 2026)

### Kaynak teşhis kontrolü

`src/source-diagnostics.mjs` üretilen `lib/` ve `integration_test/` kaynaklarını
tarayıp teşhis edilemeyen hata yönetimini bulur. Kural: **boş catch bloğu** ya da
**hatayı ne inceleyen ne yeniden fırlatan** blok. Dize interpolasyonu kod sayılır
(`log('kayıt: $error')` kabul edilir), düz metindeki "error" kelimesi sayılmaz.
`catch (_) { cleanup(); rethrow; }` kabul edilir; ad atılsa da hata korunur.

Sonuç dördüncü kalite çeki olarak `TEST_REPORT.json` içine girer
(`analyze`, `test`, `apk`, `diagnostics`) ve kapıyı diğerleri gibi bloklar.
Kontrol `#writeQualityReports` içinde çalışır; yani `flutterChecker` test kancası
devredeyken bile hem ana hatta hem feedback turunda uygulanır. Repair prompt'u
bulguları hedefli biçimde düzeltmekle yükümlüdür.

### Hedefli Device Repair döngüsü

Cihaz kapısı artık ürün hatasında projeyi doğrudan düşürmüyor: en fazla
`MAX_DEVICE_REPAIR_ROUNDS` (2) turluk hedefli repair uygulanıyor. Her tur sonunda
APK **yeniden üretilip doğrulanıyor**, çünkü cihaz kapısı APK kuruyor; onarılmış kod
kurulmazsa tur anlamsız olurdu.

Döngü üç durumda durur ve `DEVICE_ROOT_CAUSE_REPORT.md` yazar:

1. `deviceFailureSignature` iki ardışık turda aynı kalırsa (boşuna token yakmamak için).
2. İzin verilen tur sayısı biterse.
3. Hata bir agent turuyla düzeltilemezse — `isRepairableDeviceFailure`. Şu an tek
   örnek: `USER_FLOWS.json` hiç yoksa kapsam doğrulanamaz ve düzeltme PROJECT_SPEC
   seviyesindedir. Akışlar tanımlı ama integration testi eksikse repair **çalışır**,
   çünkü agent o testleri yazabilir.

Ortam arızaları bu döngüye hiç girmez; `WAITING` olarak `awaiting_device_test`
üretmeye devam ederler.

## Örnek proje düzeltmesi: Servis Cep foreign-key hatası

`projects/a87cfbf38ea4/repository` üzerinde uygulandı:

- `work_order_form_page.dart` müşteri alanı serbest metin `TextFormField` idi ve
  `customerId` olarak ham metni gönderiyordu. Artık `FormField<String>` ile
  müşteri seçicisinden gelen gerçek `id` tutuluyor; seçim yapılmadan kayıt
  denenmiyor.
- Seçici, feature'lar arası bağımlılık kurmamak için entegrasyon katmanındaki
  `_selectCustomer` üzerinden açılıyor (`feature_routes.dart`); iş emri özelliği
  müşteri özelliğini import etmiyor, yalnızca `CustomerSelection` alıyor.
- Düzenleme ekranı `initialCustomer` ile mevcut müşteriyi adıyla gösteriyor.
- Kaydetme hatası artık teşhis edilebilir: `AppFailure` mesajı olduğu gibi,
  beklenmeyen hata ise adıyla gösteriliyor ve `debugPrint` ile loglanıyor.
  Eski "İşlem tamamlanamadı. Tekrar deneyin." mesajı kaldırıldı.
- Aynı teşhis düzeltmesi `app.dart`, `customer_form_page.dart`,
  `pdf_preview_page.dart` ve `settings_page.dart` içindeki beş sessiz yutmaya da
  uygulandı.
- Yeni `test/widget/work_orders/work_order_form_test.dart` üç davranışı koruyor:
  serbest metin alanı yok, seçim yapılmadan kayıt yok, hata mesajı spesifik.
- Doğrulama: `flutter analyze` temiz, `flutter test` 40/40, `flutter build apk
  --debug` başarılı, kaynak teşhis kontrolü PASS.

## Tamamlanan hız ve paralellik paketi (28 Ağustos 2026)

Gerçek çalışmaların ölçümüyle başlandı (`agent_runs` zaman damgaları):

| | Stok Cep | Odak Mini |
| --- | --- | --- |
| Toplam duvar saati | 2301s | 5722s |
| Agent süresi | 1620s (%70) | 1970s (%34) |
| Builder paralelliği | **x1.00** | x1.24 |

En büyük kayıp builder'ların hiç örtüşmemesiydi. Scheduler gerçek planla
çalıştırılınca sebep bulundu: iki bağımsız görevden biri
`test/features/products/**`, diğeri `test/features/products/detail/**` sahipliği
almış; iç içe yollar çakışma sayıldığı için scheduler onları seri çalıştırdı.
Scheduler doğru davranıyordu, hatalı olan plandı.

### Yapılanlar

1. **Plan sözleşmesi paralelliği zorunlu kılıyor.** `validateTaskPlan` artık
   birbirine bağlı olmayan görevlerin yol sahipliğini çakıştırmasını (iç içe
   yollar dahil) ve üç+ görevli tamamen seri grafiği reddediyor. Ayrıca döngüsel
   bağımlılık tespiti eklendi — eskiden scheduler'ı kilitlerdi. Reddedilen plan,
   T4'teki mekanizmayla gerekçesiyle bir kez daha isteniyor.
2. **Dalga bariyeri kaldırıldı.** `#runBuilderGraph` artık sürekli scheduler:
   biten görev slotunu hemen bırakıyor, dalgadaki en yavaşı beklemiyor.
   Eşzamanlı görevler ayrık yollar sahiplendiği için birleştirme sırası sonucu
   değiştirmiyor.
3. **Uygulama iskeletini orchestrator üretiyor.** `flutter create` +
   `flutter pub get` saniyeler sürüyor; eskiden bu boilerplate'i üreten
   "app-shell" görevi kritik yolda ~431s agent zamanı harcıyor ve diğer her şey
   ona bağlanıyordu. Üretilen smoke test, `main.dart` değişince kırıldığı için
   yer tutucu bir testle değiştiriliyor (boş `test/` dizini de
   `flutter test`'i düşürüyor).
4. **Gradle ısınması planlama agent'larıyla örtüşüyor.** Soğuk APK derlemesi
   ölçülen en pahalı toolchain adımı (177.7s; analyze 1.8s). Artık iskeletten
   hemen sonra arka planda başlatılıp Architecture/UX/Coordinator penceresine
   saklanıyor. En iyi çaba: başarısızlığı projeyi düşürmez.
5. **Bağımlılıklar merkezden kuruluyor.** Coordinator paketleri
   `TASK_PLAN.json` içindeki `dependencies` alanında bildiriyor, orchestrator
   `flutter pub add` ile kuruyor. Hiçbir builder `pubspec.yaml` sahiplenemiyor —
   en sık çakışan paylaşılan dosya devreden çıktı.
6. **Reviewer cihaz kapısıyla paralel çalışıyor.** Reviewer yalnız okuyor, cihaz
   kapısı dakikalar sürüyor. Device repair gerekirse review önce sonlandırılıp
   sonucu geçersiz kılınıyor ve tekrar çalıştırılıyor; cihaz beklemesinde ise
   PASS sonucu kaydediliyor, böylece resume aynı incelemeyi tekrar ücretlendirmiyor.
7. **Toolchain yolları önbelleklendi.** `resolveFlutter`/`resolveAdb` her
   çağrıda gerçek bir `--version` süreci başlatıyordu (~2.3s).

### Uygulama sırasında çıkan iki gerçek hata

- **Bloklayan event loop.** Reviewer'ı "paralel" başlatmak tek başına yetmiyordu:
  cihaz kapısı ve kalite kapısı `spawnSync` tabanlı olduğu için Node'un event
  loop'unu dakikalarca blokluyor, yani eşzamanlı başlatılan agent hiç
  başlamıyordu. Kalite kapısı `spawn` tabanlı asenkron hâle getirildi; cihaz
  aşaması ise bloklayan çağrıdan önce event loop'a yol veriyor. Bu aynı zamanda
  **projeler arası** paralelliği de açıyor: eskiden bir projenin APK derlemesi
  diğer projelerin agent'larını da durduruyordu.
- **Analyze/test paralelleştirilmedi.** Listede vardı ama ölçüm analyze'ı 1.8s
  gösterdi; kazanç ~2s iken tüm kalite kapısını yeniden yapılandırma riski
  taşıyordu. Bilinçli olarak yapılmadı.

### Doğrulama

Gerçek Flutter toolchain'iyle (Codex yerine stub agent) uçtan uca koşuldu:
iskelet üretimi, ısınma derlemesi, `pub add`, paralel builder'lar, kalite kapısı
ve reviewer dahil **113s**'de `awaiting_user_review`; dört kalite çeki de PASS.
Studio regresyonu 71/71.

Yeni testler paralelliği davranışsal olarak kanıtlıyor: bağımsız builder'ların
zirve eşzamanlılığı 2 ve hızlı görev yavaş olanı beklemeden bitiyor; reviewer
cihaz kapısıyla örtüşüyor.

## Cihaz ortamı otomasyonu (28 Ağustos 2026)

Sistemin **hiçbir zaman uçtan uca yeşil koşmadığı** tespit edildi: beş projeden
yalnızca biri cihaz kapısına ulaştı, o da ortam arızasıyla düştü. Hiçbir projede
PASS cihaz raporu yok. Bunu engelleyen iki ortam sorunu otomatikleştirildi.

- `src/android-environment.mjs` eklendi: emülatör listeleme/başlatma, açılış
  bekleme ve build-tools sağlık kontrolü.
- **Cihaz kapısı artık emülatörü kendisi başlatıyor.** Bağlı cihaz yoksa
  `flutter emulators --launch` ile ilk emülatör açılıyor ve
  `sys.boot_completed` beklenene kadar poll ediliyor. Bu bekleme kritikti:
  `adb devices` henüz açılmakta olan emülatörü `device` olarak bildiriyor ve
  integration koşusu "Unable to start the app on the device" ile düşüyordu.
  Emülatör açılmazsa proje yine `awaiting_device_test` durumunda bekliyor.
- **Preflight build-tools sağlığını ölçüyor.** `aapt version` gerçekten
  çalıştırılıyor; çökerse rapor kurulu stabil alternatifi adıyla bildiriyor ve
  preflight FAIL veriyor.
- `runAndroidDeviceGate` ve `#runDeviceGate` asenkron hâle geldi (açılış
  beklemesi için gerekliydi).

Gerçek ortamda doğrulandı: build-tools PASS, emülatör listesi
`['Medium_Phone_API_36.0']`. Parser'ı yazarken gerçek çıktı bir hata yakaladı —
`flutter emulators` listesi `Id • Name • Manufacturer • Platform` başlığıyla
başlıyor ve bu satır geçerli bir emülatör kimliği gibi ayrıştırılıyordu;
`--launch Id` çağrısı üretecekti.

**Stok Cep kök nedeni düzeltildi (önceki not yanlıştı):** APK x86_64 içeriyor,
sorun ABI değildi. `aapt` şu an sorunsuz çalışıyor, yani o çökme geçiciydi —
büyük olasılıkla emülatör ölürken oluşan bir yan etki. Build-tools sabitlemesi
bilinçli olarak yapılmadı; sağlık kontrolü kalıcı bir bozulmayı yakalar.

## İlk uçtan uca cihaz koşusu (28 Ağustos 2026) — Ders Notu

Proje `c67140223074`, `examples/ders-notu/PROJECT_SPEC.md` ile çalıştırıldı.

**Cihaz kapısı projede ilk kez PASS verdi.** Emülatör otomasyonu çalıştı, üç kritik
akışın integration testi `emulator-5554` üzerinde geçti, APK kuruldu, uygulama
açıldı, fatal log yok. `TEST_REPORT` de dört çekin hepsinde PASS.

Buna rağmen proje `failed` oldu: **Reviewer reddetti** ve gerekçelerinin üçü
hatalıydı.

| Reviewer iddiası | Gerçek |
| --- | --- |
| Cihaz doğrulaması kanıtlanmadı | `DEVICE_REPORT.json` PASS'ti; reviewer'ın context'inde yoktu |
| Emülatör gerçek cihaz sayılmaz | Cihaz kapısı sözleşmesi emülatörü kabul eder |
| debug manifest INTERNET izni içeriyor | Flutter'ın test harness'ı için zorunlu; ürün manifesti izinsiz |
| TalkBack / %200 yazı ölçeği kanıtlanmadı | UX_SPEC'in uydurduğu, hiçbir kapının doğrulayamayacağı şart |

Kök neden yapısal: reviewer mekanik kapıların işini onların kanıtı olmadan tekrar
yargılıyordu ve "kanıtlanmamış"ı "kusurlu" sayıyordu. Yanlış negatif kaçınılmazdı.

### Yapılan düzeltmeler

1. **Reviewer artık kanıtı alıyor.** `ROLE_DOCUMENTS.reviewer` yalnız
   PROJECT_SPEC/TEST_REPORT içeriyordu; kendi prompt'unun adını verdiği
   `USER_FLOWS.json` ve `UX_SPEC.md` ile `DEVICE_REPORT.json` eklendi.
2. **Mandası daraltıldı.** Prompt açıkça söylüyor: `TEST_REPORT.json` ve
   `DEVICE_REPORT.json` yetkili kapılardır, sonuçları yeniden yargılanmaz;
   emülatör `device_test` şartını karşılar; `android/app/src/debug/**`,
   `profile/**` ve `test/scaffold_test.dart` toolchain dosyasıdır. Reviewer'ın
   işi kapıların bakamadığı şey: spec kapsamı, akış bütünlüğü, scope.
3. **"Kanıtlayamadım" artık bloklamıyor.** Reviewer sözleşmesine `notes` alanı
   eklendi; doğrulanamayan gözlemler oraya gider. `FAIL` sonucu en az bir
   engelleyici `issue` bildirmek zorunda, aksi hâlde sözleşme reddediyor.
4. **UX_SPEC bağlayıcı sözleşme değil.** UX prompt'u kabul listesine yalnız widget
   veya integration testiyle doğrulanabilir maddeleri koyuyor; ekran okuyucu, yazı
   ölçeği gibi manuel kontroller ayrı bir başlık altında öneri olarak yazılıyor.
5. **Hata mesajı gerekçeyi taşıyor.** Panelde "Mobile Reviewer kalite kapısını
   geçemedi." yerine reviewer'ın maddeleri görünüyor.

`c67140223074` `failed` durumunda ve kurtarılabilir: panelden **Checkpoint'ten
devam et** cihaz kapısını ve reviewer'ı yeni sözleşmeyle tekrar çalıştırır.
Tamamlanmış builder/integration agent'ları atlanır.

## Review Repair döngüsü (28 Ağustos 2026)

Reviewer düzeltmelerinden sonraki koşuda reviewer **doğru çalıştı**: kapıları
yetkili kabul etti, doğrulayamadıklarını `notes`'a koydu ve tek bir bloklayıcı
bulgu bildirdi — dosya, satır ve gerekçeyle:

> `lib/presentation/grade_add/grade_add_page.dart:313` — puan alanı
> `FilteringTextInputFormatter.digitsOnly` uyguluyor **doğrulamadan önce**.
> `"1.5"` sessizce `"15"` olup kaydediliyor, `"-1"` ise `"1"` oluyor.

Kaynakta doğrulandı; bulgu gerçek. Yani reviewer artık işini yapıyor. Ortaya çıkan
iki Studio eksiği kapatıldı:

1. **Reviewer FAIL'i artık terminal değil.** Kalite kapısının üç, cihaz kapısının
   iki repair turu vardı; reviewer'ın hiç yoktu ve düzeltilebilir tek bir kusur
   projeyi öldürüyordu. Artık `MAX_REVIEW_REPAIR_ROUNDS` (2) turluk hedefli
   Review Repair var. Her turdan sonra kod değiştiği için kalite kapısı ve cihaz
   kapısı yeniden koşuyor, sonra yeniden inceleniyor. Bulgular iki turda aynı
   kalırsa döngü erken duruyor ve gerekçeler hataya yazılıyor.
2. **Nesne biçimli bulgular okunabilir.** Reviewer bulguları
   `{file, description}` olarak döndürdü; sözleşme bunları `String()` ile
   düzleştirdiği için panelde `- [object Object]` görünüyordu.
   `normalizeReviewerFindings` artık `dosya: açıklama` biçiminde derliyor.
   Bu, bulgunun repair agent'ına anlamlı ulaşması için de şart.

**Süreç notu:** Studio kodu değiştiğinde `npm start` ile çalışan sunucu yeniden
başlatılmalıdır; Node modülleri süreç başlangıcında yükler. Bir resume, kaynak
düzeltildiği hâlde eski kodla koştuğu için aynı hatayı tekrarlamıştı. Teşhis için
`agent_runs.context_manifest` sütunu belirleyicidir: hangi belgelerin agent'a
gerçekten gittiğini gösterir.

## Açık kalan işler

1. **Servis Cep cihaz senaryosu çalıştırılmadı.** İki engel var: makinede bağlı
   Android cihaz/emülatör yok ve bu proje kritik akış sözleşmesinden önce üretildiği
   için `USER_FLOWS.json` ile `integration_test/` dizini içermiyor. Cihaz kapısı
   bu hâliyle `isRepairableDeviceFailure` kuralıyla hemen durur. Doğru sıra: spec'e
   kritik akışları ekleyip projeyi yeniden üretmek ya da akış sözleşmesini bu
   repository'ye elle eklemek.
2. **Stok Cep cihaz koşusu tekrarlanmadı.** Ayakta bir emülatör ve stabil
   build-tools gerekiyor (yukarıdaki kök neden notuna bakın). Emülatör bağlandığında panelden **Cihaz testini yeniden dene**
   yeterlidir; kod tarafında yapılacak bir şey yok.
3. **Cihaz kapısı hâlâ `spawnSync` tabanlı.** Kalite kapısının aksine
   `runAndroidDeviceGate` bloklayan çağrılar kullanıyor; bloklamadan önce event
   loop'a yol veriliyor, ama gate çalışırken Node ana thread'i meşgul. Tek
   projede sorun değil, çok projeli kullanımda sıradaki iş bekler. Asenkron
   `adb`/`flutter` çağrılarına çevrilmesi sıradaki dayanıklılık işi.
4. Studio'nun kendi `.dart_tool`, `build` ve `android/local.properties` dosyaları
   `projects/a87cfbf38ea4` içinde hâlâ **takip ediliyor** (ignore kuralları
   eklenmeden önce commit edilmişler). Temizlemek isteyen `git rm --cached`
   kullanmalı; bu oturumda dokunulmadı.

## Hızlı komutlar

```powershell
cd C:\Users\efeklc\Documents\GitHub\ai-mvp-studio
npm start
npm run check
npm test
```

Sunucuyu durdurmak için çalışan terminalde `Ctrl+C` kullanın.
