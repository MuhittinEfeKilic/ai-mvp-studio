---
spec_version: "2.0"
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
complexity_tier: "advanced"
target_parallelism: "4"
design_mode: "guided"
language: "tr"
status: "draft"
---

# Ürün Özeti

Çözülen problemi, değer önerisini, neden mobil olması gerektiğini ve MVP sonunda
elde edilmesi gereken ölçülebilir sonucu açıklayın.

## Hedef Kullanıcılar

- Birincil/ikincil grupları, kullanım bağlamını, teknik yeterlilik ve erişilebilirlik kısıtlarını yazın.

# MVP Kapsamı

## Dahil

- İlk sürümde bulunacak özellikleri, önceliklerini ve ilişkilerini listeleyin.

## Kapsam Dışı

- Ertelenen hesap, senkronizasyon, ödeme, bildirim, yönetim veya servis özelliklerini yazın.

# Özellik Modülleri ve Sınırlar

Her modülü bağımsız bir builder'ın sahiplenebileceği kadar net ayırın. Sorumluluk,
giriş/çıkış verisi, diğer modüllerle sözleşme ve kapsam dışını belirtin.

## Uygulama Kabuğu

- Tema, navigasyon, bağımlılık bağlama, ortak hata sunumu ve uygulama başlangıcı.

## Ana Özellik Modülü

- Ürünün ana değerini gerçekleştiren özellik ve entegrasyon noktaları.

## İkinci Özellik Modülü

- Ana özellikten bağımsız geliştirilebilecek sorumluluk ve entegrasyon noktası.

# İş Kuralları ve Değişmezler

- Hesaplama, sıralama, benzersizlik, tarih/saat, doğrulama ve silme kurallarını örneklerle yazın.
- İlişkili kayıt silme, tekrarlanan işlem ve yarım kalan işlem davranışını belirtin.

# Kullanıcı Akışları

## Ana Akış

1. Kullanıcı uygulamayı açar.
2. Temel işlemini dokunmatik arayüz üzerinden tamamlar.
3. Sonuç cihazda saklanır ve kullanıcıya gösterilir.

## Alternatif Akışlar

- Düzenleme, silme, arama/filtreleme, iptal ve geri dönme davranışları.

## Hata Akışları

- Çevrimdışı durum, doğrulama hatası, veri bulunamaması ve işlem başarısızlığı davranışları.

# Kritik Kullanıcı Akışları

Bu bölüm otomatik integration/device testlerinin sözleşmesidir. Her akış en az üç
numaralı adım ve tek bir `Beklenen sonuç` satırı içermelidir. Her ana özellik ve
kalıcı veri sınırı en az bir akışta çalıştırılmalıdır. Veritabanı kimliğini serbest
metin alanı olarak sunmayın.

### Ana kayıt akışı

1. Kullanıcı uygulamayı temiz veriyle açar.
2. Gerekli ilişkili kaydı oluşturur veya mevcut kaydı seçer.
3. Zorunlu alanları doldurup işlemi kaydeder.
4. Uygulamayı kapatıp yeniden açar.
- Beklenen sonuç: Kayıt liste ve detayda görünür, yeniden açılışta korunur.

### Doğrulama hatası akışı

1. Kullanıcı kayıt formunu açar.
2. Zorunlu bir alanı boş veya geçersiz bırakır.
3. Kaydet eylemini çalıştırır.
- Beklenen sonuç: Kayıt oluşmaz ve alanla ilişkili anlaşılır hata gösterilir.

### Düzenleme ve silme akışı

1. Kullanıcı mevcut bir kaydın detayını açar.
2. Kaydı düzenleyip güncellenen değeri doğrular.
3. Kaydı siler ve onay iletişimini tamamlar.
- Beklenen sonuç: Güncelleme görünür; silinen kayıt ilgili ekranlardan kalkar ve yeniden açılışta gelmez.

# Ekranlar

Her ekran için amaç, bilgi hiyerarşisi, bileşenler, eylemler, navigasyon giriş/çıkışı
ve bütün durumları yazın.

## Ana Ekran

- İçerik, birincil/ikincil eylemler, filtreler ve boş durum.

## Liste veya Arama Ekranı

- Sıralama, filtreleme, arama, büyük veri kümesi ve sonuç bulunamadı davranışı.

## Detay veya Form Ekranı

- Alanlar, veri tipleri, varsayılanlar, doğrulama, kaydedilmemiş değişiklik ve geri bildirim.

# Ekran Durum Matrisi

| Ekran | İlk açılış | Boş | Yükleniyor | Hata | Başarı | Çevrimdışı |
|---|---|---|---|---|---|---|
| Ana ekran | Başlangıç | Eylemli boş durum | `Yok` veya gösterim | Kurtarma eylemi | Güncel içerik | Yerel davranış |
| Detay/Form | Veri/varsayılan | `Yok` veya gösterim | `Yok` veya gösterim | Alan/genel hata | Kaydetme geri bildirimi | Kayıt davranışı |

# Mobil Platform Kararları

- Form faktörü: Telefon; tablet bu MVP'de yok.
- Ekran yönü: `orientation` ile aynı.
- Veri yaklaşımı: Local-first; internet gereksinimini açıkça belirtin.
- Android sürümü: `min_android_sdk` gerekçesi.
- Arka plan, deep link ve bildirim kapsamı.

# Navigasyon ve Ekran Davranışları

- Başlangıç ekranı, rota adları ve geçişler.
- Android geri düğmesi, klavye ve kaydedilmemiş form verisi davranışı.
- Modal, snackbar, onay ve tekrar deneme davranışları.

# İzinler ve Cihaz Özellikleri

- Her izin için `gerekli` veya `yok`; reddedildiğinde davranış.
- Sensör/platform entegrasyonu yoksa açıkça `Yok.` yazın.

# Veri Modeli ve Sözleşmeler

Her varlığın alan adı, türü, zorunluluğu, varsayılanı, benzersizliği ve doğrulaması.

## Varlıklar ve İlişkiler

- Kimlik üretimi, ilişkiler, yabancı anahtar, indeks ve silme davranışı.
- UI ilişkili kaydı serbest kimlik metniyle değil varlık seçimiyle sağlamalıdır.

## Kalıcılık ve Geçişler

- Yerel çözüm, şema sürümü, migration, seed ve transaction sınırları.
- Bozuk/eski veri ve uygulama yeniden açılışı davranışı.

# Teknik Kararlar

- UI framework: Flutter
- Dil: Dart
- Mimari: Feature-first katmanlar ve bağımlılık yönü
- State yönetimi: Yaklaşım ve gerekçe
- Navigasyon: Yaklaşım ve route sözleşmesi
- Veri saklama: Yerel çözüm ve repository sınırı
- Backend: Yok veya endpoint, hata, timeout ve retry sözleşmesi
- Test: Unit, widget ve integration testleri
- Gözlemlenebilirlik: Kullanıcı hatası ile geliştirici teşhisinin ayrımı
- Build hedefi: Android debug APK

# Tasarım Sistemi ve Görsel Yön

Amaç tek tip bir Studio görünümü değil, ürün bağlamından türeyen tutarlı ve ayırt
edilebilir bir tasarım dilidir.

## Tasarım DNA'sı

- Üç karakter sıfatı.
- Kaçınılacak üç klişe (ör. mor gradient, her yerde yuvarlak kart, anlamsız dashboard).
- Ürüne özgü imza öğesi veya etkileşim.
- Yoğunluk, grid, temel spacing ve görsel ritim.
- Kopyalanmayacak iki referans ile yalnız alınacak tasarım ilkeleri.

## Tasarım Tokenları

- Renk rolleri ve erişilebilir kontrast yaklaşımı.
- Display/title/body/label tipografi rolleri.
- Köşe, elevation, stroke, ikonografi, animasyon/easing ve haptic kararları.
- Açık/koyu/sistem teması davranışı.

## Bileşen Dili

- Buton, alan, kart/liste, seçim, diyalog, snackbar ve boş durum varyantları.
- Normal, pressed, focused, disabled, loading ve error durumları.
- Ortak token kullanın; bütün ekranları aynı yerleşim kalıbına zorlamayın.

## Responsive ve Erişilebilirlik

- Telefon genişlikleri, safe-area, klavye, taşma ve metin ölçekleme.
- En az 48x48 hedef, ekran okuyucu etiketi, odak sırası ve renkten bağımsız geri bildirim.

# Test Stratejisi ve İzlenebilirlik

- İş kuralları → unit test, ekran durumları → widget test eşlemesi.
- Her kritik akış → `integration_test/*_test.dart` eşlemesi.
- Kabul kriteri → özellik modülü → test türü izlenebilirliği.
- Sahte repository ile gerçek kalıcılık gerektiren test sınırlarını ayırın.

# Kabul Kriterleri

Her madde `ACCEPTANCE_CRITERIA.json` içine `AC1..ACn` olarak yazılır. Reviewer yalnız
bu maddeler üzerinden bloklayabilir; gözlemlenebilir ürün davranışı yazın. Toolchain
sonuçlarını (`flutter analyze`, test, APK, cihaz koşusu) buraya yazmayın.

- Ana kullanıcı akışı Android telefonda baştan sona tamamlanabilir.
- Her özellik modülünün temel davranışına ilgili ekranlardan erişilebilir.
- Boş, yükleniyor, hata ve başarı durumları matrise uygun görünür.
- Kalıcı veri uygulama yeniden açıldığında korunur.
- Geri düğmesi ve kaydedilmemiş değişiklikler tanımlanan davranışı uygular.
- Zorunlu alanlar doğrulanır ve hata nedeniyle birlikte gösterilir.
- İlişkili kayıtlar serbest kimlik metni yerine kullanıcı seçimiyle bağlanır.
- Tasarım tokenları ve ürünün imza öğesi ana ekranlarda tutarlı uygulanır.
- Temel akışlar desteklenen genişliklerde taşma olmadan tamamlanır.
- Kapsam dışı özellikler uygulanmaz.

# Kalite Gereksinimleri

- `flutter analyze` uyarısız geçmelidir.
- Birim/widget testleri bulunmalı ve `flutter test` geçmelidir.
- Her kritik akış için `integration_test/` testi bulunmalıdır.
- Debug APK üretilebilmelidir.
- Hatalar yutulmamalı; gösterilmeli veya yeniden fırlatılmalıdır.
- Gizli anahtarlar kaynak koda yazılmamalıdır.
- SDK sürümleri ve kurulum/çalıştırma/test/APK komutları README'de olmalıdır.
- Erişilebilirlik ve farklı telefon genişlikleri doğrulanmalıdır.
- Uygulama otomatik yayınlanmamalıdır.

# Açık Kararlar

- Kodlama öncesi ürün, veri, tasarım ve platform kararlarını kapatın.
- Tamamlandığında yalnız `Yok.` yazın ve `status` değerini `approved` yapın.
