# AI MVP Studio — TODO

Son güncelleme: 2 Ekim 2026

Son tam kontrol: `npm run check` başarılı, `npm test` **235/235 PASS**.
`npm run test:minimal-live` gerçek Codex ile uçtan uca geçiyor (tek canlı çağrı).
Release hazırlığı gerçek Flutter toolchain'inde `Akış Cep` üzerinde `READY` üretti.

**Son uçtan uca kanıt (1 Ekim 2026):** `Seri Takip` (`81cfde18afe2`) tasarım
hattının ilk gerçek sınavıydı. Kalite PASS, cihaz 5/5 PASS, bütünlük `COMPLETE`,
tasarım uyumu `APPLIED`, reviewer AC1–AC11 hepsi PASS, 1.415.409 token. Uygulama
LDPlayer'da elle de çalıştırıldı. Öncesinde `AboneCep` ve `Sipariş Defteri` de
`awaiting_user_review`'a ulaşmıştı; `AboneCep` ardından `accepted`.

Bu dosya **kalan işi** tutar. Kapanmış maddelerin gerekçeleri ve tasarım kararları
[PROJECT_STATUS.md](PROJECT_STATUS.md) içindeki sözleşme ve "Bilinçli kararlar"
bölümlerine taşınmıştır; tam metinleri `git log` içindedir. Denenip **başarısız
olan** yaklaşımlar ve tekrar edilmemesi gereken hatalar
[LESSONS.md](LESSONS.md) içindedir — yeni bir madde açmadan önce oraya bakın.

## Açık işler

**Şu an açık iş yok.** Hattın bilinen kusurları kapandı; sıradaki yön bir sonraki
dilimi seçmektir, bkz. [Planlanan yön](#planlanan-yön-henüz-uygulanmadı).

Yeni bir madde açarken: önce [LESSONS.md](LESSONS.md), çünkü denenip reddedilmiş
yaklaşımlar orada. Madde kapanırken regresyon testi eklenmeli, `npm run check` ve
`npm test` çalıştırılmalı, ardından `PROJECT_STATUS.md` güncellenmelidir.

## Maliyet dağılımı (ölçüm)

Açık iş değil, yukarıdaki maddelerin dayanağı. 25–26 Eylül 2026 tarihli iki
koşunun rol bazlı dağılımı:

| Rol | Faturalanabilir | Pay | Koşu |
| --- | --- | --- | --- |
| `flutter_builder` | 695.306 | %31 | 5 |
| `reviewer` | 590.738 | %26 | **6** |
| `repair` | 312.861 | %14 | 5 |
| `device_repair` | 255.700 | %11 | 4 |
| `integration` | 114.864 | %5 | 1 |
| `coordinator` | 79.967 | %4 | 1 |
| planlama (4 agent) | 185.384 | %8 | 4 |
| `review_repair` | 38.256 | %2 | 2 |
| **toplam** | **2.273.076** | | |

Okunuşu: **onarım döngüleri + tekrarlanan inceleme %53.** İlk geçiş üretimi
(builder + planlama) yalnız %39. Yani maliyet uygulama *yazmakta* değil, yazılanı
**doğrulamak ve düzeltmekte**.

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

Aşağıdaki üçü **karar**, iş değil — açık iş listesinden bu yüzden çıkarıldı:

- **`Akış Cep` yeniden koşulmayacak.** Kapalı bir soruyu üçüncü kez sormak olurdu:
  kayıtlı raporda üç ürün kontrolü de (`flow_coverage`, `apk_install`, `launch`)
  zaten **PASS**; `WAITING` yalnız temizliğin kapı sayıldığı dönemden geliyor ve
  o semantiğin değiştiği canlı `wipeAvdAfterTest` ölçümüyle ayrıca doğrulandı.
  Üstelik **yeni bir uçtan uca koşu cihaz kapısını güncel kodla zaten çalıştırır**
  — hem de bu kez agent'ların yeni yazdığı bir uygulamayla, yani daha zor
  koşulda. Kayıt geçmişi bozmamak için `awaiting_device_test` bırakıldı.

- **Otomatik resume yapılmayacak.** Codex duraklaması artık `paused_usage` olarak
  doğru etiketleniyor, ama "limit açılınca kendiliğinden devam et" kullanıcı
  yokken para harcar. Devam ettirmek yeni bir token bütçesi penceresi açar ve
  bu, [PROJECT_STATUS.md](PROJECT_STATUS.md) tanımıyla *bilerek verilmiş bir
  harcama kararıdır*. Yapılacaksa yalnız opt-in ve açık bütçe sınırıyla.
- **Eski örnek projeler yeniden üretilmeyecek.** `Servis Cep` kritik akış
  sözleşmesinden önce üretildi (`USER_FLOWS.json` ve `integration_test/` yok,
  cihaz kapısı hemen duruyor), `Stok Cep` eski bir cihaz koşusunun başarısız
  kaydı. İkisi de **referans kayıt**; üretim maliyeti ödemeye değmiyor ve bu
  kullanıcının verdiği bir karardır. Yeni bir sözleşme sınanacaksa yeni bir spec
  koşulur, eski kayıt olduğu gibi bırakılır.

## Planlanan yön (henüz uygulanmadı)

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

**Bozuk metin kodlaması artık kapıda yakalanıyor (2 Ekim 2026)**

- `findBrokenEncoding` kaynak teşhis taramasına eklendi ve kalite kapısının
  dördüncü çekine bağlandı: bulgu **bloklar**, uyarı değildir.
- Desen `[Â-Å][\u0080-¿]` — iki baytlık bir UTF-8 dizisinin lead
  baytı ve devam baytı, Latin-1 olarak okunmuş hâli. İkinci karakterin aralığı
  gerçek hiçbir kelimede büyük harften sonra gelmez, bu yüzden yanlış pozitifi yok.
- Satır başına tek bulgu: bozulan bir kelime deseni çoğu zaman iki kez tetikler.
- Regresyon: `ü ı ş ğ ç ö İ Ş Ğ Ç Ö Ü` harflerinin her biri için hem bozuk hâlin
  yakalandığı hem doğru hâlin temiz geçtiği doğrulanıyor; ayrıca bozuk bir dosyanın
  `runSourceDiagnostics` çıktısını FAIL yaptığı.

**Neden kapı:** çıktı kriteri tartışmasız. Ölçülen bedel 106.506 token'dı ve
görünür olması şanstı — reviewer'ın okumadığı bir dosyada olsa kullanıcıya giderdi.
Gerekçe [LESSONS.md → 14](LESSONS.md).

**İmza öğesinin yüzeyleri sözleşmeye girdi (2 Ekim 2026)**

- `signature_element.surfaces` zorunlu: en az iki yüzey, boş girdi kabul edilmiyor,
  değerler kırpılarak saklanıyor.
- UX prompt'u alanı ve gerekçesini taşıyor; koordinatör prompt'u artık
  `DESIGN_TOKENS.json` okuyor ve listedeki her yüzeyi bir göreve dağıtmak zorunda.
- Mobil şablonun "Görsel Zenginlik" bölümü en az iki yüzey saymayı istiyor.
- Regresyon: eksik, tek elemanlı, dizi olmayan ve boş girdili `surfaces` reddediliyor.

**Neden sayım değil beyan:** kodun imza öğesini "kullandığını" saymak Goodhart'a
açıktır — adı geçen bir widget eklemek ucuzdur. Zorlanan şey sözleşmenin eksiksiz
beyan edilmesi, kullanımın ölçülmesi değil ([LESSONS.md → 4](LESSONS.md)).

**Etki:** sözleşmesinde `surfaces` olmayan eski bir proje devam ettirilirse
`#settleDesignTokens` onu reddeder ve bir düzeltme turu harcar. Bu bilinçli:
sözleşme sessizce gevşetilmez.

**Tasarım hattı gerçek koşuda sınandı (1 Ekim 2026)**

`Seri Takip` aynı spec'le ikinci kez koşuldu (`81cfde18afe2`); tek değişen hat.
Sonuç `awaiting_user_review`, AC1–AC11 hepsi PASS, 1.415.409 token.

- **Sözleşme iş gördü.** UX agent'ı ilk denemede tipografi rollerine
  `letterSpacing` yazmamıştı; sözleşme **bütün ihlalleri tek seferde** bildirdi ve
  agent tek düzeltme turunda (56 sn) hepsini kapattı. Sözleşme olmasaydı tipografi
  rampası yarım çıkar ve kimse fark etmezdi.
- **Ölçülen getiri çizimde:** çizim/gradient 2 → 7. Kabul edilmiş iki uygulamada
  bu sayı sıfırdı. Tipografi yoğunluğu dosya başına 0,44 → 0,63.
- `DESIGN_REPORT.json` durumu **`APPLIED`**, sıfır uyarı. Tam tablo
  [PROJECT_STATUS.md → Nerede duruyoruz](PROJECT_STATUS.md).
- **Yan ürün olarak ilk kez gerçek koşuda görüldü:** Review Repair tetiklendi ve
  kendi kırdığını onardı; cihaz kapısı devam ettirme sonrası üç kez koştu, üçü de
  PASS; artefakt `build/` dışına ilk koşudan itibaren yazıldı; checkpoint'ten
  devam tamamlanmış on görevi yeniden koşmadı.

**Tarama kendi yanlış pozitifini üretti — düzeltildi (2 Ekim 2026)**

Koşu önce `DRIFT` raporladı: 12 "tema dışı sabit renk". Hepsi yanlıştı.

- `COLOR_LITERAL` regex'indeki tek `i` bayrağı hem hex rakamlarını hem `Colors`
  **adını** büyük/küçük harf duyarsız yapıyordu. Tema uzantısının yerel değişkeni
  `colors` olduğu için `colors.orman` sızıntı sayıldı — yani **doğru desen
  cezalandırıldı**.
- Düzeltme: hex için `0[xX][0-9a-fA-F]`, tanımlayıcı için harf duyarlı `Colors\.`.
- Düzeltmeden sonra: `Seri Takip` her iki koşuda da **0** sabit renk, rapor
  `APPLIED`. Eski ölçümlerdeki sabit renk sayıları da buna göre düzeltildi.
- Regresyon testi: tema uzantısından renk okumak sızıntı sayılmaz.

**Ders:** bir tarama yalnız yanlış pozitif üretmekle kalmaz, **doğru olanı yanlış
gösterebilir.** Kapı olmaması bu kez işe yaradı — kapı olsaydı hat, tema
uzantısını terk edip literal yazmaya geri dönerek "düzelmiş" olurdu.

**Reviewer gereksiz koşmuyor — ÖLÇÜLDÜ, BULGU YOK (29 Eylül 2026)**

Ölçüm için kod eklemeye gerek olmadığı görüldü: `agent_runs.checkpoint_commit`
zaten her agent koşusunun başladığı HEAD'i tutuyor.

- Kayıtlı **23 reviewer koşusunun tamamı** farklı bir HEAD'den başlamış.
- Ardışık iki koşunun aynı commit'e bakması **hiç olmamış** (0 koşu, 0 token).

Yani reviewer'ın pahalı olması tekrar değil, **her turun gerçekten yeni koda
bakması**. Maliyet düşürülecekse hedef onarım turu sayısı olmalı. Madde kapandı,
kod değişmedi — ölçmeden önce kod yazılsaydı boşa giderdi.

**Kalıcı artefaktlar `build/` dışına taşındı (29 Eylül 2026)**

- `preserveArtifact` teslim APK'sını `projects/<id>/artifacts/` altına kopyalıyor;
  `artifact_path` artık o kopyayı gösteriyor. Kopya depo **dışında**, böylece
  bir agent'ın commit edilmemiş değişikliği sanılamaz.
- Kopyalama başarısızsa kaynak yol döndürülüyor: bitmiş bir koşu bir dosya
  kopyası yüzünden kaybedilmez.
- API `artifact_available` alanını hesaplıyor (dosya gerçekten var mı) ve panel
  bağlantıyı yalnız o zaman gösteriyor — bayat kayıt 404 vermek yerine gizleniyor.
- İndirme ucunun kapsama kontrolü depo yerine **proje dizinine** göre yapılıyor;
  hem yeni hem eski kayıtlar çalışıyor.
- Mevcut 9 kayıt yeni konuma taşındı ve satırları güncellendi. `build/` artık
  her proje için tamamen atılabilir.
- Regresyon: iki test — kopyanın `build/` silindikten sonra da durduğu, ve
  kaynak yokken koşunun yol kaybetmediği.

**Kod yazan rollere "var olmayan API uydurma" kuralı (29 Eylül 2026)**

`Seri Takip` koşusunu düşüren hata sınıfı buydu: `SemanticsFlags.hasFlag` ve
`SemanticsNode.actions` — ikisi de yok. Uydurulmuş API yazıldığı yerde değil,
üç aşama sonra analyzer'da patlıyor; repair de aynı yüzeyi bilmediği için tahmin
ediyor.

- Kural, tek tek prompt'lara değil **ortak ekin** üstüne kondu: `flutter_builder`,
  `integration`, `test_strategy`, `device_repair`, `repair`, `review_repair`.
  Builder kadar repair'in de taşıması şart, çünkü asıl tur orada yanıyordu.
- Regresyon testi kuralın ekte olduğunu ve altı rolü de kapsadığını doğruluyor.
- **Ölçülecek:** sonraki koşuda API kaynaklı analyzer hatası sayısı. Prompt kuralı
  deterministik garanti değil; işe yaramazsa mekanik kontrole çevrilmeli.

**Bütünlük bulguları ölçüldü, onarıma bağlanmadı (29 Eylül 2026)**

11 üretilmiş depo tarandı:

- 9 depo `COMPLETE`, 2 depo `INCOMPLETE`, toplam 13 bulgu.
- **0 yanlış pozitif.** İkisi de elle doğrulandı: `1ddc9c6ed5ae` hâlâ Flutter demo
  sayaç iskeletini taşıyor, `b9c53b9a14bf` hareket satırında `onTap: () {}` ile
  hiçbir şey yapmıyor.
- Kritik gözlem: **reviewer'a ulaşan hiçbir koşu `INCOMPLETE` değil.** İki bulgu
  da başarısız/eski kayıtlardan geliyor.

Bu yüzden onarım döngüsüne bağlanmadı: bugün hiç tetiklenmeyecek bir tur, ölü
kod olur ve yanında Goodhart riski taşır ([LESSONS.md → 4](LESSONS.md)). Tarama
ölçmeye ve kanıtı kullanıcıya göstermeye devam ediyor. Gerçek bir koşu
`INCOMPLETE` verdiğinde madde yeniden açılmalı.


**Tasarım hattı — sözleşme, prompt ve ölçüm (29 Eylül 2026)**

Üç kaldıraç birlikte uygulandı. **Henüz gerçek bir koşuda sınanmadı** — bkz.
açık iş 1.

- `src/design-tokens.mjs`: `DESIGN_TOKENS.json` sözleşmesi. Dokuz renk rolü, beş
  kontrast çifti (gerçek WCAG bağıl parlaklık hesabı, Flutter'ın `#AARRGGBB`
  biçimi dahil), en az beş tipografi rolü, her rolde `lineHeight`/`letterSpacing`,
  en az üç ayrık ağırlık ve boyut, artan ölçekler, imza bileşeni. İhlallerin
  **tamamı tek seferde** bildirilir ki tek düzeltme turu hepsini kapatabilsin.
- UX agent'ı artık iki artefakt üretiyor; sözleşme reddedilirse gerekçesiyle bir
  kez düzeltme isteniyor (`#settleDesignTokens`), ikinci ret koşuyu düşürüyor.
- `src/design-diagnostics.mjs`: `DESIGN_REPORT.json`. Sözleşmenin koda yansıyıp
  yansımadığını sayar; yorum ve string'ler `maskNonCode` ile ayıklanır, üretilmiş
  dosyalar (`*.g.dart`, `*.freezed.dart`) taranmaz, tema dizinindeki renk
  literalleri meşru sayılır. **Kapı değil, onarım girdisi değil** — gerekçe
  [LESSONS.md → 4](LESSONS.md).
- Yükseklik ölçeğinde `0` meşru kademedir; "her şey düz" bir tasarım kararıdır ve
  `depth_unused` yalnız sözleşme derinlik vaat ettiğinde tetiklenir.

**Depo temizliği ve belge düzeni (29 Eylül 2026)**

- `projects/` 24,6 GB → 1,56 GB. Yalnız yeniden üretilebilir cache'ler silindi;
  `projects.artifact_path`'in işaret ettiği dokuz APK taşınıp aynı yola geri
  kondu, kaynak/`.git`/worktree/`data` dokunulmadı. Çıkan ders ve kalıcı düzeltme:
  [LESSONS.md → 12](LESSONS.md) ve açık iş 5.
- README 48,7 → 20,5 KB. Hat ayrıntısı `PIPELINE.md`'ye, tarihli doğrulama
  kanıtları `PROJECT_STATUS.md`'ye taşındı; repository haritası, ayarlar, komutlar
  ve panel hiyerarşisi tek kaynağa indirildi. README'ye **Belge haritası** ve
  yeni oturum için tek prompt eklendi. `LESSONS.md` açıldı ve `AGENTS.md`
  başlangıç okuma listesine girdi.

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

**Bütünlük ölçümü ve Review Repair gerçek koşularda görüldü (25–26 Eylül 2026)**

İkisi de açık madde olarak duruyordu; iki uçtan uca koşu ikisini de karşıladı.

- **Uygulama bütünlüğü:** `AboneCep` ve `Sipariş Defteri` koşularının ikisinde de
  `APPLICATION_COMPLETENESS.json` üretildi ve **`COMPLETE`** çıktı (0 blocker,
  0 uyarı). Panelin Doğrulama sekmesinde görünüyor. Ölçüm kapı değil, durumu
  değiştirmedi.
- **Review Repair:** iki kez gerçek koşuda çalıştı. `AboneCep`'te üretilen
  README hâlâ "API 23" diyordu; `Sipariş Defteri`'nde AC11 (semantik renk
  tokenları ana ekranlarda uygulanmamış) blokladı. İkisinde de bulgu kapandı ve
  reviewer sonraki turda PASS verdi.
- Yan kazanç: bu yolda **gerçek bir kusur bulundu ve kapatıldı** — review
  repair'in kendi düzeltmesiyle kalite kapısını kırması hâlinde koşu hiç onarım
  hakkı olmadan ölüyordu. Ayrıntı aşağıda.

**Sonraki dilim kararı:** bütünlük taramasının görsel/anlamsal tarafı (ölü uçlu
navigasyon, eksik yükleniyor/boş/hata durumu) hâlâ kapsam dışı ve iki koşuda da
bir ihtiyaç doğurmadı — iki uygulama da `COMPLETE` çıktı. Bu yüzden öncelik
maliyet hattına verildi; bütünlüğün genişletilmesi için önce bir koşunun bunu
gerektirmesi beklenecek.

**Ucuz model denemesi — ÖLÇÜLDÜ VE REDDEDİLDİ (26 Eylül 2026)**

Rol bazlı model seçimi `Seri Takip` koşusunda gerçek veriyle denendi. Sonuç:
**maliyet için ucuz modele geçmeyin.** `.env` boş bırakıldı; yetenek kodda
duruyor ama varsayılan kullanım değil.

Denenen: `repair`, `device_repair`, `integration`, `review_repair` →
`gpt-5.6-luna:low` ("Fast and affordable agentic coding model"). Diğerleri
varsayılanda (`gpt-5.6-sol:medium`).

| Rol | Model | Sonuç |
| --- | --- | --- |
| Integration | `luna:low` | **İyi** — 144 sn / 82.842 token (`sol` ile 379 sn / 114.864). %28 daha az token, 2,6× hızlı, çıktısı sorunsuz |
| Repair | `luna:low` | **Hattı böldü** — 3 tur, 156.355 token, kapı geçilemedi, proje `failed` |

Koşu 1.038.597 token harcadı ve çalışan uygulama üretmedi.

**Neden.** Kalan üç hata builder'ların (`sol:medium`) yazdığı widget testlerindeydi
ve hepsi var olmayan Flutter API'siydi: `SemanticsFlags.hasFlag`,
`SemanticsNode.actions`. Ucuz repair üç turda üç kez dosyaya dokundu, her turda
imza değişti (yani bir şey denedi) ama gerçek API'yi bilmediği için hep yanlış
tahmin etti. Erken durma bile tetiklenmedi.

**Ayrım "mekanik / yargı" değil, "bilgi gerektiren / gerektirmeyen".**
Integration mevcut kodu okuyup taşır — ucuz model yapabiliyor. Repair *"bu Flutter
sürümünde doğru API ne?"* sorusunu cevaplamak zorunda; bu bilgi işidir. Önceki
maliyet tablosundan çıkarılan "mekanik roller ucuza alınabilir" hipotezi yanlıştı.

**Kalan tek aday:** `integration=gpt-5.6-luna:low`. Ölçülmüş tek kazanç bu, ama
tek başına toplamın %5'i olduğu için kurcalamaya değmez. Bilinçli olarak
kullanılmıyor.

**Rol bazlı model seçimi (26 Eylül 2026)**

- `MVP_STUDIO_AGENT_MODELS` ile rol başına model ve reasoning effort atanabiliyor:
  `role=model` veya `role=model:effort`, virgülle. Atanmayan rol hiçbir bayrak
  almıyor ve bugünkü davranışı koruyor.
- `codex exec` çağrısına `--model` ve `-c model_reasoning_effort=` ekleniyor;
  ikisinin de gerçek Codex binary'sinde kabul edildiği doğrulandı.
- `agent_runs` artık `model` ve `reasoning_effort` tutuyor; panelin rol
  tablosunda "İstenen model" kolonu olarak görünüyor.
- Bilinmeyen rol adı **yüksek sesle** hata veriyor: sessiz bir yazım hatası
  "özellik çalışmıyor" ile ayırt edilemez olurdu.

**Düzeltme — önceki notum yanlıştı.** TODO'da *"değer Codex'in `turn_context`
olayından okunsun (akışta geliyor)"* yazıyordu. Gelmiyor: `exec --json` akışının
tamamı `thread.started`, `turn.started`, `item.started`, `item.completed`,
`turn.completed`, `turn.failed` ve `error`'dan oluşuyor; hiçbiri model taşımıyor.
`turn_context`'i Codex'in **oturum kayıt dosyasından** okumuştum
(`~/.codex/sessions/.../rollout-*.jsonl`), exec akışından değil.

Bu yüzden kayıt **Studio'nun ne istediğini** tutuyor, Codex'in ne kullandığını
değil. Atama yoksa alan `null` ve bu "Codex kendi yapılandırmasıyla karar verdi"
demek. Ölçülmeyen şey ölçülmüş gibi yazılmıyor.

**Review Repair kendi kırdığını onarabiliyor (26 Eylül 2026)**

- Kalite kapısını PASS'e sürükleyen döngü `#settleQualityGate` içine alındı ve iki
  yoldan da çağrılıyor: ana hat (3 tur) ve Review Repair sonrası (2 tur).
- Eskiden Review Repair sonrası `validateQualityReport` ilk seferde PASS talep
  ediyordu; kapı düşerse koşu **tek bir onarım hakkı bile olmadan** ölüyordu.
- Sınırlar korunuyor: aynı imza iki kez tekrarlarsa erken durur ve
  `ROOT_CAUSE_REPORT.md` yazılır.

**Ölçülen kanıt:** `Sipariş Defteri` koşusunda cihaz kapısı 8/8 PASS geçti,
reviewer AC1–AC12'nin yalnız AC11'ine takıldı (semantik renk tokenları ana
ekranlarda uygulanmamıştı), Review Repair istenen iki düzeltmeyi yaptı ve bunu
yaparken dört widget testini kırdı (`AppColorsContext.appColors` test ortamında
null). Proje `Kalite raporu geçersiz: test FAIL, apk SKIPPED` ile düştü — oysa
aynı hata ana hatta olsa üç onarım turu alırdı.

**Codex duraklamaları artık `failed` görünmüyor (25 Eylül 2026)**

- `codex-runner` Codex'in JSONL akışındaki ilk hata mesajını (`type:"error"` veya
  `type:"turn.failed"`) yakalayıp reddetme mesajına taşıyor. Önceden yalnız stderr
  okunuyordu; Codex durma nedenini oraya yazmadığı için mesaj genel çıkış koduna
  indirgeniyor ve `classifyInterruption` hiçbir şey göremiyordu.
- `classifyInterruption` export edildi; "Codex ne dedi → proje nasıl park edilir"
  gidiş-dönüşü artık test edilebiliyor.
- Gerçek çökme hâlâ `failed`: akışta da stderr'de de bir şey yoksa çıkış kodu
  mesajı korunuyor, uydurma duraklama üretilmiyor.

**Ölçülen kanıt:** `Sipariş Defteri` (`99c447beb0d8`) koşusu 1.075.521 token
harcayıp Integration'ı tamamladıktan sonra Repair turunda Codex kullanım limitine
takıldı. Codex `"You've hit your usage limit… try again at 9:57 PM."` mesajını
olay akışından bildirdi, stderr boştu; proje `paused_usage` yerine `failed`
oldu. Düzeltmeyle aynı senaryo artık `usage` olarak sınıflanıyor.

**Ayrılmış test AVD'si ve cihaz seçimi (25 Eylül 2026)**

- `MVP_STUDIO_AVD` ile cihaz kapısının kullanacağı AVD sabitlenebiliyor. Pin
  yalnız başlatmayı değil **kullanımı** da sınırlıyor: adı doğrulanamayan bağlı
  bir cihaz benimsenmiyor, çünkü birinin kişisel emülatörünü wipe etmek geri
  alınamaz.
- `npm start` artık `--env-file-if-exists=.env` ile çalışıyor. Önceden `.env`
  hiç okunmuyordu; `.env.example` yalnız belgeydi.
- `studio_test_api36` AVD'si kuruldu: `google_apis` (Play Store'suz) API 36
  x86_64, 4096 MB RAM, 512 MB heap, 6 GB veri bölümü, GPU açık, 6 çekirdek.
  Ekran profili bilerek küçük bırakıldı ve `hw.keyboard=no` korundu — yazılım
  klavyesi gerçekçi davranış, ve yerleşim kusurlarını erken gösteriyor.
- `avdmanager`'ın varsayılanları düzeltildi: veri bölümü `<temp>` idi (kalıcı
  değil) ve `hw.gpu.enabled=no` idi (yazılım render).

**Ölçülen kanıt:** pin olmadan `selectEmulator` `Medium_Phone_API_36.0`'ı,
pinle `studio_test_api36`'yı seçiyor. Yeni AVD ilk açılışta 39 saniyede boot
etti; `ro.hardware=ranchu`, `emu avd name` → `studio_test_api36`, `/data`
5.8 GB bölümde 4.8 GB boş.

**Cihaz testi kırılganlığı adlandırılıyor (25 Eylül 2026)**

- `src/integration-test-diagnostics.mjs`: metin girildikten sonra odak
  bırakılmadan ve kaydırma yapılmadan yapılan **varlık** iddialarını bildiren
  deterministik tarama. Kapı değil; `DEVICE_REPORT.json` → `test_diagnostics`.
- Kapı FAIL verdiğinde bulgular `notes` alanına da yazılıyor, böylece device
  repair agent'ı doğru hipotezden başlıyor.
- Coordinator, builder, Test Strategy ve device repair prompt'larına aynı kural
  eklendi: iddiadan önce odağı bırak ya da hedefi görünür yap.

**Ölçülen kanıt:** aynı projenin iki koşusunda üç test aynı sınıftan düştü
(`active_filter`, `edit_subscription`, `search_subscription`), toplam dört device
repair turu. Tarama gerçek korpusta 9 dosyadan **2**'sini işaretliyor — biri tam
olarak iki tura mal olan `search_subscription_test.dart`. `edit_subscription`
işaretlenmiyor çünkü onarımda eklenen `tester.ensureVisible` riski kaldırıyor;
yani kural, onarım agent'larının gerçekte yaptığı düzeltmeyi tanıyor.

**Kabul kriteri sözleşmesi artık sessizce devre dışı kalamıyor (25 Eylül 2026)**

- `parseAcceptanceCriteria` `### AC1 — Başlık` biçimini de tanıyor. Kimlik
  **spec'ten** okunur, konumdan değil: reviewer aynı belgeyi okuduğu için
  yeniden numaralandırmak onun yanıtlarını sözleşmeye yabancı yapardı.
- `validateSpec`, "Kabul Kriterleri" bölümü dolu ama **ayrıştırılamıyorsa** engel
  bildiriyor; kimlik tekrarı da engel. Eskiden bölümün dolu olması yetiyordu.
- `ensureSpecContracts` her koşu başında eksik sözleşme dosyasını idempotent
  olarak onarıyor, böylece parser onları okuyamadan önce üretilmiş projeler de
  kazanıyor. **Mevcut dosya asla yeniden yazılmaz**: bir projenin inşa edildiği
  sözleşme, spec sonradan düzenlense bile onundur.
- `createProject` ile onarım aynı yazıcıyı kullanıyor; iki şekil birbirinden
  kayamaz.

**Ölçülen kanıt:** `AboneCep` spec'i on kriteri `###` başlıklarıyla yazmıştı;
eski ayrıştırıcı **0**, yenisi **10** kriter döndürüyor (`AC1..AC10`, spec'in
kendi kimlikleri) ve sekiz kritik akış. O projede `ACCEPTANCE_CRITERIA.json`
hiç yazılmadığı için `expectedCriteria` boştu ve `validateReviewerResult`
içindeki bütün kimlik denetimleri atlanıyordu — reviewer listede olmayan bir
`Q1` kimliği uydurup projeyi onunla blokladı ve bir review repair turuna mal
oldu. Sonraki koşuda dosya kendiliğinden onarılacak.

**`AboneCep` düzeltilmiş hatta karşı yeniden koşuldu (25 Eylül 2026)**

Dört Studio kusurunun da gerçek bir koşuda kapandığı doğrulama. Koşu
**20 dk 37 sn** sürdü, **449.228 faturalanabilir token** harcadı ve
`awaiting_user_review` ile bitti: kalite kapısı PASS, cihaz kapısı 8/8 PASS,
reviewer AC1–AC10 PASS, uygulama bütünlüğü `COMPLETE` (0 blocker, 0 uyarı).

- Preflight `min_sdk` PASS (spec 24 / toolchain 24) — yeni kapı ilk kez koştu.
- `flutter analyze --no-fatal-infos` ile kalite kapısı geçildi.
- Cihaz raporu dört kez commit edildi; `build.gradle.kts` yine kirliydi ve
  koşu **düşmedi**.
- `avd_reset` dört kapıda da `SKIPPED` (boş alan hep 3.8 GB üstü, eşik 3072 MB).
  `device_acquire` 81–136 ms: emülatör hiç düşmedi. Eski davranışta bu dört kapı
  4 × 48 sn soğuk açılış ≈ **3,2 dakika** boşa harcayacaktı.
- Koşu sonu `device_reclaim.completed`: `SKIPPED — 3992 MB boş`.
- Cihaz kapısı iki kez `search_subscription_test.dart` üzerinde FAIL verdi.
  Ürün mantığı doğruydu (`clearConstraints()` aramayı ve filtreleri sıfırlıyor);
  kusur render tarafındaydı: `enterText` sonrası Android klavyesi açık kalınca
  `SliverList.builder` viewport dışındaki satırı hiç inşa etmiyor ve
  `find.byKey` onu bulamıyor. İkinci device repair turu klavye odağını bırakarak
  düzeltti. **Bu bir test tasarımı kırılganlığı**, ürün kusuru değil — üç satırın
  kaydırmadan aynı anda ağaçta olmasını bekleyen test gerçek cihazda kırılgan.

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
