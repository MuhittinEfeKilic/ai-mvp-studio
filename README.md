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
- Android çalışma zamanında cihaz doğrulaması ve kritik akış kapsamı kontrolü
- Üç desteklenen cihaz hedefi kategorisi ve hedefe özgü temizlik politikası
- Kanıta bağlı inceleme sözleşmesi ve sözleşme ihlalinde tek turluk düzeltme isteği
- Kalite/cihaz/inceleme kapılarının her biri için **sınırlı** onarım döngüsü
- Deterministik süreç timeout'u ve process-tree sonlandırma
- Bloklamayan Flutter/Android toolchain yürütmesi
- Çalışma başına token bütçesi ve Git checkpoint tabanlı devam ettirme
- Deterministik release hazırlık değerlendirmesi ve `RELEASE_READINESS.json` raporu
- Deterministik uygulama bütünlüğü ölçümü ve `APPLICATION_COMPLETENESS.json` raporu

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
- `Kabul Kriterleri` → `ACCEPTANCE_CRITERIA.json` (`AC1..ACn`). İncelemenin
  bloklayabileceği **tek** liste budur; maddeler gözlemlenebilir ürün davranışı
  anlatmalıdır. Toolchain sonuçları `Kalite Gereksinimleri` bölümüne aittir.

Mobil template v2; özellik modülleri, iş kuralları, ekran durum matrisi, veri
sözleşmeleri, tasarım DNA/tokenları ve test izlenebilirliğini de zorunlu kılar.
`complexity_tier` (`simple`, `standard`, `advanced`) builder görev sayısını,
`target_parallelism` (2–6) doğrulanması gereken gerçek grafik genişliğini belirler.
`advanced` profil 4–8 builder görevi ve en az dört eşzamanlı çalışabilir görev ister.
Eski v1 spec'ler geriye uyumlu çalışır.

## Hat

```text
PROJECT_SPEC.md ─→ USER_FLOWS.json + ACCEPTANCE_CRITERIA.json
        ↓
Preflight (Flutter + Android SDK + build-tools sağlığı)
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
        └─ test sonrası temizlik (paket kaldırma, AVD ise wipe) → karara karışmaz
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
son doğrulanmış duruma bakar.** Device Repair kodu değiştirdiğinde eşzamanlı ya da
checkpoint'ten yüklenmiş eski reviewer kararı geçersiz sayılır ve reviewer, final
kalite ve cihaz PASS commit'lerinden sonra yeniden çalışmadan proje kullanıcı onayına
sunulmaz.

### Planlama ve görev grafiği

Planlama agent'ları ayrı Git worktree'lerinde çalışır ve yalnız kendi plan dosyalarını
değiştirebilir; başka bir dosyaya dokunan agent'ın çıktısı reddedilir. Coordinator bu
belgeleri birleştirip `TASK_PLAN.json` üretir ve plan şu kurallarla **mekanik olarak**
doğrulanır:

- Profile göre görev sayısı ve grafik genişliği (`target_parallelism`).
- `target_parallelism` kadar görev ilk dalgada bağımsız başlayabilmelidir; tek
  foundation görevinden sonra genişleyen fan-out planlar reddedilir.
- Birbirine bağlı **olmayan** görevler aynı yolları sahiplenemez. İç içe yollar da
  çakışma sayılır: `test/features/**` ile `test/features/detail/**` iki bağımsız
  göreve verilemez.
- Hiçbir görev `pubspec.yaml`/`pubspec.lock` sahiplenemez; paketler plandaki
  `dependencies` alanından okunup orchestrator tarafından `flutter pub add` ile kurulur.
- Döngüsel bağımlılık reddedilir.

Plan sözleşmeyi ihlal ederse gerekçesiyle **bir kez** yeniden istenir. Scheduler
bağımsız builder'ları ayrı worktree'lerde paralel çalıştırır, biten görevin slotunu
dalganın en yavaşını beklemeden serbest bırakır ve çakışan path sahipliklerini asla
aynı anda başlatmaz.

Agent'lar tüm repository geçmişi yerine rollerine göre seçilen belgeler, görev
sözleşmesi ve yalnız izinli path'lerin diff özetiyle çalışır. Her context manifesti ve
karakter boyutu agent run kaydına yazılır; teşhis için `agent_runs.context_manifest`
sütununa bakın.

### Kalite kapısı

`flutter analyze`, `flutter test` ve `flutter build apk --debug` sonuçlarının üçü de
`TEST_REPORT.json` içinde PASS olmalı ve APK dosyası workspace içinde gerçekten
bulunmalıdır. Dördüncü çek kaynak teşhis taramasıdır: üretilen Dart kodundaki boş veya
hatayı yutan `catch` blokları bloklayıcı sayılır — hata ya incelenmeli ya yeniden
fırlatılmalıdır. Dize interpolasyonu kod sayılır (`log('kayıt: $error')` kabul edilir).

Builder, Integration ve Repair agent'ları Flutter/Gradle komutu çalıştırmaz; bunları
yalnız orchestrator çalıştırır ve tam çıktıları `QUALITY_LOGS/` altında saklar.

Çevrimdışı bir ürünün `android/app/src/main/AndroidManifest.xml` dosyası ağ izni
taşımaz. Flutter test sürücüsünün VM Service'e bağlanabilmesi için debug/profile
manifestlerindeki tooling-only `INTERNET` izni kalite kapısından önce mekanik ve
idempotent biçimde geri yüklenir.

### Cihaz kapısı ve Android çalışma zamanı hedefleri

Mobil spec'te `device_test: "required"` ise teknik kontrolden sonra cihaz kapısı
çalışır. Aynı kapı kullanıcı geri bildirimi turundan sonra da işler: teknik kontroller
tek başına ürün kabulü sayılmaz.

Doğrulama **desteklenen bir Android çalışma zamanı hedefine** karşı yapılır, tek bir
emülatör türüne değil. Hedef, cihaz edinildikten hemen sonra sınıflandırılır ve
`DEVICE_REPORT.json` içindeki `target` alanında (tür, üretici, model, `ro.hardware`,
Android sürümü) raporlanır:

| Kategori | `type` | AVD'ye özgü temizlik |
| --- | --- | --- |
| Android Studio AVD | `android_studio_avd` | uygulanır |
| Üçüncü taraf Android emülatörü | `third_party_emulator` | uygulanmaz |
| Fiziksel Android cihaz | `physical_device` | uygulanmaz |

`emulator-NNNN` kimliği AVD kanıtı **değildir**: üçüncü taraf emülatörler de bu kimliği
alır, AVD konsol komutlarına yanıt vermez ve gerçek bir cihaz profilini taklit eder.
Sınıflandırma `ro.hardware` (goldfish/ranchu) ve qemu boot özellikleriyle yapılır.
Hiçbir hedef olmadığı şeymiş gibi etiketlenmez.

Kapı, kritik akışların `integration_test/` kapsamını, cihazın `/data` boş alanını
(varsayılan minimum 1536 MB, `MVP_STUDIO_DEVICE_MIN_FREE_MB`), cihaz üstündeki Flutter
integration testlerini, APK kurulumunu, uygulama sürecini ve logcat crash kayıtlarını
doğrular. Test başlamadan önce yalnız hedef uygulamanın eski paketi kaldırılır; başka
uygulama verisi silinmez. Integration test dosyaları geçici bir Dart girişinde
gruplanarak tek Flutter sürecinde, tek test APK kurulumuyla çalışır. Her senaryo 120
saniye; toplam süreç 180 saniye derleme payı + dosya başına 120 saniye ile sınırlıdır.
Sonuçlar `scenarios`, `completed_files` ve `failed_file` alanlarında tutulur; atlanan
veya sonucu bulunmayan akış PASS sayılmaz.

Teslim APK'sı test derlemesinden önce `<apk>.studio-backup` dosyasına kopyalanır ve
sonra geri yüklenip tek ek kurulumla normal açılışı doğrulanır. Studio bu iki adım
arasında yeniden başlatılırsa yedek diskte kalır; sonraki koşu onu geri yükleyip siler,
çünkü yedek tanımı gereği bozulmamış teslim APK'sıdır.

**Test sonrası temizlik kapı değildir.** Hedef paketin kaldırılması ve — hedef gerçekten
bir AVD ise — `-wipe-data` ile temiz yeniden başlatma, ürün kararı verildikten *sonra*
çalışır. Sonuçları `DEVICE_REPORT.json` içinde `housekeeping` altında ve başarısızsa
`notes` uyarısı olarak raporlanır, fakat **geçmiş bir ürün doğrulamasını geçersiz
kılamaz.** AVD olmayan hedeflerde wipe `SKIPPED`'tır; yapacak bir şey olmaması arıza
değildir. Fiziksel cihazlar hiçbir zaman otomatik sıfırlanmaz.

Kapı arızayı sınıflandırır. Emülatör kopması, toolchain çöküşü veya yetersiz depolama
gibi ortam arızaları `failure_kind: "environment"` ile işaretlenir ve projeyi başarısız
saymak yerine `awaiting_device_test` durumunda bekletir. Testlerden gelen gerçek hatalar
`failure_kind: "product"` kalır; **tanınmayan hata da ürün hatası sayılır**, çünkü aksi
hâlde gerçek bir kusur sessizce bekleme durumuna park edilirdi.

Bağlı cihaz yoksa Studio `flutter emulators --launch` ile ilk AVD'yi kendisi başlatır ve
`sys.boot_completed` özelliğini bekler; açılış tamamlanmadan test başlatılmaz. ADB yolu
`ADB_BIN`, Android SDK platform-tools ve PATH konumlarından sırayla aranır. ADB alt
komutları ortak process sınırını beklemez; 120 saniyelik `ADB_TIMEOUT` ile environment
WAITING sonucuna döner.

Her `DEVICE_REPORT.json` sonucu (PASS, FAIL veya WAITING) orchestrator-owned ayrı bir
Git commit'ine alınır; repair veya bağımlılık commit'lerine karışmaz.

### İnceleme sözleşmesi

Reviewer çıktısı şu şekli almak zorundadır:

```json
{"status":"PASS","summary":"...","criteria":[{"id":"AC1","status":"PASS","evidence":"..."}],
 "issues":[{"criterion":"AC1","file":"lib/x.dart:12","description":"..."}],"notes":["..."]}
```

- Her kabul kriteri **tam bir kez** yanıtlanmalıdır; eksik, fazla veya tekrarlanan
  kimlik reddedilir. Listede olmayan bir kriter uydurup projeyi bloklamak mümkün değildir.
- FAIL sonucu en az bir kriteri FAIL işaretlemelidir; PASS sonucu FAIL kriter içeremez.
- Doğrulanamayan gözlemler `notes` alanına gider ve durumu değiştirmez.
- Yeniden çalışan bir inceleme kendi önceki bulgularını görür ve her birini açıkça
  kapatmak zorundadır; sessizce vazgeçemez.
- **Sözleşmeyi bozan çıktı projeyi düşürmez.** Ayrıştırma başarısız olursa inceleme,
  somut gerekçesiyle **bir kez** daha istenir — reddedilen `TASK_PLAN.json` ile aynı
  ilke. İkinci çıktı da geçersizse proje normal biçimde başarısız olur; döngü yoktur.

Reviewer bloklarsa en fazla iki hedefli Review Repair turu uygulanır; her turdan sonra
kalite ve cihaz kapıları yeniden koşar. Bulgular değişmezse döngü durur ve gerekçeler
proje hatasına yazılır.

## Uygulama bütünlüğü

Kapılar geçtiği hâlde uygulamanın **bitmemiş görünmesi** ayrı bir sorundur:
`flutter analyze`, testler, APK ve cihaz akışları, ekranda hiçbir şey yapmayan bir
düğme, yerinde kalmış `flutter create` iskeleti veya "Yakında" yazan bir ekran
hakkında hiçbir şey söylemez. Bu ölçüm tam olarak bunu sorar: *bu uygulama, normal
kalite ve cihaz kontrollerini geçmiş olmasına rağmen tamamlanmamış olduğuna dair
belirgin izler taşıyor mu?*

Ölçüm koşunun sonunda, kod kesinleştikten sonra otomatik çalışır (ana hat ve geri
bildirim turu), sonucu üretilen repository'ye `APPLICATION_COMPLETENESS.json` olarak
yazılır ve projeye iliştirilir. **Bir kapı değildir:** proje durumunu, kalite/cihaz/
inceleme sonuçlarını ve mevcut kabul akışını değiştirmez, otomatik onarım tetiklemez.
Yalnız üretilen kaynağı okur; toolchain komutu, cihaz veya agent turu maliyeti yoktur.
Geçmiş projeler geriye dönük olarak eksik gösterilmez; ölçümü olmayan projede panel
"ölçüm kaydedilmemiş" der.

**Kapsam bilinçli olarak dardır:** yalnız `lib/` altındaki üretim kaynağı taranır.
`test/`, `integration_test/`, üretilmiş dosyalar (`*.g.dart`, `*.freezed.dart` …) ve
toolchain dosyaları taranmaz; oralarda stub, boş geri çağrı ve fixture meşrudur ve
taramak raporun güvenilirliğini gürültüye çevirirdi.

| Şiddet | Anlamı |
| --- | --- |
| **blocker** | Mekanik olarak savunulabilir bir olgu: kod hâlâ şablon, kontrol hiçbir şey yapmıyor, yol `UnimplementedError` fırlatıyor veya kullanıcının okuduğu metin yer tutucu. Durum `INCOMPLETE`. |
| **warning** | Gerçek bir tamamlanmamışlık izi, ama bilinçli bir karar olabilir. Durumu **asla** değiştirmez. |
| **info** | Kaydedilen olgu; yargı yok (taranan dosya sayısı). |

Çalışan kontroller:

| Kontrol | Şiddet | Ne arar |
| --- | --- | --- |
| `scaffold_remnant` | blocker | `MyHomePage`, `_incrementCounter`, `Flutter Demo`, "You have pushed the button" — `flutter create` iskeletinden kalan kod ve metin |
| `noop_interaction` | blocker | Boş bir fonksiyona bağlı eylem geri çağrısı (`onPressed: () {}`, `onTap: () {}`, `() async {}`, `() => {}`) |
| `unimplemented_stub` | blocker | Üretim kodunda `UnimplementedError` |
| `placeholder_copy` | blocker | Kullanıcıya gösterilen yer tutucu metin: `lorem ipsum`, `coming soon`, yalnız "Yakında" yazan etiket, `not implemented`, `placeholder`/`dummy`/`TBD` |
| `unfinished_marker` | warning | Üretim kaynağında `TODO` / `FIXME` / `HACK` |

**Yanlış pozitife karşı kurallar.** Dart kaynağı kod, yorum ve dize parçalarına
ayrıştırılır; string interpolasyonu kod olarak okunur, bu yüzden bir yorumdaki kesme
işareti ya da bir URL'deki `//` taramayı bozmaz. `onPressed: null` bulgu değildir —
Flutter'da devre dışı kontrol böyle yazılır. `onChanged`/`onSaved` gibi değer geri
çağrıları, `onUpgrade`/`onCreate` gibi sqflite yaşam döngüsü kancaları ve
`*Changed`/`*Update`/`*Invoked` ile biten her ad kapsam dışıdır; boş gövdeleri meşru
bir karardır. Gövdesi yalnız açıklama içeren boş bir geri çağrı blocker değil
uyarıdır: birisi neden boş olduğunu yazmıştır.

**Spec farkındalığı.** `PROJECT_SPEC.md` yer tutucu metnin **birebir kendisini**
içeriyorsa (ör. spec "Rapor ekranı \"Yakında\" gösterir" diyorsa) bulgu blocker değil
uyarı olur ve raporda `spec_permitted` işaretlenir. Karşılaştırma dizenin tamamı
üzerindedir; spec'in sözcüğü geçiyor olması gerçek bir "yakında" ekranını susturmaz.

**Otomatik onarım yoktur.** Bu ilk dilim ölçer ve kanıtı gösterir; bulguları düzeltmek
şimdilik kullanıcının kararıdır. Önce ölçüm, sonra otomasyon.

## Release hazırlığı

Ürün doğrulaması bittikten **sonra** cevaplanan tek bir soru: *bu MVP gerçek bir
harici kullanıcıya release adayı olarak verilmeye teknik olarak hazır mı?*
Değerlendirme yalnız `accepted` durumundaki projelerde, panelden elle tetiklenir ve
**proje durumunu değiştirmez** — sonucu `RELEASE_READINESS.json` olarak üretilen
repository'ye yazılır ve projeye iliştirilir. Bu, hattın hiçbir mevcut semantiğine
dokunmadan eklenen ayrı bir ölçümdür.

Değerlendirme tamamen deterministiktir; hiçbir modele "hazır görünüyor mu" diye
sorulmaz. Her bulgu üretilen projeden veya gerçek bir release derlemesinden okunan
bir olgudur.

**Metadata sözleşmesi.** Yeni bir girdi dosyası yoktur. `PROJECT_SPEC.md` *niyetin*
tek kaynağı olarak kalır (`project_name`, `package_name` ve isteğe bağlı
`version_name`, `version_code`, `short_description`, `release_notes`); üretilen
Flutter/Android dosyaları *gerçekte ne inşa edildiğinin* yetkili kaynağıdır
(`build.gradle[.kts]` → `applicationId`, `AndroidManifest.xml` → `android:label`,
`pubspec.yaml` → `version`). Rapor ikisini de kaydeder ve uyuşmazlığı bildirir;
aynı değer üçüncü bir yerde yeniden tanımlanmaz.

| Şiddet | Anlamı |
| --- | --- |
| **blocker** | Mekanik olarak doğrulanabilir, tek cümleyle savunulabilir bir olgu; artefaktı harici kullanıcı için kullanılamaz veya yanlış kimlikli yapar. Durum `BLOCKED`. |
| **warning** | Gerçek bir eksik, ama APK'yı bir test kullanıcısına vermeyi engellemez. Durumu **asla** değiştirmez. |
| **info** | Kaydedilen olgu; yargı yok (izinler, dışa açık bileşenler). |

Çalışan kontroller: uygulama kimliğinin geçerliliği ve örnek/şablon değeri olmaması,
kimliğin spec ile uyuşması, uygulama adının tanımlı ve çözülmüş olması, sürümün
`pubspec.yaml` üzerinden çözülebilmesi, spec sürüm uyuşmazlığı (uyarı), ürün
açıklamasının iskelet varsayılanı olmaması (uyarı), launcher simgesinin manifest
referansından çözülmesi, `lib/` içinde localhost/loopback adresi kalmaması, release
derlemesinin üretilebilmesi, artefaktın var ve boyutunun sıfırdan büyük olması,
SHA-256 özeti, imza durumu (uyarı), istenen izinler ve dışa açık bileşenler (bilgi).

Kimlik/yapılandırma engelleri varsa release derlemesi hiç çalıştırılmaz; dakikalarca
sürecek bir Gradle derlemesi zaten bilinen bir engel için harcanmaz.

**"Release Ready" ne demek, ne demek değil.** Bu ilk sürümde `READY`, şu anlama
gelir: kimlik tutarlı, gerçek bir release APK üretildi, dosya var, boş değil ve
sha256'sı kayıtlı — yani **sideload ile harici bir test kullanıcısına verilebilir.**
Şu anlama **gelmez:** mağaza dağıtımına hazır. Flutter şablonu release derlemesini
debug anahtarıyla imzalar; rapor bunu `signing.state: "debug_signing"` ve
`store_distribution_verified: false` olarak açıkça bildirir. Studio imza anahtarı
üretmez, parola/keystore saklamaz, Play App Signing yapılandırmaz ve hiçbir koşulda
"mağazaya hazır" demez. Dağıtıma giden kalan yol — üretim imzası, mağaza kaydı,
listeleme — henüz yazılmadı.

**Bloklamayan yürütme.** Flutter, Gradle, adb ve aapt komutlarının **tamamı** ortak
asenkron süreç çalıştırıcısından geçer. Orchestration hot path'inde senkron toolchain
çağrısı kalmadı; bunu `pipeline-stability` içindeki bekçi testi korur. Bir projenin
takılan `flutter pub get` komutu artık paneli, HTTP API'yi veya başka bir projenin
agent'larını dondurmaz. Flutter toolchain probe'u (`flutter --version`) süreç başına bir
kez çalışır ve **uçuştaki promise** cache'lenir, böylece aynı anda planlamaya giren
projeler probe'u tekrar ödemez.

**Bilinçli istisna:** yerel Git plumbing'i (`commit`, `status`, `merge`, `rev-parse`)
senkron kalır. Küçük bir worktree üzerinde çevrimdışı, milisaniyelik işlemlerdir; async
yapmak checkpoint ve merge dizilerine interleaving pencereleri açar ve ölçülebilir bir
kazanç getirmez.

**Deterministik timeout.** Timeout bütün süreç ağacını sonlandırır; Windows `taskkill`
başarısız olur veya yanıt vermezse doğrudan `SIGKILL` fallback'i devreye girer. Bir kez
tetiklenen timeout sonucu kesindir: sonlandırma sırasında gelen `close`/`error` olayları
sonucu değiştiremez, yalnız teşhis için `exit_during_termination` alanına yazılır.
Sınırlar `MVP_STUDIO_CODEX_TIMEOUT_MS` (varsayılan 60 dk) ve
`MVP_STUDIO_FLUTTER_TIMEOUT_MS` (varsayılan 10 dk) ile ayarlanır.

**Token bütçesi.** Bir çalışma `MVP_STUDIO_PROJECT_TOKEN_BUDGET` faturalanabilir tokenını
(cache dışı giriş + çıkış) aşarsa hat bir sonraki agent'ı **başlatmadan** durur ve proje
devam ettirilebilir biçimde `failed` olur. Kontrol agent'lar arasında yapılır; çalışan
bir Codex'i öldürmek işini kaybettirirdi. Bütçe kesintisiz bir çalışma içindir: devam
ettirmek yeni bir bütçe başlatır, çünkü resume bilerek verilmiş bir harcama kararıdır.

**Checkpoint ve devam.** Her agent başlamadan önce mevcut Git commit'i checkpoint olarak
SQLite'a kaydedilir; Codex thread kimliği ve bildirdiği token kullanımı da agent
çalışmasına eklenir. Codex kullanım limiti veya context penceresi nedeniyle durursa proje
`paused_usage` ya da `paused_context` olur. Studio kapanırsa yarım kalan proje
`interrupted` işaretlenir — reviewer'ı tamamlanmamış bir `awaiting_user_review` projesi de
güvenli devam noktasına alınır. Paneldeki **Checkpoint'ten devam et** aynı repository ve
worktree'leri kullanır. Atlama mekanizması aşamaya göre değişir: Integration ve
Reviewer görev durumuna bakılarak atlanır; planlama agent'ları kendi worktree'lerinde
ürettikleri belge mevcut ve worktree temizse yeniden çalıştırılmaz; Coordinator ise
`TASK_PLAN.json` zaten varsa çağrılmaz.

Aynı proje için aynı anda yalnız bir çalışma yürütülür; devam ettirme, görev yeniden
deneme ve geri bildirim istekleri çalışan bir projede reddedilir.

**Not:** `src/*.mjs` değiştikten sonra çalışan panel sunucusu yeniden başlatılmadan
değişiklik devreye girmez. Bir düzeltmeyi "işe yaramadı" diye değerlendirmeden önce bunu
doğrulayın. (Panel HTML'i istek başına okunur; bu kural yalnız `src/*.mjs` içindir.)

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

## Çalıştırma

```powershell
cd C:\Users\efeklc\Documents\GitHub\ai-mvp-studio
npm start
```

Panel: <http://127.0.0.1:8000>. Sunucu hazır olduğunda terminalde
`AI MVP Studio: http://127.0.0.1:8000` satırı görünür. Durdurmak için `Ctrl+C`.
Geliştirme sırasında `npm run dev` dosya değişikliğinde yeniden başlatır.

Ayarların tamamı [.env.example](.env.example) dosyasındadır. Eşzamanlılık üç ayrı
sınırla yönetilir: aynı anda çalışan proje sayısı (`MVP_STUDIO_MAX_CONCURRENT_RUNS`),
bir projedeki paralel builder sayısı (`MVP_STUDIO_MAX_PARALLEL_BUILDERS`) ve tüm
sistemdeki Codex süreci sayısı (`MVP_STUDIO_MAX_CONCURRENT_AGENTS`). Sonuncusu diğer
ikisinin çarpımını sınırlayan üst kapıdır. Varsayılanlar proje başına 4 builder ve
sistem genelinde 5 Codex sürecidir.

Panel sekmeli ve proje odaklıdır: **Genel · Çalışma · Doğrulama · Etkinlik**. Yoklama,
görünen veri değişmedikçe yeniden çizim yapmaz; açık panel, taslak metin ve kaydırma
konumu korunur.

## Doğrulama

```powershell
npm run check
npm test
```

`npm run check` 17 birinci taraf `src/*.mjs` modülünün sözdizimini denetler. `npm test`
**155 testtir** ve veritabanı, spec doğrulama, plan paralellik kuralları, scheduler,
worktree/path izolasyonu, checkpoint, kalite ve inceleme sözleşmeleri, kaynak teşhis
taraması, cihaz kapısı, cihaz hedefi sınıflandırması, emülatör otomasyonu, süreç timeout
semantiği, event loop canlılığı, release hazırlık değerlendirmesi, uygulama bütünlüğü
taraması ve orchestrator davranışlarını kapsar.

Tüm testler Codex'i taklit eder. Gerçek Codex'e dokunan tek ucuz kontrol ayrı tutulur:

```powershell
npm run test:minimal-live
```

Bu betik Architecture, UX, Coordinator, Integration ve Reviewer aşamalarını yerel
fixture'larla simüle eder; yalnız duraklamadan sonra devam eden Builder aşaması gerçek
bir Codex çağrısı yapar ve tek bir `index.html` üretir. Böylece checkpoint/resume
akışı, plan sözleşmesi, kalite kapısı ve inceleme sözleşmesi tek bir gerçek çağrı
maliyetiyle uçtan uca doğrulanır. Bitince ölçülen token kullanımını yazar.

**Son doğrulama kanıtı (10 Eylül 2026):** `npm run check` başarılı (17 modül); tam paket
**155/155 PASS**. Yeni olan 13 test uygulama bütünlüğü taramasını ve raporun hatta
iliştirilmesini kapsar.

**Önceki doğrulama kanıtı (9 Eylül 2026):** tam paket 142/142 PASS.
Timeout/stability testleri 30 kez koşuldu, sıfır flake. `npm run test:minimal-live` uçtan uca PASS: tek gerçek
Codex çağrısı, 33.592 giriş / 16.512 cache / 194 çıkış tokenı (**17.274
faturalanabilir**), proje `accepted` durumuna ulaştı. Gerçek Windows toolchain'inde
`flutter --version` asenkron yoldan 2465 ms sürdü ve bu süre boyunca event loop 235 kez
tick attı.

**Gerçek Flutter release kanıtı (9 Eylül 2026):** `Akış Cep` (`1d95246c0382`)
üzerinde gerçek bir `flutter build apk --release` koşuldu. Sonuç `READY`: 98 saniye,
`com.aimvpstudio.akiscep` · Akış Cep · 1.0.0+1, 55.838.362 baytlık APK,
sha256 `b382a7a1…` (bağımsız olarak yeniden hesaplanıp doğrulandı), 0 engel,
2 uyarı (`product_description` iskelet varsayılanı, `signing` debug anahtarı).
Bu **gerçek toolchain kanıtıdır**; testlerdeki diğer release senaryoları enjekte
edilmiş derlemelerle çalışan simülasyondur.

**Gerçek üretilmiş uygulama kanıtı (10 Eylül 2026):** bütünlük değerlendiricisi `projects/`
altındaki 10 üretilmiş repository'ye (186 üretim Dart dosyası) uygulandı. Sekizi
`COMPLETE`; iki proje gerçek bir bulguyla `INCOMPLETE`: `1ddc9c6ed5ae` iskelet sayaç
uygulamasını hâlâ `lib/main.dart` içinde taşıyor, `b9c53b9a14bf` (`Stok Cep`) hareket
listesinde `onTap: () {}` ile hiçbir şey yapmayan bir satır içeriyor. Yanlış pozitif
yok. Kayıtlı projelerin durumu ve Git geçmişi bu ölçüm için değiştirilmedi.

Uçtan uca hat gerçek koşularda kanıtlanmıştır; ölçümler ve proje bazlı kanıtlar
[PROJECT_STATUS.md](PROJECT_STATUS.md) dosyasındadır.

Harici npm paketi kurulmaz; HTTP sunucusu, SQLite ve test altyapısı Node.js'in yerleşik
modüllerini kullanır. Runtime verileri `data/` ve `projects/` altında tutulur.

## Bilinen sınırlar

- **Üretim imzası yok.** Release APK, Flutter şablonunun debug anahtarıyla imzalanır:
  sideload testi için yeterli, mağaza dağıtımı için değil. Studio anahtar üretmez ve
  saklamaz.
- **Yayınlama otomasyonu yok.** Hazırlık ölçülür, dağıtım yapılmaz. Döngünün
  "gerçek kullanıcı → ölçüm" tarafı henüz yazılmadı.
- **Release değerlendirmesi yeniden başlatmaya dayanıklı değil.** Studio değerlendirme
  sırasında kapanırsa koşu kaybolur; proje durumu değişmediği için zararsızdır,
  panelden yeniden tetiklenir.
- **Review Repair ve önceki bulgu hafızası gerçek koşuda tetiklenmedi**; yalnız birim
  testleriyle korunuyor.
- **Uygulama bütünlüğü yalnız mekanik izleri görür.** Ölü uçlu navigasyon, eksik
  yükleniyor/boş/hata durumu, doğrulanmayan form veya yarım kalmış bir özellik bu
  ölçümün kapsamında değildir; `COMPLETE` "ürün bitmiştir" demek değildir.
- **Eski örnek projeler güncel sözleşmelerin gerisinde.** Ayrıntı ve proje bazlı durum
  için [PROJECT_STATUS.md](PROJECT_STATUS.md).

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
| `src/device-tester.mjs` | Cihaz kapısı, arıza sınıflandırması, hata imzası |
| `src/release-readiness.mjs` | Deterministik release hazırlık değerlendirmesi ve rapor |
| `src/app-completeness.mjs` | Üretilen uygulamada tamamlanmamışlık izlerinin deterministik taraması |
| `src/android-environment.mjs` | Cihaz hedefi tespiti, emülatör başlatma, AVD temizliği, build-tools sağlığı |
| `src/context-packager.mjs` | Rol bazlı context paketleri |
| `src/config.mjs` | Ortam değişkenleri ve varsayılan ayarlar |
| `src/mvp_studio/static/index.html` | Web paneli |
| `templates/` | Genel ve Flutter mobil PROJECT_SPEC şablonları |
| `projects/<id>/repository/` | Üretilen uygulamanın ana Git repository'si |
| `projects/<id>/worktrees/` | Agent'ların izole çalışma alanları |
| `data/` | Studio'nun yerel SQLite/runtime verileri |

## Güvenlik modeli

Codex yalnızca oluşturulan proje dizininde ve `workspace-write` sandbox modunda
çalıştırılır; `danger-full-access` kullanılmaz. Studio otomatik deployment yapmaz.
Yayınlama, uygulandığında ayrı ve kullanıcı onaylı bir aşama olacaktır.

## Başka bir AI ile devam etme

Yeni bir oturuma önce [AGENTS.md](AGENTS.md), ardından [PROJECT_STATUS.md](PROJECT_STATUS.md)
ve bu README dosyasını tamamen okutun. Değişiklik yapmadan önce `git status --short`,
`npm run check` ve ilgili testlerin incelenmesini isteyin. `data/`, `projects/` ve mevcut
Git worktree'leri çalışma durumudur; açıkça istenmedikçe silinmemeli veya
sıfırlanmamalıdır.

```text
Bu repository'de çalışmaya devam et. Önce AGENTS.md, PROJECT_STATUS.md ve README.md
dosyalarını tamamen oku. Mevcut kullanıcı değişikliklerini koru; data/, projects/
ve worktree'leri silme. Git durumunu ve testleri incele, sonra mevcut hedefi özetle.
Değişiklik yapacaksan ilgili testleri çalıştır ve PROJECT_STATUS.md dosyasını güncelle.
```


### Proje sekmeleri ve bilgi hiyerarşisi

**Genel · Çalışma · Doğrulama · Etkinlik**. Genel durum, önerilen eylem ve dört
proje ölçümünü özetler; kanıt bağlantısı Doğrulama sekmesine açılır. Çalışma,
eski Agentlar içeriğini ve Pipeline görev ayrıntıları/yeniden deneme eylemlerini
korur. Doğrulama sırası: özet, kalite, cihaz ürün kontrolleri, kabul kriterleri,
release hazırlığı ve ortam/temizlik. Kanıtlar, komut çıktıları, senaryolar,
SHA-256, imza ve manifest bilgileri açılır bölümlerde bulunur.

Kayıtlı cihaz kapısı durumu değiştirilmez; ürün kontrolleri ile temizlik ayrı
gösterilir. READY yalnız sideload testi anlamındadır. Kriter metni API'de
yoksa yalnız kimlik/durum gösterilir; kanıt açılarak okunur. Çalışma içeriğinin
yeniden tasarımı sonraki adıma bırakılmıştır. API ve proje durumları değişmedi.
