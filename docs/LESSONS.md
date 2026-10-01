# AI MVP Studio — Çıkarılan Dersler

Son güncelleme: 2 Ekim 2026

Bu dosya **tekrar edilmemesi gereken hataları ve ölçülmüş olumsuz sonuçları** tutar.
[PROJECT_STATUS.md](PROJECT_STATUS.md) sistemin bugün ne olduğunu anlatır,
[TODO.md](TODO.md) kalan işi tutar; burada ise *neden böyle yapıldığı* ve
**denenip başarısız olan şeyler** durur — çünkü bir olumsuz sonuç kayda geçmezse
altı ay sonra yeniden denenir.

Her madde aynı şekli izler: **ölçülen belirti → asıl sebep → geriye kalan kural**.

---

## 1. Rol bazlı ucuz model seçimi hattı böldü

**Belirti.** `MVP_STUDIO_AGENT_MODELS` ile mekanik görünen roller daha küçük
modele/efora çekildi. Koşu geliştirme aşamasını geçemedi; ajanlar sözleşmeye uygun
ama derlenmeyen kod üretti, tamir turları aynı imzayla döndü.

**Asıl sebep.** Ayrımı "mekanik iş vs yargı işi" diye kurmuştum. Gerçek ayrım
**"bilgi gerektiriyor mu gerektirmiyor mu"**. `flutter_builder` mekanik görünür ama
Flutter/Dart API yüzeyinin tamamını bilmek zorundadır; küçük model API'yi *uydurur*
ve hata derleyicide, yani üç aşama sonra patlar.

**Kural.** Kod yazan ya da kod okuyup karar veren hiçbir rol küçültülmez. Maliyet
düşürmek isteniyorsa hedef **koşu sayısı** (gereksiz reviewer turu, gereksiz tamir
turu) olmalı, model kalitesi değil. Yetenek kodda duruyor ama `.env` içinde
**bilerek kullanılmıyor**; yeniden açmadan önce bu maddeyi oku.

Rol rol sayılar ve koşunun dökümü: [TODO.md](TODO.md) → "Kapanmış işler" →
*Ucuz model denemesi — ÖLÇÜLDÜ VE REDDEDİLDİ*.

---

## 2. Sessizce devre dışı kalan sözleşme, hata veren sözleşmeden kötüdür

**Belirti.** Reviewer, spec'te olmayan `Q1` diye bir kriter uydurdu ve ona PASS verdi.

**Asıl sebep.** Kabul kriterleri `### AC1 — Başlık` biçiminde yazıldığında ayrıştırıcı
**sıfır kriter** döndürüyordu. Sıfır kriter "sözleşme yok" demekti, "sözleşme bozuk"
değil — kontrol sessizce kapanıyor, ajan boşluğu kendi uydurduğu kriterle dolduruyordu.

**Kural.** Bir sözleşme ayrıştırılamıyorsa koşu **başlamadan** bloklanır
(`#ensureSpecContracts`). Boş sonuç hiçbir zaman "kontrol gerekmiyor" anlamına
gelmez. Aynı kural `USER_FLOWS.json`, `ACCEPTANCE_CRITERIA.json`, `TASK_PLAN.json`
ve `DESIGN_TOKENS.json` için geçerlidir.

---

## 3. Ölçmediğin şey hakkında iddia etme

**Belirti.** Üretilen uygulamalarda "hiç gölge yok, bir tane animasyon var" dedim.
Tarayıcı yazılınca gerçek sayılar çıktı: derinlik 1–4, hareket 6–8.

**Asıl sebep.** Dar bir `grep` ile bakmıştım; yorum satırları, string'ler ve üretilmiş
dosyalar ayıklanmamıştı.

**Kural.** Ürün hakkındaki her nicel iddia `DESIGN_REPORT.json` /
`COMPLETENESS_REPORT.json` gibi **yazılı bir ölçümden** gelir. Ad-hoc `grep`
bir ölçüm değildir; en fazla bir hipotezdir. (Gerçek bulgu değişmedi: kabul edilen
iki uygulamada 0 çizim/gradient, özel font yok, asset yok.)

---

## 4. Tasarım tarayıcısı bilerek kapı değildir

**Belirti.** İki kabul edilmiş MVP'nin ikisinde de gerçek bir token dosyası ve gerçek
bir imza bileşeni vardı, ama ekranlar düzdü. Sözleşme vardı, kod ona dokunmuyordu.

**Asıl sebep.** Sözleşmenin üretilmesi ile uygulanması iki ayrı iş; sadece birincisi
zorunluydu.

**Kural.** `src/design-diagnostics.mjs` **ölçer, kapı kurmaz ve hiçbir tamir turunu
beslemez.** Gerekçe Goodhart: kapı olsaydı ya da bir tamir ajanına "şu uyarıyı
temizle" denseydi, hat anlamsız bir gradient ekleyip kapıyı geçmeyi öğrenirdi —
sade bir uygulamayı süslü bir uygulamaya takas etmiş olurduk. Her kontrol kodu
**projenin kendi token'larına** karşı karşılaştırır; uyulacak bir ev stili yoktur.

---

## 5. Kapı maliyeti ölçülmeden düşürülmez

**Belirti.** Cihaz kapısı yavaş hissettiriyordu.

**Ölçüm.** Tam AVD wipe 48 sn; anlık görüntü (`snapshot load`) yerinde 3–5 sn.

**Kural.** Sıfırlama **koşullu** (boş alan eşiğin altındaysa) ve **iki kademeli**:
içeride snapshot, tam wipe yalnız koşunun sonunda bir kez — çünkü host tarafındaki
`userdata-qemu.img.qcow2` dosyasını yalnızca wipe küçültebilir. Optimizasyon
öncesinde her adımın süresi `durations_ms` içine yazılır; ölçüm olmadan yapılan
hızlandırma tahmindir.

---

## 6. Hata nereden okunuyorsa oradan sınıflandırılır

**Belirti.** Codex kullanım limiti `failed` olarak etiketlendi; koşu kurtarılabilir
görünmüyordu.

**Asıl sebep.** Limit mesajı stderr'de değil, **JSONL olay akışında**
(`type:"error"` / `type:"turn.failed"`) geliyor. Yalnız stderr'e bakan sınıflandırıcı
gerçek sebebi hiç görmüyordu.

**Kural.** `classifyInterruption` akıştaki `streamError`'ı da okur. Bir alt sürecin
"nasıl konuştuğu" varsayılmaz; çıktısının her kanalı okunur.

---

## 7. Aracın kendi doğrusu, spec'in iddiasına üstündür

**Belirti.** Spec Android API 23 istedi; hat build aşamasında patladı.

**Asıl sebep.** Kurulu Flutter sürümü 23'ü desteklemiyordu. Bunu ancak derleyici
söylüyordu — yani üç aşama geç.

**Kural.** `evaluateMinSdkCompatibility` Flutter'ın **kendi kaynağındaki**
`minSdkVersionInt` değerini okur ve uyumsuzluğu koşu başlamadan bloklar. Bir
sözleşme alanı toolchain'in kabul etmeyeceği bir değer taşıyorsa bu bir spec
hatasıdır ve önce yakalanır.

---

## 8. `git` sorusu doğru yere sorulmalı

**Belirti.** Her devam ettirme `git commit` → "no changes added to commit" ile ölüyordu.

**Asıl sebep.** `gitChanged()` **çalışma ağacını** sorar, pathspec'siz `git commit`
ise **index'i**. İkisi aynı soru değil: ilgisiz bir dosya kirliyken birincisi "evet"
der, ikincisi commit edecek bir şey bulamaz.

**Kural.** Tüm artefakt commit'leri `commitPaths(workspace, paths, message)`
üzerinden gider: istenen yolları izlenen/var olanlarla filtreler (aksi halde
`git add` eşleşmeyen pathspec'te sert hata verir), o yollar için `status --porcelain`
boşsa hiç commit denemez.

---

## 9. Tamir yolunun kendi kalite turu olmalı

**Belirti.** Reviewer tamiri build'i bozdu ve hat hiç tamir turu almadan başarısız döndü.

**Asıl sebep.** Kalite tamir döngüsü yalnızca ana yolda vardı; review-repair yolu
tek atışlıktı.

**Kural.** Döngü `#settleQualityGate` olarak ortaklaştırıldı; ana yol 3, review-repair
yolu 2 tur alır. Kod üreten **her** yol, ürettiğini doğrulayan aynı kapıdan geçer.

---

## 10. Windows ayrıntıları hata sanılmasın

- `.bat` sarmalayıcıları (`flutter.bat`, `adb` yanındaki araçlar) doğrudan
  çağrıldığında boş çıktı verir; `cmd.exe /d /s /c` sarmalayıcısı şarttır. Bu
  eksikken "`flutter emulators` boş dönüyor" diye yanlış alarm verildi.
- `adb emu avd snapshot load` sonrası cihaz kısa süre "authorizing" durumunda kalır;
  araya `adb wait-for-device` girmezse sonraki komut sahte bir hata üretir.
- Geçici olarak görünen bir `adb` durumu kalıcı bir sınıflandırma sanılmamalı: bir
  emülatör "üçüncü taraf" diye raporlandı, sonradan gerçek AVD olduğu görüldü.

**Kural.** Bir araç beklenmedik biçimde boş/yanlış cevap verdiğinde önce **çağrı
biçimi** sorgulanır, sonra araç suçlanır.

---

## 11. `flutter analyze` `info` bulgusunda da 1 döner

**Belirti.** Kalite kapısı tek bir `info` seviyesindeki lint yüzünden FAIL verdi.

**Kural.** Kapı `analyze --no-fatal-infos` ile çalışır: bulgu yine basılır, koşu
bilgi amaçlı bir uyarı yüzünden ölmez. (Gerçek toolchain'de doğrulandı: exit 1 → 0,
bulgu çıktıda duruyor.)

---

## 12. Kalıcı kayıt, yeniden üretilebilir dizinin içinde durmamalı

**Belirti.** 29 Eylül temizliğinde `projects/` 24,6 GB'tan 1,56 GB'a indi (23 GB'ı
`build/` ve `.dart_tool/`). Ama `projects.artifact_path` **`build/` içine** işaret
ediyordu: düz bir silme, panelin "APK indir" bağlantılarının tamamını koparacaktı.

**Yapılan.** Silmeden önce veritabanının işaret ettiği 9 APK (1,45 GB) taşınıp
silme sonrası **tam olarak aynı yola** geri kondu; bağlantılar çalışmaya devam ediyor.
Kaynak, `.git` geçmişi, worktree'ler ve `data/studio.db` dokunulmadı.

**Kural.** Veritabanının işaret ettiği hiçbir dosya, araçların istediği zaman
silebileceği bir cache dizininde tutulmamalı.

**Kapatıldı (29 Eylül 2026).** `preserveArtifact` teslim APK'sını
`projects/<id>/artifacts/` altına kopyalıyor; kopya depo **dışında**, böylece bir
agent'ın commit edilmemiş değişikliği sanılamaz. API `artifact_available`
hesaplıyor ve panel dosya gerçekten yoksa bağlantıyı 404 vermek yerine gizliyor.
Mevcut dokuz kayıt taşındı; `build/` artık tamamen atılabilir.

---

## 13. Bir tarama doğru olanı yanlış gösterebilir

**Belirti.** Tasarım hattının ilk gerçek koşusu `DRIFT` raporladı: 12 "tema dışı
sabit renk". On ikisi de yanlıştı.

**Asıl sebep.** `COLOR_LITERAL` regex'indeki tek bir `i` bayrağı hem hex
rakamlarını hem `Colors` **tanımlayıcısını** büyük/küçük harf duyarsız yaptı. Tema
uzantısının yerel değişkeni `colors` adını taşıdığı için `colors.orman` sızıntı
sayıldı. Yani tarama, tam olarak **teşvik etmesi gereken deseni** cezalandırdı:
hat paleti bir tema uzantısına toplamıştı, doğru olanı yapmıştı.

**Kural.** Bir desen kontrolü yazarken "neyi yakalıyorum" kadar **"neyi yanlışlıkla
yakalarım"** sorusu da yanıtlanmalı; özellikle harf duyarlılığı gibi bir bayrak
birden çok alternatifi aynı anda etkiliyorsa. Ve ölçüm, gerçek bir çıktı üzerinde
denenmeden doğru varsayılmamalı: on bir depoda da aynı yanlış pozitif vardı,
hiçbiri fark edilmemişti.

**Bu olay kapı-olmama kararını da doğruladı.** Tarama bir kapı olsaydı, hat uyarıyı
geçmek için tema uzantısını terk edip literal renk yazmaya dönerdi — yani ölçüm,
kodu **daha kötü** hâle getirerek "düzelirdi". [4. ders](#4-tasarım-tarayıcısı-bilerek-kapı-değildir)
teorik bir endişe değil; ilk gerçek koşuda bunun eşiğinden dönüldü.

## 14. Agent'ın bozduğu metin kodlaması kapıya takılmıyor

**Belirti.** Review Repair bir Dart dosyasını yazarken `günlük seri` metnini
`gÃ¼nlÃ¼k seri` yaptı — `ü` çift kodlandı (`C3 83 C2 BC`, doğrusu `C3 BC`).
Analyze, test, APK ve bütünlük taramasının dördü de bunu görmedi; **reviewer**
gördü, çünkü okuduğu bir string'in içindeydi.

**Bedel.** 106.506 token: fazladan bir inceleme turu (89.600) artı bir onarım turu
(16.906) — koşunun %7,5'i. Görünür olması şanstı; aynı bozulma reviewer'ın
okumadığı bir dosyada olsa doğrudan kullanıcıya giderdi.

**Kural.** Türkçe (veya herhangi bir ASCII dışı) metin üreten bir hatta, bozuk
kodlama deterministik olarak aranmalı. Çıktı kriteri tartışmasız: bir Dart
kaynağında `Ã` + devam baytı dizisi hiçbir zaman kasıtlı değildir — yani bu, uyarı
değil **kapı** olmayı hak eden az sayıdaki kontrolden biri.

**Kapatıldı (2 Ekim 2026).** `findBrokenEncoding` kalite kapısının dördüncü
çekine bağlandı ve bloklar. Regresyon testi her Türkçe harfin hem bozuk hem doğru
hâlini kapsıyor.
