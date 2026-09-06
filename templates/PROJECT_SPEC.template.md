---
spec_version: "1.0"
project_name: "PROJE ADI"
project_slug: "proje-slug"
language: "tr"
application_type: "web"
status: "draft"
---

# Ürün Özeti

## Amaç

Ürünün neyi başarması gerektiğini iki veya üç net cümleyle açıklayın.

## Hedef Kullanıcılar

- Birincil kullanıcı grubu
- İkincil kullanıcı grubu

## Çözülen Problem

Kullanıcının mevcut problemini, bugün kullandığı alternatifi ve ürünün sağlayacağı temel faydayı açıklayın.

## Başarı Ölçütleri

- MVP'nin başarılı sayılması için ölçülebilir bir sonuç
- Örneğin: Kullanıcı temel akışı üç dakikadan kısa sürede tamamlayabilmeli.

# MVP Kapsamı

## Dahil

- MVP'de mutlaka bulunacak özellik
- İkinci zorunlu özellik

## Kapsam Dışı

- Bu sürümde özellikle yapılmayacak özellik
- Sonraki sürüme bırakılan özellik

# Kullanıcı Akışları

## Ana Akış

1. Kullanıcı uygulamayı açar.
2. Temel işlemini gerçekleştirir.
3. Sistem sonucu kaydeder ve kullanıcıya gösterir.

## Hata Akışları

- Zorunlu alan boş bırakılırsa gösterilecek davranış
- İşlem başarısız olursa kullanıcının göreceği durum

# Ekranlar

## Ana Ekran

- Ekranın amacı
- Görünen ana bileşenler
- Kullanıcının gerçekleştirebildiği işlemler

## Form veya Detay Ekranı

- Alanlar ve doğrulama kuralları
- Birincil ve ikincil aksiyonlar
- Başarı ve hata durumları

# Veri Modeli

## Ana Varlık

- id: string
- title: string
- createdAt: datetime
- status: enum

Verilerin nerede saklanacağını, ilişkileri, silme davranışını ve örnek kayıtları açıklayın.

# Teknik Kararlar

- Frontend: Kararlaştırılan teknoloji
- Backend: Yok veya kararlaştırılan teknoloji
- Veri saklama: localStorage / SQLite / PostgreSQL vb.
- Kimlik doğrulama: Yok veya seçilen yöntem
- Paket yöneticisi: npm
- Test yaklaşımı: Birim ve/veya tarayıcı testleri
- Local çalışma komutu: Belirlenecek
- Deployment hedefi: Vercel / Cloudflare / başka hedef / bu sürümde yok

# Tasarım Yönü

- Görsel karakter ve referanslar
- Renk yaklaşımı
- Mobil veya masaüstü önceliği
- Erişilebilirlik beklentileri
- Desteklenecek ekran genişlikleri

# Kabul Kriterleri

Bu bölümdeki her madde `ACCEPTANCE_CRITERIA.json` içine `AC1..ACn` olarak yazılır ve
Mobile Reviewer her birini kanıtıyla yanıtlamak zorundadır. Reviewer **yalnız** bu
maddeler üzerinden bloklayabilir, dolayısıyla maddeler gözlemlenebilir ürün davranışı
anlatmalıdır. `flutter analyze`, `flutter test`, APK üretimi ve cihaz koşusu gibi
toolchain sonuçlarını buraya yazmayın; onların sahibi kalite ve cihaz kapılarıdır.

- Kullanıcı ana akışı baştan sona tamamlayabilir.
- Zorunlu alanlar doğrulanır ve anlaşılır hata mesajı gösterilir.
- Sayfa yenilendiğinde kalıcı olması gereken veriler korunur.
- Mobil genişlikte yatay taşma oluşmaz.
- Kapsam dışı özellikler uygulanmaz.

# Kalite Gereksinimleri

- Build ve sözdizimi kontrolleri başarılı olmalıdır.
- İlgili otomatik testler geçmelidir.
- README kesin kurulum, çalıştırma ve test komutlarını içermelidir.
- Gizli anahtarlar kaynak koda yazılmamalıdır.
- Temel klavye erişilebilirliği ve görünür odak stilleri sağlanmalıdır.
- Uygulama otomatik olarak deploy edilmemelidir.

# Açık Kararlar

- Karar verilmesi gereken maddeleri burada listeleyin.
- Tüm kararlar tamamlandığında bu bölümü yalnızca `Yok.` yapın ve frontmatter içindeki
  `status` değerini `approved` olarak değiştirin.

