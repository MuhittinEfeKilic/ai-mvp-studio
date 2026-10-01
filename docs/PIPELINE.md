# AI MVP Studio — Hat Referansı

Bu dosya hattın **aşama aşama** nasıl çalıştığını, kapıların ne ölçtüğünü ve
onarım döngülerinin sınırlarını anlatır. Sisteme yeni başlıyorsanız önce
[README](../README.md) okunmalıdır; burası derinlik referansıdır.

- Bugünkü durum ve ölçümler: [PROJECT_STATUS.md](PROJECT_STATUS.md)
- Denenip reddedilmiş yaklaşımlar: [LESSONS.md](LESSONS.md)
- Kalan iş: [TODO.md](TODO.md)

---

## Hat

Hattın genel akış şeması tek yerde tutulur:
[README → Hat](../README.md#hat). Bu bölüm o şemadaki her durağın ne ölçtüğünü açar.

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
bulunmalıdır. Analiz `--no-fatal-infos` ile koşar: **hata ve uyarı bloklar, `info`
seviyesindeki stil önerisi bloklamaz.** `flutter analyze` her bulguda — info dahil —
1 ile çıkar; bayrak olmadan tek bir stil önerisi kapıyı düşürüyor, `test` ile `apk`
çeklerini hiç çalıştırmıyor ve üç onarım turunu da harcıyordu. Info bulguları rapor
ve `QUALITY_LOGS/analyze.log` içinde görünmeye devam eder; yalnız kapı kararını
değiştirmezler. Dördüncü çek kaynak teşhis taramasıdır: üretilen Dart kodundaki boş veya
hatayı yutan `catch` blokları bloklayıcı sayılır — hata ya incelenmeli ya yeniden
fırlatılmalıdır. Dize interpolasyonu kod sayılır (`log('kayıt: $error')` kabul edilir).

Builder, Integration ve Repair agent'ları Flutter/Gradle komutu çalıştırmaz; bunları
yalnız orchestrator çalıştırır ve tam çıktıları `QUALITY_LOGS/` altında saklar.

### Spec / toolchain uyumu

Preflight, **ilk agent başlamadan önce**, spec'in istediği minimum Android API'yi
kurulu Flutter'ın tabanıyla karşılaştırır. Taban SDK'nın kendisinden okunur
(`gradle_utils.dart` → `minSdkVersionInt`, yedeği `FlutterExtension.kt`); okunamazsa
kontrol `SKIPPED`'tır — ölçülmemiş bir gereksinim geçmiş sayılmaz.

Spec tabanın altını isterse koşu burada, sıfır token harcanmadan durur. Bunun
nedeni Flutter'ın yalnız uyarmaması: `MinSdkVersionMigration`, 16–23 arası her
`minSdk` değerini Gradle'a dokunan her komutta `flutter.minSdkVersion`'a geri
yazar. Yani düşük bir değer hiçbir onarım turuyla kalıcı olamaz — reviewer bloklar,
repair düzeltir, sonraki kapı geri alır, turlar biter. Ölçülen gerçek maliyet: üç
kalite onarımı, iki inceleme turu ve **568.000 faturalanabilir token**, hiçbir
agent'ın karşılayamayacağı bir istek için.

Orchestrator'ın kendi rapor commit'leri (`pubspec`, `TEST_REPORT`, `TASK_PLAN`,
`DEVICE_REPORT`, tooling manifestleri, release ve bütünlük raporları)
**path-scoped**'tur: hem
"değişen var mı" sorusu hem de commit aynı yollarla sınırlıdır. Çalışma ağacının
tamamına bakıp dar bir commit denemek, hattın sahibi olmadığı kirli bir dosya
yüzünden — örneğin Flutter tool'unun ısınma derlemesi sırasında yeniden yazdığı
`android/app/build.gradle.kts` — git'i "no changes added to commit" ile 1 kodunda
düşürüyor ve aslında sorunsuz bir koşuyu öldürüyordu.

`DEVICE_REPORT.json` de bu yüzden agent artefaktı gibi commit edilmez. Agent
artefaktı commit'i, **başka herhangi bir dosya kirliyse** bunu sınır ihlali sayar;
bu bir agent worktree'sinde doğrudur, ama cihaz raporunun yazıldığı ana workspace'te
Flutter, Gradle ve adb'yi orchestrator'ın kendisi çalıştırmıştır ve onların dosya
yazması meşrudur. Gerçek koşuda bu, Flutter'ın gradle migration'ını
`Agent izin verilmeyen dosyaları değiştirdi` diye raporlayıp bütün kapıları geçmiş
bir koşuyu düşürdü — üstelik cihaz sonucu veritabanına yazılmadan önce.

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

**Test sonrası temizlik kapı değildir.** Hedef paketin kaldırılması, cihaz üstündeki
ekran görüntüsü/UI dökümünün silinmesi ve — gerekiyorsa — cihazın sıfırlanması, ürün
kararı verildikten *sonra* çalışır. Sonuçları `DEVICE_REPORT.json` içinde
`housekeeping` altında ve başarısızsa `notes` uyarısı olarak raporlanır, fakat
**geçmiş bir ürün doğrulamasını geçersiz kılamaz.** AVD olmayan hedeflerde sıfırlama
`SKIPPED`'tır; yapacak bir şey olmaması arıza değildir. Fiziksel cihazlar hiçbir zaman
otomatik sıfırlanmaz.

### Cihaz testi kırılganlık taraması

Cihaz kapısı, üretilen `integration_test/` kaynağını deterministik olarak tarar ve
sonucu `DEVICE_REPORT.json` içindeki `test_diagnostics` alanına yazar. **Kapı
değildir**: ürünü yargılamaz, hiçbir durumu değiştirmez, toolchain komutu, cihaz ve
agent turu maliyeti yoktur.

Tek bir ölçülmüş arıza sınıfını arar: *metin girildikten sonra odak bırakılmadan ve
kaydırma yapılmadan bir widget'ın varlığını iddia etmek.* Gerçek cihazda odaklanan
alan IME'yi açar, `MediaQuery.viewInsets.bottom` büyür, liste viewport'u daralır ve
tembel inşa edilen `SliverList`/`ListView.builder` sığmayan satırı hiç oluşturmaz;
`find.byKey` yalnız var olan widget'ı gördüğü için **ürün doğru olduğu hâlde** iddia
düşer.

Bu, aynı projenin iki gerçek koşusunda üç kez oldu (`active_filter`,
`edit_subscription`, `search_subscription`) ve toplam dört device repair turuna mal
oldu; sonunda işe yarayan düzeltme tek satırdı. Tarama bulguyu adıyla söylediği için
onarım agent'ı artık doğru hipotezden başlar — bulgular kapı FAIL verdiğinde
`notes` alanına da yazılır.

**Yanlış pozitife karşı kurallar.** Yalnız **varlık** iddiaları (`findsOneWidget`,
`findsWidgets`, `findsNWidgets`) bildirilir; `findsNothing` bu şekilde düşemez
(inşa edilmemiş widget zaten bulunmaz), onu işaretlemek gürültü olurdu. Odağı
bırakan (`unfocus`, `primaryFocus`, `FocusScope`) veya hedefi görünür yapan
(`ensureVisible`, `scrollUntilVisible`, `dragUntilVisible`) her çağrı riski
kaldırır. Yorum satırları taranmaz. Bir test **bir kez** bildirilir: altı satır
iddia eden bir testin bir sorunu vardır, altı değil.

Gerçek korpusta ölçüldü: 9 üretilmiş test dosyası, **2 bulgu** — biri tam olarak
iki onarım turuna mal olan `search_subscription_test.dart`. `edit_subscription`
işaretlenmedi, çünkü önceki onarımda eklenen `tester.ensureVisible` riski zaten
kaldırıyor.

### Hangi cihaz kullanılır

`MVP_STUDIO_AVD` ayarlanmışsa cihaz kapısı **yalnız o AVD'yi** kullanır: adı
doğrulanamayan bağlı bir cihazı benimsemez, gerekirse yapılandırılan AVD'yi
kendisi başlatır, bulunamazsa koşuyu gerekçesiyle bekletir.

Ayar boşken eski davranış sürer — listedeki ilk emülatör. Tek AVD'li bir
makinede bu zararsızdı; **iki AVD varsa değil.** Ölçüldü: pin olmadan
`flutter emulators` listesinin ilki `Medium_Phone_API_36.0` (kişisel AVD)
seçiliyordu, ve cihaz kapısı o AVD'yi sıfırlamaya ve wipe etmeye yetkilidir.
Pin yalnız başlatmayı değil **kullanımı** da sınırlar; aksi hâlde zaten açık olan
kişisel bir emülatör adb'nin ilk bildirdiği cihaz olduğu için sessizce
kullanılırdı.

Ayarlar `.env` dosyasından okunur (`npm start` artık
`--env-file-if-exists=.env` ile çalışır); dosya yoksa ortam değişkenleri geçerlidir.

### Cihaz sıfırlama politikası

Sıfırlama **ölçüme bağlıdır ve iki kademelidir.** Temizlikten sonra `/data` boş alanı
yeniden okunur; `MVP_STUDIO_DEVICE_RECLAIM_BELOW_MB` eşiğinin (varsayılan 3072 MB)
üstündeyse hiçbir şey yapılmaz ve rapor ölçülen değerle `SKIPPED` der.

| Kademe | Ne yapar | Ölçülen süre | Ne zaman |
| --- | --- | --- | --- |
| Snapshot sıfırlama | `studio_clean` anlık görüntüsünü **yerinde** yükler; emülatör hiç düşmez | **3–5 sn** | Kapı sonunda, boş alan eşiğin altındaysa |
| Tam wipe | `-wipe-data` ile soğuk yeniden başlatma | **48 sn** | Koşu bittikten sonra, bir kez |

Anlık görüntü, kapının kendi doğruladığı durumdan kaydedilir (hedef paket yok, boş alan
minimumun üstünde) ve yalnız bir kez, 31 saniyede alınır. Bu bir "fabrika imajı" değil,
**kaydedilmiş bir sıfırlama noktasıdır**; silinirse sonraki tam wipe yenisini kaydeder.

Tam wipe neden hâlâ gerekli: guest'te dosya silmek host'taki
`userdata-qemu.img.qcow2` dosyasını küçültmez — imaj yazılan blok sayısıyla tek yönlü
büyür. Snapshot bunu geri alamaz, wipe alır. Bu yüzden pahalı olan işlem koşunun
sonuna taşındı: eskiden her kapıdan sonra çalışıyor ve **bir sonraki kapıya 48 saniyelik
bir açılış beklemesi** yazıyordu.

Ölçülen gerçek: bir koşuda cihaz kapısı dört kez işledi ve boş alan hiçbir zaman
3947 MB'nin altına inmedi — yani o dört sıfırlamanın hiçbiri gerekli değildi.

`DEVICE_REPORT.json` artık faz sürelerini de tutar (`durations_ms`): cihaz edinme,
depolama hazırlığı, snapshot kaydı, integration test, APK kurulumu, açılış ve temizlik.
Bir koşunun dakikalarının nereye gittiği artık olay zaman damgalarından çıkarılmıyor.

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
kalite ve cihaz kapıları yeniden koşar. **Review Repair da kod yazan bir agent'tır ve
kendi düzeltmesiyle kalite kapısını kırabilir**, bu yüzden ondan sonraki kalite kapısı
da sınırlı onarım hakkı taşır (2 tur; ana hatta 3). Ölçülen vaka: cihaz kapısı 8/8
PASS geçmiş bir koşuda reviewer tek kritere takıldı, Review Repair istenen iki renk
tokenını düzeltti ve bunu yaparken dört widget testini kırdı — eski davranışta koşu
tek bir onarım hakkı bile olmadan düşüyordu. Bulgular değişmezse döngü durur ve gerekçeler
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

Codex'in durma nedeni **kendi JSONL olay akışından** okunur, yalnız stderr'den değil:
kullanım limiti `{"type":"error","message":…}` ve `{"type":"turn.failed",…}` olarak
gelir ve stderr boş kalır. Yalnız stderr okumak, duraklamayı genel bir çıkış kodu
mesajına indirgiyor ve devam ettirilebilir bir projeyi `failed` olarak park ediyordu.

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

