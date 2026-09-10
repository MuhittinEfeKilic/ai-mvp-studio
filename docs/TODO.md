# AI MVP Studio — TODO

Son güncelleme: 10 Eylül 2026

Son tam kontrol: `npm run check` başarılı, `npm test` **155/155 PASS**.
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

### 1. `Akış Cep` cihaz kapısını güncel semantikte yeniden koş

- [ ] Panelden "Cihaz testini yeniden dene" ile projeyi devam ettir.
- [ ] Sonucun PASS olduğunu ve `housekeeping.avd_wipe` alanının `SKIPPED`
  raporlandığını doğrula.

**Bulgu:** kayıt, temizliğin kapı sayıldığı dönemde WAITING olarak oluştu ve
geçmişi bozmamak için **bilerek değiştirilmedi**. Güncel semantikte PASS üreteceği
hem kayıtlı rapordan hem canlı `wipeAvdAfterTest` ölçümünden doğrulandı.

### 2. Eski örnek projeleri güncel sözleşmelerle yeniden üret

- [ ] `Servis Cep` — kritik akış sözleşmesinden önce üretildi; `USER_FLOWS.json` ve
  `integration_test/` içermiyor, cihaz kapısı `isRepairableDeviceFailure` ile hemen
  duruyor. Elle akış eklemek yerine güncel spec'le yeniden üretilmeli.
- [ ] `Stok Cep` — eski cihaz koşusunun başarısız kaydı; yeniden denemeden önce
  güncel ortam kapısı ve stabil Android build-tools ile değerlendirilmeli.

### 3. Bütünlük ölçümünü gerçek bir koşuda gör ve sonraki dilime karar ver

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

### 4. Review Repair'i gerçek bir koşuda gör

- [ ] Reviewer'ı bloklayan bir koşuda onarım döngüsünün ve geçmiş bulgu
  aktarımının çalıştığını doğrula.

Zorlanacak bir şey değil; şu an yalnız birim testleriyle korunuyor. Bir koşu
reviewer'ı bloklarsa doğal olarak sınanır.

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

**Çalışma zamanı güvenilirliği (son artış)**

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
