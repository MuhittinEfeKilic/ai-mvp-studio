---
spec_version: "1.0"
project_name: "MOBİL UYGULAMA ADI"
project_slug: "mobil-uygulama"
project_profile: "flutter_mobile"
application_type: "mobile"
framework: "flutter"
target_platform: "android"
package_name: "com.example.app"
min_android_sdk: "23"
orientation: "portrait"
device_test: "required"
language: "tr"
status: "draft"
---

# Ürün Özeti

Uygulamanın çözdüğü problemi, temel değer önerisini ve MVP sonunda elde edilmesi gereken sonucu açıklayın.

## Hedef Kullanıcılar

- Birincil kullanıcı grubunu ve mobil kullanım bağlamını yazın.

# MVP Kapsamı

## Dahil

- İlk sürümde mutlaka bulunacak mobil özellikleri listeleyin.

## Kapsam Dışı

- Bildirim, hesap, senkronizasyon veya ödeme gibi ertelenen özellikleri belirtin.

# Kullanıcı Akışları

## Ana Akış

1. Kullanıcı uygulamayı açar.
2. Temel işlemini dokunmatik arayüz üzerinden tamamlar.
3. Sonuç cihazda saklanır ve kullanıcıya gösterilir.

## Hata Akışları

- Çevrimdışı durum, doğrulama hatası ve işlem başarısızlığı davranışlarını açıklayın.

# Kritik Kullanıcı Akışları

Bu bölüm otomatik integration/device testlerinin sözleşmesidir. Her akış en az üç
numaralı adım ve tek bir `Beklenen sonuç` satırı içermelidir. Serbest metin alanıyla
veritabanı kimliği gibi farklı veri türlerini birbirinin yerine kullanmayın.

### Ana kayıt akışı

1. Kullanıcı uygulamayı temiz veriyle açar.
2. Gerekli ilişkili kaydı oluşturur veya seçim ekranından mevcut kaydı seçer.
3. Zorunlu alanları doldurup işlemi kaydeder.
4. Uygulamayı kapatıp yeniden açar.
- Beklenen sonuç: Kayıt ilgili liste ve detay ekranında görünür ve yeniden açılışta korunur.

### Doğrulama hatası akışı

1. Kullanıcı kayıt formunu açar.
2. Zorunlu bir alanı boş veya geçersiz bırakır.
3. Kaydet eylemini çalıştırır.
- Beklenen sonuç: Kayıt oluşturulmaz, kullanıcıya alanla ilişkili ve anlaşılır hata gösterilir.

# Ekranlar

Her ekran için amacı, bileşenleri, eylemleri ve boş/yükleniyor/hata durumlarını yazın.

## Ana Ekran

- Görünen içerik, birincil eylem ve boş durum.

## Detay veya Form Ekranı

- Alanlar, doğrulama kuralları, başarı ve hata geri bildirimi.

# Mobil Platform Kararları

- Form faktörü: Telefon; tablet desteği bu MVP'de yok.
- Ekran yönü: Dikey (`orientation` frontmatter ile aynı olmalı).
- Veri yaklaşımı: Local-first; internet gereksinimini açıkça belirtin.
- Android sürümü: `min_android_sdk` değerinin gerekçesini yazın.
- Arka plan davranışı, deep link ve bildirim kapsamını belirtin.

# Navigasyon ve Ekran Davranışları

- Başlangıç ekranını ve ekranlar arasındaki geçişleri tanımlayın.
- Android geri düğmesi, klavye açılması ve form verisinin korunması davranışlarını yazın.
- Her ekranın boş, yükleniyor, hata ve başarı durumlarını belirtin.

# İzinler ve Cihaz Özellikleri

- Kamera, konum, depolama, bildirim gibi her izin için `gerekli` veya `yok` kararı verin.
- İzin reddedildiğinde uygulamanın davranışını açıklayın.
- Kullanılan sensör veya platform entegrasyonu yoksa açıkça `Yok.` yazın.

# Veri Modeli

Ana varlıkları, alanlarını, ilişkileri, silme davranışını ve yerel saklama tercihini açıklayın.

# Teknik Kararlar

- UI framework: Flutter
- Dil: Dart
- State yönetimi: Seçilen yaklaşım ve kısa gerekçesi
- Navigasyon: Seçilen yaklaşım
- Veri saklama: Seçilen yerel çözüm
- Backend: Yok veya net servis sözleşmesi
- Test: Unit, widget ve gerekli entegrasyon testleri
- Build hedefi: Android debug APK

# Tasarım Yönü

- Görsel karakter, renk, tipografi ve açık/koyu tema kararı
- Dokunma hedefleri, ekran okuyucu etiketleri ve metin ölçekleme beklentileri
- Desteklenen telefon genişlikleri ve taşma davranışı

# Kabul Kriterleri

- [ ] Ana kullanıcı akışı Android telefonda baştan sona tamamlanabilir.
- [ ] Boş, yükleniyor ve hata durumları tanımlandığı gibi görünür.
- [ ] Kalıcı olması gereken veri uygulama yeniden açıldığında korunur.
- [ ] Android geri düğmesi beklenen navigasyonu uygular.
- [ ] `flutter analyze` ve `flutter test` başarılıdır.
- [ ] Kritik kullanıcı akışları integration test ve Android cihaz/emülatör üzerinde başarılıdır.
- [ ] Debug APK üretilebilir.

# Kalite Gereksinimleri

- Gizli anahtarlar kaynak koda yazılmamalıdır.
- Flutter ve Android SDK sürümleri README içinde belirtilmelidir.
- Kurulum, çalıştırma, test ve debug APK komutları README içinde bulunmalıdır.
- Temel erişilebilirlik ve farklı telefon genişlikleri doğrulanmalıdır.
- Uygulama otomatik olarak yayınlanmamalıdır.

# Açık Kararlar

- Kodlama öncesi kapatılması gereken kararları yazın.
- Tamamlandığında bu bölümü yalnızca `Yok.` yapın ve `status` değerini `approved` olarak değiştirin.
