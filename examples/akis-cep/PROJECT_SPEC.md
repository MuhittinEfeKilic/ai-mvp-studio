---
spec_version: "2.0"
project_name: "Akış Cep"
project_slug: "akis-cep"
project_profile: "flutter_mobile"
application_type: "mobile"
framework: "flutter"
target_platform: "android"
package_name: "com.aimvpstudio.akiscep"
min_android_sdk: "23"
orientation: "portrait"
device_test: "required"
complexity_tier: "advanced"
target_parallelism: "4"
design_mode: "guided"
language: "tr"
status: "approved"
---

# Ürün Özeti

Akış Cep, gününü sabit saatlere göre değil mevcut enerji düzeyine göre planlamak
isteyen kişilerin rutinlerini yönetmesini, bugüne uygun kısa bir plan oluşturmasını
ve son yedi günlük eğilimini görmesini sağlayan local-first Android uygulamasıdır.
MVP başarısı; internet ve hesap gerektirmeden rutin oluşturma, enerji check-in'i,
günlük planlama, tamamlama ve içgörü akışlarının güvenilir çalışmasıdır.

## Hedef Kullanıcılar

- Yoğun günlerde katı yapılacaklar listesinden bunalan bireysel kullanıcılar.
- Günlük kapasitesi değişen öğrenciler ve bağımsız çalışanlar.
- Sabah 1–2 dakikalık planlama, gün içinde tek elle hızlı tamamlama beklenir.
- Metin ölçekleme, ekran okuyucu ve yalnız renge dayanmayan göstergeler gerekir.

# MVP Kapsamı

## Dahil

- Ad, açıklama, enerji, süre ve kategoriyle rutin CRUD işlemleri.
- Düşük, dengeli veya yüksek günlük enerji check-in'i.
- Rutinlerden bugünün planına ekleme, sıralama, çıkarma ve tamamlama.
- Enerji uyumuna göre açıklanabilir öneri sıralaması.
- Bugün ve son yedi gün tamamlanma özeti.
- SQLite kalıcılığı ve ilk açılışta üç düzenlenebilir örnek rutin.

## Kapsam Dışı

- Hesap, bulut, sosyal paylaşım, bildirim, widget, takvim, ödeme ve reklam.
- Yapay zekâ önerisi, backend, tablet, yatay ekran ve iOS dağıtımı.
- Otomatik yayınlama ve mağaza yüklemesi.

# Özellik Modülleri ve Sınırlar

## Uygulama Kabuğu

- `lib/app/**`: tema/token bağlama, route tablosu, dependency composition ve ortak hata sunumu.
- Bugün, Rutinler, İçgörüler alt navigasyonunu bağlar; veri erişimi veya iş kuralı içermez.

## Rutin Kataloğu

- `lib/features/routines/**`: liste, oluşturma, düzenleme, silme ve kategori filtresi.
- Dışarıya salt-okunur rutin özeti verir; günlük planı doğrudan değiştirmez.

## Günlük Akış

- `lib/features/today/**`: enerji check-in'i, öneriler, plan sırası ve tamamlama.
- Rutinleri repository sözleşmesiyle okur; kullanıcıya veritabanı kimliği yazdırmaz.

## İçgörüler

- `lib/features/insights/**`: bugünkü ilerleme ve yedi günlük özet.
- Salt-okunurdur; completion kayıtlarını değiştiremez ve yetersiz veride iddia üretmez.

## Ortak Veri Altyapısı

- `lib/data/**`: SQLite açılışı, migration, transaction ve repository implementasyonları.
- Feature modülleri SQL bilmez.

# İş Kuralları ve Değişmezler

- Rutin adı trim sonrası 2–60 karakterdir ve Türkçe harf duyarsız biçimde benzersizdir.
- Enerji yalnız `low`, `balanced`, `high`; süre 5–180 dakika ve 5'in katıdır.
- Bir rutin aynı tarihin planına yalnız bir kez eklenebilir.
- Günlük check-in tarih başına tektir; değişince öneriler yeniden sıralanır, plan değişmez.
- Öneri sırası enerji eşleşmesi, az tamamlanma, rutin adı şeklindedir ve gerekçesi gösterilir.
- Plan sırası kesintisiz tam sayıdır; ekleme/silme/taşıma tek transaction içinde numaralanır.
- Tamamlama idempotenttir; geri alma completion kaydını siler.
- Rutin silme geçmiş completion snapshot'ını korur, tamamlanmamış plan öğelerini siler.
- Gün cihaz saat dilimindeki `yyyy-MM-dd` anahtarıdır; yarım transaction geri alınır.

# Kullanıcı Akışları

## Ana Akış

1. Kullanıcı Bugün ekranında enerji düzeyini seçer.
2. Açıklamalı önerilerden rutinleri bugünkü plana ekler.
3. Planı sıralar ve öğeleri gün içinde tamamlar.
4. İlerleme ve İçgörüler tamamlanma kayıtlarından güncellenir.

## Alternatif Akışlar

- Rutinler ekranından arayıp plana ekleme, plandan çıkarma ve tamamlamayı geri alma.
- Rutin düzenlenince gelecek görünüm güncellenir, geçmiş snapshot değişmez.

## Hata Akışları

- Geçersiz form kayıt yapmaz ve alan altında neden gösterir.
- Tekrar ekleme planı değiştirmez ve açıklayıcı mesaj gösterir.
- Veritabanı açılamazsa tam ekran hata ve tekrar dene sunulur; yazma hatası UI'ı geri alır.

# Kritik Kullanıcı Akışları

### Rutin oluşturma ve kalıcılık

1. Kullanıcı yeni rutin formunu açar.
2. Ad, dengeli enerji, 25 dakika ve kategori girerek kaydeder.
3. Rutin listesinde kaydı görür ve uygulamayı yeniden açar.
- Beklenen sonuç: Rutin aynı değerlerle liste ve düzenleme formunda korunur.

### Enerjiye göre günlük plan

1. Kullanıcı düşük enerji check-in'i yapar.
2. Gerekçeli öneriden mevcut rutini seçip plana ekler.
3. Aynı rutini ikinci kez eklemeyi dener.
- Beklenen sonuç: Plan tek öğe içerir, enerji korunur ve ikinci ekleme açıklamayla reddedilir.

### Plan sıralama ve tamamlama

1. Kullanıcı plana iki farklı rutin ekler.
2. İkinci öğeyi ilk sıraya taşır.
3. İlk öğeyi tamamlayıp uygulamayı yeniden açar.
- Beklenen sonuç: Sıra ve tamamlanma korunur; ilerleme bir tamamlanan iki planlanan gösterir.

### Rutin düzenleme ve güvenli silme

1. Kullanıcı rutin adını ve süresini değiştirir.
2. Günlük planda adı doğrulayıp rutini tamamlar.
3. Rutinler ekranından kaydı onayla siler.
- Beklenen sonuç: Rutin katalogdan kalkar; tamamlanma geçmişi snapshot adıyla İçgörülerde kalır.

### Yedi günlük içgörü

1. Kullanıcı bir plan öğesini tamamlar.
2. İçgörüler sekmesini açar.
3. Bugünkü ilerleme ve yedi günlük listeyi inceler.
- Beklenen sonuç: Tamamlama doğru tarihte; veri olmayan günler sıfır ve dürüst boş durumla görünür.

### Form doğrulama hatası

1. Kullanıcı yeni rutin formunu açar.
2. Adı boş bırakır ve geçersiz süre girer.
3. Kaydet eylemini çalıştırır.
- Beklenen sonuç: Kayıt oluşmaz; ad ve süre alanında nedenleriyle hata görünür.

# Ekranlar

## Bugün Ekranı

- Tarih, üç seçenekli enerji kontrolü ve dikey “akış şeridi” plan öğeleri.
- Boş planda enerjiye bağlı öneriler; öğelerde sıralama ve tamamlama eylemleri.

## Rutinler Ekranı

- Arama, kategori filtreleri, rutin satırları ve yeni rutin FAB'i.
- Satır ad/kategori/süre/enerji gösterir; sonuç yoksa filtre temizleme sunar.

## Rutin Formu

- Ad, açıklama, enerji segmenti, süre stepper'ı, kategori ve kaydetme.
- Değişiklik varken geri basılması vazgeçme onayı açar.

## İçgörüler Ekranı

- Bugünün kesirli ilerlemesi ve son yedi günün hücrelerden oluşan “ritim izi”.
- Veri yoksa yargılayıcı olmayan açıklama ve Bugün'e dön eylemi.

# Ekran Durum Matrisi

| Ekran | İlk açılış | Boş | Yükleniyor | Hata | Başarı | Çevrimdışı |
|---|---|---|---|---|---|---|
| Bugün | Tarih/check-in | Öneri + rutin oluştur | İskelet satırlar | Tam ekran retry | Plan/ilerleme | Tam işlevli |
| Rutinler | Seed/kayıtlar | Rutin oluştur | Liste iskeleti | Tam ekran retry | Filtreli liste | Tam işlevli |
| Form | Varsayılan/mevcut | Uygulanmaz | Düğmede spinner | Alan/snackbar | Kapanış+snackbar | Tam işlevli |
| İçgörüler | Yedi gün | Açıklama+CTA | Özet iskeleti | Inline retry | Ritim izi | Tam işlevli |

# Mobil Platform Kararları

- Telefon, dikey yön ve 360–480 dp genişlik; tablet/yatay yok.
- Tamamen local-first, ağ bağlantısı gerekmez.
- Android SDK 23 kullanılan Flutter ve SQLite API'leri için yeterlidir.
- Arka plan, deep link ve bildirim yoktur.

# Navigasyon ve Ekran Davranışları

- Başlangıç `/today`; sekmeler `/today`, `/routines`, `/insights`.
- Formlar `/routines/new` ve `/routines/:id/edit`.
- Geri düğmesi alt sekmelerden Bugün'e döner; Bugün'de uygulamadan çıkar.
- Değişmiş formda geri, vazgeçme diyaloğu açar; klavye CTA'yı kapatmaz.
- Başarı snackbar, validation alan mesajı, altyapı hatası retry ile sunulur.

# İzinler ve Cihaz Özellikleri

- Kamera, konum, depolama izni, bildirim, mikrofon, Bluetooth, kişiler, takvim: Yok.
- Tamamlamada desteklenirse hafif haptic kullanılır; izin istemez ve akışı etkilemez.

# Veri Modeli ve Sözleşmeler

## Varlıklar ve İlişkiler

- `Routine`: UUID, ad, açıklama?, enerji, süre, kategori, createdAt, updatedAt.
- `DailyCheckIn`: dateKey PK, enerji, updatedAt.
- `PlanItem`: UUID, dateKey, routineId, routineNameSnapshot, position, createdAt; `(dateKey,routineId)` unique.
- `Completion`: planItemId PK, dateKey, routineId?, routineNameSnapshot, completedAt.
- Routine silinince tamamlanmamış PlanItem silinir; Completion korunup routineId null olur.
- Date/position, Completion date ve normalize rutin adı indekslenir.

## Kalıcılık ve Geçişler

- SQLite, async repository arayüzleri ve şema sürümü 1 kullanılır.
- İlk boş açılışta üç seed rutin tek transaction ile eklenir.
- Sıralama, rutin silme yan etkileri ve completion işlemleri transaction içindedir.
- Açılış hatası retry edilir; kullanıcı verisi otomatik silinmez.

# Teknik Kararlar

- Flutter/Dart, feature-first mimari ve Riverpod dependency/state yönetimi.
- go_router merkezi route sözleşmesi.
- sqflite + path; feature controller'ları repository arayüzü kullanır.
- Backend ve HTTP istemcisi yoktur.
- Unit, widget ve gerçek SQLite repository/integration testleri.
- Beklenmeyen hata stack ile loglanır, UI'a güvenli metin verilir.
- Build hedefi Android debug APK.

# Tasarım Sistemi ve Görsel Yön

## Tasarım DNA'sı

- Karakter: sakin, dokunsal, ritmik.
- Kaçınılacaklar: mor/mavi gradient, her şeyi yuvarlak karta koymak, anlamsız dashboard sayıları.
- İmza öğesi: Dikey çizgi üzerindeki düğümlerden oluşan “akış şeridi”; düğüm şekli enerjiyi, doluluk tamamlanmayı gösterir.
- Orta-ferah yoğunluk; 4 dp temel birim, 8/12/16/24/32 spacing.
- Basılı günlüklerin ritmi ve metro hatlarının yön buldurması ilke olarak alınır, görünüm kopyalanmaz.

## Tasarım Tokenları

- Primary `#245C4A`, surface `#F7F3E8`, ink `#1C2924`, accent `#D97A4A`, error `#B3261E`.
- Enerji renk yanında tek çizgi/çift çizgi/üç ışın sembolüyle gösterilir.
- Display 32/700, title 22/650, body 16/400, label 13/600; sistem fontu.
- Köşe alanlarda 10, eylemlerde 14 dp; elevation yalnız modal ve FAB'de.
- Animasyon 180–240 ms ease-out; MVP erişilebilir açık tema kullanır.

## Bileşen Dili

- Primary dolu yosun, secondary metin+ikon, destructive terracotta çerçeveli.
- Alanlar normal/focus/error/disabled; enerji segmenti seçili/seçisiz/pressed durumlu.
- Rutinler kart yığını değil ayırıcılı satırlar; akış düğümleri şekil ve ikonla ayrışır.
- Loading düğmede küçük spinner; boş durumda kesik akış çizgisi kullanılır.

## Responsive ve Erişilebilirlik

- 360/390/480 dp ve 1.3x metinde yatay taşma olmaz; safe-area korunur.
- Klavye aktif alanı/CTA'yı kapatmaz; hedefler en az 48x48 dp.
- Sürükleme yanında yukarı/aşağı semantik eylemleri, Türkçe label/value ve görsel odak vardır.

# Test Stratejisi ve İzlenebilirlik

- Validation, öneri sırası, tarih, idempotent completion ve position unit testleri.
- Geçici gerçek SQLite ile CRUD, uniqueness, snapshot/cascade ve rollback contract testleri.
- Dört ekranın empty/loading/error/success widget durumları test edilir.
- Altı kritik akış ayrı `integration_test/*_test.dart` dosyasına eşlenir.
- Kabul kriterleri ilgili feature, repository ve test türleriyle TASK_PLAN'da izlenir.

# Kabul Kriterleri

- Kullanıcı enerji check-in'inden başlayıp önerilen rutini plana ekleyerek tamamlayabilir.
- Kullanıcı rutin oluşturabilir, düzenleyebilir, arayabilir, filtreleyebilir ve onayla silebilir.
- Bugün ekranı plan sırasını ve tamamlanan/planlanan ilerlemesini doğru gösterir.
- Rutin, enerji, plan sırası ve tamamlanmalar yeniden açılışta korunur.
- Geri düğmesi alt sekme ve değişiklik içeren formda tanımlanan davranışı uygular.
- Geçersiz ad ve süre kaydı engeller ve alanlarda anlaşılır neden gösterir.
- Bir rutin aynı günlük plana iki kez eklenemez ve ilişkiler kullanıcı seçimiyle kurulur.
- Akış şeridi, enerji sembolleri ve tokenlar ana ekranlarda tutarlı uygulanır.
- Ana akışlar 360–480 dp ve 1.3x metinde yatay taşma olmadan tamamlanır.
- Uygulama internet, hesap, bildirim, ödeme veya otomatik yayın içermez.

# Kalite Gereksinimleri

- `flutter analyze` uyarısız; `flutter test` başarılı olmalıdır.
- Altı kritik akış için integration testi ve debug APK bulunmalıdır.
- Hata incelenmeli veya yeniden fırlatılmalı; boş catch bulunmamalıdır.
- Gizli anahtar ve internet izni eklenmemelidir.
- SDK sürümleri ile kurulum/çalıştırma/test/APK komutları README'de olmalıdır.
- Erişilebilirlik ve 360/390/480 dp senaryoları doğrulanmalıdır.
- Uygulama otomatik yayınlanmamalıdır.

# Açık Kararlar

Yok.
