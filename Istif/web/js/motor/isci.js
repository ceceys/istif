/*
 * İstif: motorun Web Worker sarmalayıcısı.
 * Arayüz motoru yalnız bu dosya üzerinden çağırır:
 *
 *   const isci = new Worker("js/motor/isci.js", { type: "module" });
 *   isci.postMessage({ tur: "planla", id: 7, girdi });
 *
 * Elle düzenleme istekleri (hızlı, ilerleme göndermez):
 *   { tur: "denetle", id, girdi, araclar }
 *   { tur: "kalanBosluk", id, arac, yerlesimler, seciliIndeksler }
 *   { tur: "yaslan", id, arac, yerlesimler, indeksler, yon }
 *   { tur: "ustundekiler", id, yerlesimler, indeksler }
 *
 * Cevaplar:
 *   { tur: "ilerleme", id, yuzde }   (yalnız planla)
 *   { tur: "sonuc", id, sonuc }
 *   { tur: "hata", id, mesaj }
 */
import { planla, denetle, kalanBosluk, yaslan, ustundekiler, MotorHatasi } from "./motor.js";

const ISLER = {
  planla: (m, id) => planla(m.girdi, { ilerleme: (yuzde) => self.postMessage({ tur: "ilerleme", id, yuzde }) }),
  denetle: (m) => denetle(m.girdi, m.araclar),
  kalanBosluk: (m) => kalanBosluk(m.arac, m.yerlesimler, m.seciliIndeksler),
  yaslan: (m) => yaslan(m.arac, m.yerlesimler, m.indeksler, m.yon),
  ustundekiler: (m) => ustundekiler(m.yerlesimler, m.indeksler),
};

self.onmessage = (olay) => {
  const m = (olay && olay.data) || {};
  const id = m.id;
  const is = Object.prototype.hasOwnProperty.call(ISLER, m.tur) ? ISLER[m.tur] : null;
  if (!is) {
    self.postMessage({ tur: "hata", id, mesaj: "Bilinmeyen istek." });
    return;
  }
  try {
    const sonuc = is(m, id);
    self.postMessage({ tur: "sonuc", id, sonuc });
  } catch (hata) {
    const mesaj =
      hata instanceof MotorHatasi ? hata.message : "Hesaplama sırasında beklenmeyen bir hata oluştu.";
    if (!(hata instanceof MotorHatasi) && typeof console !== "undefined") console.error(hata);
    self.postMessage({ tur: "hata", id, mesaj });
  }
};
