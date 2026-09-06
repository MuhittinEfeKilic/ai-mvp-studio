---
spec_version: "1.0"
project_name: "Stok Cep"
project_slug: "stok-cep"
project_profile: "flutter_mobile"
application_type: "mobile"
framework: "flutter"
target_platform: "android"
package_name: "com.aimvpstudio.stokcep"
min_android_sdk: "24"
orientation: "portrait"
device_test: "required"
language: "tr"
status: "approved"
---

# Ürün Özeti

Stok Cep, küçük işletmelerin ürün stoklarını ve basit satış hareketlerini internetsiz olarak Android telefonda takip etmesini sağlayan local-first bir uygulamadır. MVP; ürün oluşturma, stok ekleme, satışla stok düşme, yetersiz stok engeli, hareket geçmişi ve uygulama yeniden açıldığında verilerin korunmasını eksiksiz sunmalıdır.

## Hedef Kullanıcılar

- Küçük dükkân, atölye ve evden satış yapan tek kullanıcılı işletmeler.
- İşlemleri çoğunlukla tek elle ve kısa mobil oturumlarda yapan kullanıcılar.

# MVP Kapsamı

## Dahil

- Ürün adı, isteğe bağlı benzersiz stok kodu, satış fiyatı ve başlangıç stoğuyla ürün oluşturma.
- Ürün adına veya stok koduna göre arama.
- Mevcut ürüne stok girişi yapma.
- Satış kaydetme, stoğu atomik düşürme ve yetersiz stoğu engelleme.
- Tarih, tür, adet ve satış toplamıyla hareket geçmişi.
- Ürün sayısı, toplam stok, düşük stok ve bugünkü satış özetli dashboard.
- Tüm verileri cihazda kalıcı saklama ve çevrimdışı çalışma.

## Kapsam Dışı

- Hesap, backend, bulut, barkod/kamera, ödeme, e-fatura, çoklu depo, iade, tedarikçi ve yayınlama yoktur.

# Kullanıcı Akışları

## Ana Akış

1. Kullanıcı ürün oluşturur.
2. Ürüne stok girişi yapar.
3. Satış kaydeder ve stok miktarının düştüğünü görür.
4. Hareket geçmişini doğrular.
5. Uygulamayı yeniden açar ve kayıtların korunduğunu görür.

## Hata Akışları

- Boş ürün adı, negatif fiyat veya geçersiz adet kaydedilemez.
- Aynı boş olmayan stok kodu ikinci üründe kullanılamaz.
- Mevcut stoktan fazla satış reddedilir ve hiçbir veri değişmez.
- Veritabanı hatası yutulmaz; kullanıcı dostu mesaj ve debug logu üretilir.

# Kritik Kullanıcı Akışları

### Ürün oluşturma ve kalıcılık

1. Kullanıcı temiz veriyle Ürünler sekmesini açar.
2. Ad “Filtre”, stok kodu “FLT-001”, fiyat “125,50” ve başlangıç stoğu “3” girer.
3. Kaydeder ve ürünün listede 3 adet stokla göründüğünü doğrular.
4. Uygulamayı tamamen kapatıp yeniden açar.
- Beklenen sonuç: Filtre ürünü, FLT-001 kodu, 3 adet stok ve 125,50 ₺ fiyatıyla korunur.

### Stok girişi ve satış transaction akışı

1. Kullanıcı 3 adet stoklu Filtre ürününü açar.
2. İki adet stok ekler ve stoğun 5 olduğunu doğrular.
3. İki adet satış kaydeder.
4. Ürün detayını ve hareket geçmişini açar.
- Beklenen sonuç: Stok 3 olur; giriş ve satış hareketleri görünür, satış toplamı 251,00 ₺ olur.

### Yetersiz stok koruması

1. Kullanıcı stoğu 3 olan Filtre ürününü açar.
2. Satış adedi olarak 4 girer.
3. Satışı kaydetmeye çalışır.
- Beklenen sonuç: “Yetersiz stok” mesajı gösterilir, stok 3 kalır ve satış hareketi oluşmaz.

### Arama ve boş sonuç

1. Kullanıcı Ürünler sekmesini açar.
2. “FLT-001” aramasıyla Filtre ürününü görür.
3. Aramayı “bulunmayan” olarak değiştirir.
- Beklenen sonuç: Eşleşen ürün bulunamadığını açıklayan boş durum gösterilir.

# Ekranlar

## Dashboard

- Ürün sayısı, toplam stok, stoğu 2 veya altında olan ürün sayısı ve bugünkü satış toplamı.
- Son beş hareket; veri yoksa açıklayıcı boş durum.
- Veriler işlem ve sekmeye dönüş sonrasında yenilenir.

## Ürünler

- Arama, ürün listesi ve Yeni ürün eylemi.
- Satırda ad, stok kodu veya “Kod yok”, stok ve biçimlendirilmiş fiyat.
- Boş katalog ve boş arama sonucu farklı metinler taşır.

## Yeni Ürün / Ürün Düzenle

- Ad zorunlu ve 2–80 karakterdir.
- Stok kodu isteğe bağlı, trimlenmiş, büyük/küçük harften bağımsız benzersiz ve en fazla 30 karakterdir.
- Fiyat sıfır veya daha büyük, iki ondalıklı para değeridir ve integer kuruş saklanır.
- Başlangıç stoğu 0–999999 arası tam sayıdır.
- Hatalı kayıtta form verisi korunur.

## Ürün Detayı

- Ürün bilgileri, stok, fiyat, Stok Ekle, Satış Yap ve Düzenle eylemleri.
- Ürün hareketleri yeniden eskiye listelenir.

## Stok Ekle ve Satış Yap

- Pozitif tam sayı adet; stok girişinde isteğe bağlı en fazla 120 karakter not.
- Satışta salt okunur toplam gösterilir.
- Her işlem stok güncellemesi ve hareket insertini tek transaction içinde yapar.

## Hareketler

- Tüm hareketler yeniden eskiye; Tümü, Stok girişi ve Satış filtreleri.
- Satırda ürün, tür, adet, tarih ve satışlarda toplam tutar.

# Mobil Platform Kararları

- Yalnız Android telefon ve dikey yön.
- Tamamen local-first; internet gerektirmez.
- Minimum SDK 24.
- Arka plan görevi, deep link ve bildirim yoktur.

# Navigasyon ve Ekran Davranışları

- Alt navigasyonda Dashboard, Ürünler ve Hareketler; başlangıç Dashboard.
- Form ve detaylar navigation stack üzerinde açılır.
- Android geri düğmesi önce modalı kapatır; kaydedilmemiş form için onay ister.
- Klavyede aktif alan ve kaydet düğmesi görünür kalır.
- Veri ekranlarında yükleniyor, boş, hata, başarı ve tekrar dene durumları bulunur.

# İzinler ve Cihaz Özellikleri

- Kamera, konum, bildirim, mikrofon ve harici depolama izni yoktur.
- Runtime izin, sensör veya platform servisi kullanılmaz.

# Veri Modeli

`Product`: UUID `id`, `name`, nullable `sku`, non-negative integer `price_cents`, non-negative integer `stock_quantity`, UTC `created_at` ve `updated_at`. Normalize stok kodunda nullable unique index bulunur.

`StockMovement`: UUID `id`, zorunlu foreign key `product_id`, `stock_in` veya `sale` türü, pozitif integer `quantity`, satış anındaki nullable/non-negative `unit_price_cents`, nullable `note`, UTC `created_at`.

Stok girişi ve satış aynı SQLite transaction içinde ürün stoğunu güncelleyip hareket oluşturur. Satış güncel stoğu transaction içinde yeniden okuyup yetersiz stokta hiçbir değişiklik yapmadan domain hatası döndürür.

# Özellikler Arası Veri Sözleşmeleri

- `StockMovement.product_id` serbest metin değildir; Ürün Detayı tarafından sağlanan gerçek `Product.id` değeridir.
- Ürün adı yalnız sunum içindir ve foreign key olarak kullanılmaz.
- Dashboard ve listeler repository değişikliklerinden sonra yenilenir.
- Para UI’da Türkçe biçimlenir, domain ve veritabanında integer kuruştur.
- Repository hataları loglanır; kör `catch (_)` ile kaybedilemez.

# Teknik Kararlar

- Flutter, Dart ve Material 3.
- Tek ve test edilebilir state yönetimi yaklaşımı.
- Merkezi route sözleşmeli navigation.
- Foreign key etkin SQLite, migration ve UUID kimlikler.
- UTC ISO-8601 tarih, Europe/Istanbul gösterim.
- Integer kuruş; finansal hesapta double yok.
- Backend ve ağ yok.
- Domain/repository unit, widget ve dört kritik akış için en az dört integration test dosyası.
- Android debug APK.

# Tasarım Yönü

- Sade, yüksek kontrastlı Material 3; koyu petrol mavisi ana renk.
- Stok girişi yeşil, satış mavi, düşük/yetersiz stok amber veya kırmızı.
- Dokunma hedefleri en az 48x48 dp ve ikonlarda semantics etiketi.
- 320–480 dp genişlik ve yüzde 200 metin ölçeğinde taşma yok.

# Kabul Kriterleri

- [ ] Dört kritik akış Flutter integration test olarak Android Studio AVD’de geçer.
- [ ] Ürün, stok ve satış gerçek SQLite repository üzerinden çalışır.
- [ ] Yetersiz stokta stok ve hareket tablosu değişmez.
- [ ] Uygulama yeniden açıldığında tüm veriler korunur.
- [ ] Dashboard işlemlerden sonra güncellenir.
- [ ] Arama ad ve stok kodunda büyük/küçük harften bağımsızdır.
- [ ] Geçersiz ve duplicate alanlar anlaşılır Türkçe mesajlarla reddedilir.
- [ ] Hatalar yutulmaz ve debug logunda kök neden bulunur.
- [ ] Analyze, unit/widget ve cihaz integration testleri başarılıdır.
- [ ] APK Android Studio AVD’ye kurulur, açılır ve logcat fatal hata içermez.

# Kalite Gereksinimleri

- Gizli anahtar, ağ, analitik ve otomatik deployment yoktur.
- Repository transaction ve yetersiz stok davranışı unit testlidir.
- Her kritik akış ayrı `integration_test/*_test.dart` dosyasıyla gerçek UI üzerinden çalışır.
- Testler temiz fixture oluşturur ve önceki cihaz verisine bağımlı değildir.
- Hatalar stack trace ile loglanır, kullanıcıya anlaşılır mesaj gösterilir.
- README çalıştırma, test, integration test ve APK komutlarını içerir.

# Açık Kararlar

Yok.
