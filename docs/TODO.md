# AI MVP Studio — TODO

Son güncelleme: 23 Eylül 2026

Son tam kontrol: `npm run check` başarılı, `npm test` **170/170 PASS**.
`npm run test:minimal-live` gerçek Codex ile uçtan uca geçiyor (tek canlı çağrı).
Release hazırlığı gerçek Flutter toolchain'inde `Akış Cep` üzerinde `READY` üretti.
Uygulama bütünlüğü değerlendiricisi 10 üretilmiş repository üzerinde koşuldu:
8 `COMPLETE`, 2 gerçek bulguyla `INCOMPLETE`, yanlış pozitif yok.

Bu dosya **kalan işi** tutar. Kapanmış maddelerin gerekçeleri ve tasarım kararları
[PROJECT_STATUS.md](PROJECT_STATUS.md) içindeki sözleşme ve "Bilinçli kararlar"
bölümlerine taşınmıştır; tam metinleri `git log` içindedir.

## Açık işler

Öncelik sırasında. Bir madde kapandığında regresyon testi eklenmeli,
`npm run check` ve `npm test` çalıştırılmalı, ardından `PROJECT_STATUS.md`
güncellenmelidir.

### 1. `AboneCep`'i düzeltilmiş hatta karşı yeniden koş

- [ ] Panelden `1c30b97a4b89` projesini checkpoint'ten devam ettir.
- [ ] Cihaz raporu commit'inin artık `Agent izin verilmeyen dosyaları değiştirdi`
  ile düşmediğini ve sonucun veritabanına yazıldığını doğrula.
- [ ] Reviewer'ın artık minimum Android API üzerinden bloklamadığını doğrula.
- [ ] Kararsız görünen cihaz testlerini izle: üç koşuda üç **farklı** integration
  testi düştü (`active_filter`, `edit_subscription`, `search_subscription`), her
  turda öncekiler PASS'e döndü. Aynı kusur mu, zamanlama/flake mi karar ver.

**Bulgu:** bu proje dört Studio kusurunu arka arkaya ortaya çıkardı ve dördü de
kapatıldı.

1. Kalite kapısı tek bir `info` lint'inde düştü; üç onarım turu buna harcandı.
2. Her devam denemesi `chore: install planned dependencies` commit'inde git'in
   "no changes added to commit" hatasıyla öldü.
3. Düzeltmelerden sonra koşu cihaz kapısını PASS geçti, ama cihaz raporu commit'i
   Flutter'ın gradle migration'ını agent ihlali sanıp koşuyu düşürdü — üstelik
   cihaz sonucu kaydedilmeden önce.
4. Spec, Flutter 3.44'ün desteklemediği minimum Android API 23 istiyordu; reviewer
   haklı olarak blokluyor, repair düzeltiyor, sonraki kapı geri alıyordu. Bu koşu
   **568.045 faturalanabilir token** harcadı.

Spec'in `min_android_sdk` değeri ve ilgili satırı API 24'e çekildi (dosya ve
`projects.prompt` birlikte, `318d2a8`). Proje kaydı `failed` olarak **bilerek
bırakıldı**; temiz bir koşu sonraki doğrulamadır.

**Yan bulgu — reviewer kapsam aşımı.** Reviewer `minSdk` bulgusunu `AC10` üzerinden
blokladı, ama `AC10` "Mobil kullanılabilirlik" kriteri ve minimum API'den hiç söz
etmiyor. Sözleşme reviewer'ı yalnız kriter kimlikleriyle bloklamaya zorluyor, o da
bulgusunu en yakın kritere iliştirdi. Kriter metniyle bulgu arasındaki ilişkiyi
mekanik olarak denetlemek bugün mümkün değil; ayrı bir madde hâline gelmeden önce
ikinci bir örnek görmek gerekir.

### 2. `Akış Cep` cihaz kapısını güncel semantikte yeniden koş

- [ ] Panelden "Cihaz testini yeniden dene" ile projeyi devam ettir.
- [ ] Sonucun PASS olduğunu ve `housekeeping.avd_reset` alanının `SKIPPED`
  raporlandığını doğrula (hedef AVD değil; ayrıca boş alan eşiğin üstünde).

**Bulgu:** kayıt, temizliğin kapı sayıldığı dönemde WAITING olarak oluştu ve
geçmişi bozmamak için **bilerek değiştirilmedi**. Güncel semantikte PASS üreteceği
hem kayıtlı rapordan hem canlı `wipeAvdAfterTest` ölçümünden doğrulandı.

### 3. Eski örnek projeleri güncel sözleşmelerle yeniden üret

- [ ] `Servis Cep` — kritik akış sözleşmesinden önce üretildi; `USER_FLOWS.json` ve
  `integration_test/` içermiyor, cihaz kapısı `isRepairableDeviceFailure` ile hemen
  duruyor. Elle akış eklemek yerine güncel spec'le yeniden üretilmeli.
- [ ] `Stok Cep` — eski cihaz koşusunun başarısız kaydı; yeniden denemeden önce
  güncel ortam kapısı ve stabil Android build-tools ile değerlendirilmeli.

### 4. Bütünlük ölçümünü gerçek bir koşuda gör ve sonraki dilime karar ver

- [ ] Yeni bir koşuda `APPLICATION_COMPLETENESS.json` üretildiğini ve panelin
  Doğrulama sekmesinde göründüğünü doğrula.
- [ ] Çıkan bulguların kaçının haklı olduğunu not et; onarım döngüsüne bağlamak
  ancak bundan sonra tartışılmalı.

Bugün ölçüm bir kapı değil: proje durumunu ve kapı sonuçlarını değiştirmiyor,
otomatik onarım tetiklemiyor. Sıradaki aday dilim, ekran durumları
(yükleniyor/boş/hata) ve ölü uçlu navigasyon gibi kategorilerin **deterministik**
olarak ölçülebilen kısmı; bugünkü kapsam dışı listesi
[PROJECT_STATUS.md → Uygulama bütünlüğü](PROJECT_STATUS.md#uygulama-bütünlüğü)
içindedir.

### 5. Review Repair'i gerçek bir koşuda gör

- [ ] Reviewer'ı bloklayan bir koşuda onarım döngüsünün ve geçmiş bulgu
  aktarımının çalıştığını doğrula.

Zorlanacak bir şey değil; şu an yalnız birim testleriyle korunuyor. Bir koşu
reviewer'ı bloklarsa doğal olarak sınanır.

### 6. Rol bazlı model / reasoning effort seçimi

İleriye dönük; bugün bir arızayı kapatmıyor, maliyet ve kalite kaldıracı olarak
isteniyor. İki yarısı var ve **ilki tek başına da değerli**:

- [ ] **Teşhis yarısı (ucuz).** `agent_runs` tablosuna kullanılan model ve
  reasoning effort yazılsın. Bugün bu bilgi Studio'da hiç tutulmuyor; bir koşunun
  hangi modelle üretildiği ancak `thread_id` üzerinden Codex oturum kaydından
  (`~/.codex/sessions/.../rollout-*.jsonl`, `turn_context` olayı) geriye dönük
  okunabiliyor. Token kullanımı zaten kaydediliyor; modelsiz token sayısı
  maliyet kıyaslaması için yetersiz.
- [ ] **Seçim yarısı.** Rol başına model/effort ataması (`config.mjs` üzerinden
  varsayılan + ortam değişkeni), `codex-runner` çağrısında `-c model=…` /
  `-c model_reasoning_effort=…` olarak geçirilsin. Aday ayrım: Coordinator ve
  Reviewer yargı ağırlıklı, Integration ve Repair daha mekanik.
- [ ] Ataması olmayan rol bugünkü davranışı korusun: bayrak geçilmez, model
  Codex yapılandırmasından gelir.

**Bugünkü durum (23 Eylül 2026 ölçümü):** Studio model seçmiyor. `codex-runner.mjs`
çağrıyı `exec --json --sandbox workspace-write -` olarak kuruyor; `src/` genelinde
`--model` geçmiyor. Dolayısıyla bütün roller — planlama, builder, integration,
repair, reviewer — `~/.codex/config.toml` içindeki tek ayarı paylaşıyor. Çalışan
bir Repair Agent'ın oturum kaydından okunan değerler: `model = "gpt-5.6-sol"`,
`effort = "medium"`, Codex CLI `0.153.4`. Bu, modelin **Studio dışından sessizce
değişebileceği** anlamına da gelir: `config.toml` değişirse Studio'da hiçbir şey
değişmeden sonraki koşu başka bir modelle çalışır.

## Bilerek ertelenenler

Gerçek fakat bugün MVP çıktısını, güvenilirliği, maliyeti veya pazar testini
iyileştirmiyorlar. Ayrıntı ve gerekçeler
[PROJECT_STATUS.md → Bilerek ertelenenler](PROJECT_STATUS.md#bilerek-ertelenenler):

- `#execute` hata yolunda `PROJECT_STATE.json` senkronlanmıyor.
- Planlama agent'ları resume'da görev durumu yerine dosya varlığına bakıyor.
- Panel kabul kriteri metnini göstermiyor (`ACCEPTANCE_CRITERIA.json` API'de yok).
- `server.mjs` sözleşme hatalarına 409/422 yerine 500 dönüyor.
- HTTP katmanının test kapsamı yok; `createServer` import anında `listen` çağırıyor.
- `analyze` ve `test` paralelleştirilmedi (ölçülen kazanç ~2 saniye).

## Planlanan yön — henüz uygulanmadı

Yayınlanabilirlik artık ölçülüyor; **yayınlama hâlâ yapılmıyor.** Sıradaki adımlar,
değer sırasıyla:

1. **Üretim imzası.** `READY` bugün "sideload edilebilir" demek. Gerçek dağıtım için
   kullanıcı tarafından sağlanan bir keystore ile imzalama ve imzanın doğrulanması
   gerekir. Anahtar üretimi ve parola saklama bilinçli olarak Studio dışında kalmalı.
2. **Dağıtım kanalı.** İmzalı APK'yı gerçek test kullanıcılarına ulaştıran en küçük
   yol (internal testing veya doğrudan bağlantı).
3. **Ölçüm sözleşmesi.** KILL/ITERATE/SCALE kararını besleyecek asgari sinyal.

Aşağıdakilerin **hiçbirinin kodu bu repository'de yoktur**: imzalama/keystore
otomasyonu, mağaza yükleme, store listing üretimi, dağıtım otomasyonu, analitik,
crash reporting, faturalama, deney sözleşmeleri, pazar deneyi panoları.

## Kapanmış işler

Tam gerekçeler için `git log`; sözleşme hâline gelenler `PROJECT_STATUS.md` içinde.

**Koşuyu düşüren Studio kusurları (son artış)**

- Orchestrator rapor commit'leri path-scoped (`commitPaths`): dar `git add` ile
  ağaç geneline bakan `gitChanged()` çelişkisi, hattın sahibi olmadığı kirli bir
  dosya yüzünden git'i 1 koduyla düşürüyordu. Eşleşmeyen pathspec de `git add`'i
  sert hata verdirdiği için yalnız var olan veya tracked yollar geçiriliyor.
- Kalite kapısı analiz şiddet politikası: `--no-fatal-infos`. Tek bir `info`
  seviyeli lint bütün kapıyı düşürüyor, `test`/`apk` çeklerini atlatıyor ve üç
  onarım turunu harcıyordu.
- `qualityFailureSignature` analiz şiddet satırlarını da görüyor; lint-only
  arızaların hepsi aynı boş imzaya hash'lenmiyor.
- `ROOT_CAUSE_REPORT.md` imza tekrarı ile tur üst sınırını ayrı anlatıyor.
- `DEVICE_REPORT.json` agent artefaktı gibi commit edilmiyor: ana workspace'te
  toolchain'in yazdığı dosya agent sınır ihlali sayılamaz.
- Preflight spec/toolchain Android API uyumunu ilk agent'tan önce sorguluyor;
  taban Flutter SDK kaynağından okunuyor, okunamazsa `SKIPPED`.
- Mobil template varsayılanı `min_android_sdk: "24"`; önceki `"23"` her yeni
  spec'e karşılanamaz bir gereksinim kopyalıyordu.

**Cihaz kapısı maliyeti (son artış)**

- Sıfırlama ölçüme bağlandı: temizlik sonrası boş alan eşiğin üstündeyse hiçbir şey
  yapılmıyor. Ölçülen koşuda dört sıfırlamanın dördü de gereksizdi.
- Snapshot tabanlı yerinde sıfırlama (`studio_clean`): ölçülen 3–5 sn, emülatör
  düşmüyor. Tam wipe 48 sn sürüyor ve maliyeti bir sonraki kapıya yazıyordu.
- Tam wipe koşunun sonuna taşındı; host imajını yalnız o küçültebildiği için
  kaldırılmadı, seyrekleştirildi.
- `app_cleanup` sahte FAIL'i düzeltildi: `DELETE_FAILED_INTERNAL_ERROR` "paket
  zaten yoktu" demek.
- Cihaz üstündeki ekran görüntüsü/UI dökümü artık siliniyor.
- `DEVICE_REPORT.json` faz sürelerini tutuyor (`durations_ms`).
- Canlı koşuda yakalanan iki kusur: snapshot yüklemesinden sonra adb kısa süre
  "authorizing" diyor (artık `wait-for-device` bekleniyor), ve yardımcılara
  yanlış şekilli runner vermek gerçek bir AVD'yi üçüncü taraf emülatör olarak
  sınıflandırıyordu.

**Çalışma zamanı güvenilirliği (önceki artış)**

- Cihaz hedefi politikası: üç kategorili sınıflandırma, raporlama ve AVD'ye özgü
  işlemlerin yalnız AVD hedefinde çalışması.
- `runProcess` timeout yarışı: tetiklenen timeout sonucu kesin; geç gelen
  `close`/`error` yalnız `exit_during_termination` alanına yazılır.
- Orchestration hot path'inden bloklayan `spawnSync` kaldırıldı; yerel Git
  plumbing'i gerekçeli istisna olarak kaldı ve bekçi testiyle korunuyor.
- Flutter toolchain probe'unda uçuştaki promise cache'i.

**Kurtarılabilir arıza geçerli koşuyu yok etmesin**

- Test sonrası temizlik kapı olmaktan çıkarıldı; `housekeeping` + `notes`.
- AVD adı için `getprop` fallback'i.
- Reviewer sözleşme ihlalinde tek turluk düzeltme isteği.
- Codex stdin EPIPE'ı Studio sürecini düşürmüyor.
- Bayat `.studio-backup` deterministik olarak kurtarılıyor.

**Kapılar, sözleşmeler ve paralellik**

- Toplu cihaz testi: tek Dart girişi, tek test APK kurulumu, senaryo bazlı sonuç.
- ADB alt komutlarına ayrı 120 sn timeout.
- Device repair sonrası reviewer sonucunun zorunlu yenilenmesi.
- `DEVICE_REPORT.json` için orchestrator-owned ayrı commit.
- İlk builder dalgasında gerçek paralellik zorunluluğu.
- Flutter tooling manifestlerinin çevrimdışı ürün politikasından ayrılması.
- Spec v2 template'i, `complexity_tier`/`target_parallelism` ve ölçeklenen planlama.
- Reviewer kabul kriteri kimlik sınırı (bilinmeyen/tekrarlanan kriter reddi).
- Flutter kalite komutlarına güvenli timeout ve Windows process-tree sonlandırma.
- `npm run check` kapsamının bütün `src/*.mjs` modüllerine genişletilmesi.
- Cihaz ortamı depolama preflight'ı ve görünür kök neden mesajı.
- `minimal-live-check` reviewer fixture'ının güncel inceleme sözleşmesine uydurulması.

**Uygulama bütünlüğü (son artış)**

- Deterministik tamamlanmamışlık taraması (`src/app-completeness.mjs`): iskelet
  artığı, boş eylem geri çağrısı, `UnimplementedError`, yer tutucu metin, TODO/FIXME.
- `APPLICATION_COMPLETENESS.json` raporu, `projects.completeness_report` kaydı ve
  panelin Doğrulama sekmesinde bölüm.
- Kapı olmayan yaşam döngüsü entegrasyonu: ana hat ve geri bildirim turunun sonunda
  çalışır, proje durumunu ve kapı sonuçlarını değiştirmez.
- Yanlış pozitif politikası: yalnız `lib/`, kod/yorum/dize ayrıştırması,
  `onPressed: null` ve değer/yaşam döngüsü geri çağrılarının kapsam dışı olması,
  açıklamalı boş gövdenin uyarıya düşmesi, spec'in birebir istediği metnin uyarıya
  düşmesi.

**Release hazırlığı (son artış)**

- Deterministik release hazırlık değerlendirmesi (`src/release-readiness.mjs`).
- Kimlik/sürüm/simge/geliştirme adresi/artefakt/SHA-256/imza kontrolleri.
- `RELEASE_READINESS.json` raporu, proje kaydı ve panel gösterimi.
- Kabul edilmiş projeye iliştirilen, durum değiştirmeyen yaşam döngüsü entegrasyonu.
