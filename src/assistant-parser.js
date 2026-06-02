const logger = require('./logger');

// Türkçe sayı kelimeleri
const numberWords = {
  'bir': 1, 'iki': 2, 'üç': 3, 'uc': 3, 'dört': 4, 'dort': 4,
  'beş': 5, 'bes': 5, 'altı': 6, 'alti': 6, 'yedi': 7, 'sekiz': 8,
  'dokuz': 9, 'on': 10, 'yirmi': 20, 'otuz': 30, 'kırk': 40, 'kirk': 40,
  'elli': 50, 'altmış': 60, 'altmis': 60, 'yetmiş': 70, 'yetmis': 70,
  'seksen': 80, 'doksan': 90, 'yüz': 100, 'yuz': 100
};

function extractNumber(text) {
  // Doğrudan rakam ara
  const numMatch = text.match(/(\d+)/);
  if (numMatch) return parseInt(numMatch[1]);
  // Türkçe sayı kelimesi ara
  const lower = text.toLowerCase();
  for (const [word, val] of Object.entries(numberWords)) {
    if (lower.includes(word)) return val;
  }
  return null;
}

function extractPlayerName(text, knownPlayers = []) {
  // Bilinen oyuncu isimlerini kontrol et
  for (const p of knownPlayers) {
    if (text.toLowerCase().includes(p.toLowerCase())) return p;
  }
  // Son kelimeyi oyuncu ismi olarak al (komuttan sonra)
  const words = text.trim().split(/\s+/);
  const lastWord = words[words.length - 1];
  // Komut kelimesi değilse oyuncu ismi olabilir
  const commandWords = [
    'et', 'edin', 'etsin', 'saldır', 'saldırın', 'saldirin',
    'takip', 'etrafında', 'bot', 'oluştur', 'olustur',
    'hepsi', 'hepsini', 'tüm', 'yap', 'dur', 'kes',
    'beni', 'bana', 'buraya'
  ];
  if (!commandWords.includes(lastWord.toLowerCase()) && lastWord.length > 1) {
    return lastWord;
  }
  return null;
}

function parse(text, context = {}) {
  const lower = text.toLowerCase().trim();
  const ownerName = context.owner || '';
  const knownPlayers = context.players || [];

  // === YARDIM ===
  if (/^(yardım|yardim|help|komutlar|\?)$/.test(lower)) {
    return { action: 'help' };
  }

  // === DURUM ===
  if (/^(durum|status|rapor|bilgi|liste)$/.test(lower)) {
    return { action: 'status' };
  }

  // === BOT OLUŞTUR ===
  if (/bot.*(oluştur|olustur|ekle|spawn|aç|ac|getir|sok)|(oluştur|olustur|ekle|spawn).*(bot)/i.test(lower)) {
    const count = extractNumber(lower) || 1;
    return { action: 'spawn', count };
  }
  if (/(\d+)\s*(tane|adet)?\s*(daha)?\s*(ekle|oluştur|olustur|sok)/i.test(lower)) {
    const count = extractNumber(lower) || 1;
    return { action: 'spawn', count };
  }

  // === BOT SAYISI AYARLA ===
  if (/sayı(sını|yı)?\s*(\d+)\s*(yap)?|(\d+)\s*(bot)?\s*(olsun)/i.test(lower)) {
    const count = extractNumber(lower) || 1;
    return { action: 'setCount', count };
  }

  // === TAKİP ET ===
  if (/(takip|izle|follow|peşin|pesin|ardın|ardin)/i.test(lower)) {
    let target = extractPlayerName(text, knownPlayers);
    if (/beni|bana/.test(lower)) target = ownerName;
    return { action: 'follow', target: target || ownerName };
  }

  // === SALDIR ===
  if (/(saldır|saldir|saldırın|saldirin|vur|öldür|oldur|attack|kill|ez)/i.test(lower)) {
    const target = extractPlayerName(text, knownPlayers);
    return { action: 'attack', target };
  }

  // === DAĞIL ===
  if (/^(dağıl|dagil|dağılın|dagilin|scatter|yayıl|yayil|kaç|kac)/i.test(lower)) {
    return { action: 'scatter' };
  }

  // === TOPLAN ===
  if (/(toplan|gather|buraya|gel|gelin|yanıma|yanima|birleş|birles)/i.test(lower)) {
    return { action: 'gather' };
  }

  // === ETRAFINDA DÖN ===
  if (/(etraf|çevir|cevir|dön|don|circle|sar|kuşat|kusat)/i.test(lower)) {
    let target = extractPlayerName(text, knownPlayers);
    if (/beni|benim/.test(lower)) target = ownerName;
    const radius = extractNumber(lower) || 5;
    return { action: 'circle', target: target || ownerName, radius };
  }

  // === DURDUR ===
  if (/^(dur|stop|durdur|durdurun|kes|bekle|bekleyin|idle)$/i.test(lower)) {
    return { action: 'stop' };
  }

  // === DISCONNECT ===
  if (/(hepsini|tümünü|tumunu|botları|botlari)?\s*(kes|kapat|disconnect|çık|cik|at|sil)/i.test(lower)) {
    if (/(hep|tüm|tum|bot|herkes)/.test(lower)) {
      return { action: 'disconnect' };
    }
  }
  if (/^(disconnect|kapat|çık|cik)$/i.test(lower)) {
    return { action: 'disconnect' };
  }

  // === ZIPLA ===
  if (/(zıpla|zipla|jump|hopla|atla)/i.test(lower)) {
    return { action: 'jump' };
  }

  // === CHAT ===
  if (/^(chat|yaz|söyle|soyle|mesaj)\s+(.+)/i.test(lower)) {
    const match = text.match(/^(?:chat|yaz|söyle|soyle|mesaj)\s+(.+)/i);
    return { action: 'chat', message: match ? match[1] : text };
  }

  // === BAK ===
  if (/(bak|look|dön.*bak)/i.test(lower)) {
    let target = extractPlayerName(text, knownPlayers);
    if (/bana/.test(lower)) target = ownerName;
    return { action: 'look', target: target || ownerName };
  }

  // === KORU ===
  if (/(koru|guard|savun|muhafız|muhafiz|bekçi|bekci)/i.test(lower)) {
    return { action: 'guard' };
  }

  // Tanınmayan komut
  return { action: 'unknown', raw: text };
}

const helpText = [
  '§6=== Bot Ordusu Komutları ===',
  '§a5 bot oluştur §7— 5 bot ekler',
  '§abot sayısını 20 yap §7— 20 bota ayarlar',
  '§ahepsi beni takip etsin §7— follow',
  '§asaldırın Steve §7— hedefe saldır',
  '§adağılın §7— scatter',
  '§aburaya gelin §7— gather',
  '§aetrafımda dönün §7— circle',
  '§adur §7— hepsini durdur',
  '§azıplasın §7— jump',
  '§ayaz merhaba §7— chat mesajı',
  '§ahepsini kes §7— disconnect',
  '§adurum §7— bot listesi',
  '§ayardım §7— bu menü'
];

module.exports = { parse, helpText, extractNumber, extractPlayerName };
