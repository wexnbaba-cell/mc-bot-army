const { parse, helpText } = require('./assistant-parser');
const logger = require('./logger');

class Commander {
  constructor(botManager, owner) {
    this.manager = botManager;
    this.owner = owner || '';
    this.bot = null;
  }

  start(commanderUsername) {
    this.bot = this.manager.spawnCommander(commanderUsername, this.owner);
    this._setupListeners();
    return this.bot;
  }

  _setupListeners() {
    const bot = this.bot;

    bot.on('whisper', (username, message) => {
      // Sadece owner'dan komut kabul et
      if (this.owner && username.toLowerCase() !== this.owner.toLowerCase()) {
        bot.whisper(username, '§cYetkin yok. Sadece sahip komut verebilir.');
        logger.warn('commander', `${username} yetkisiz komut denedi: ${message}`);
        return;
      }
      this._handleCommand(username, message);
    });

    // Normal chat'te de dinle (! prefix ile)
    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      if (!message.startsWith('!')) return;
      if (this.owner && username.toLowerCase() !== this.owner.toLowerCase()) return;
      this._handleCommand(username, message.slice(1).trim());
    });
  }

  async _handleCommand(username, text) {
    const players = this.manager.getOnlinePlayers();
    const context = { owner: username, players };
    const cmd = parse(text, context);

    logger.info('commander', `Komut: "${text}" → ${JSON.stringify(cmd)}`);

    switch (cmd.action) {
      case 'help':
        for (const line of helpText) {
          this.bot.whisper(username, line);
        }
        break;

      case 'status': {
        const status = this.manager.getStatus();
        this.bot.whisper(username, `§6=== Durum Raporu ===`);
        this.bot.whisper(username, `§aToplam: ${status.totalBots} | Online: ${status.onlineBots}`);
        for (const b of status.bots.slice(0, 15)) {
          const hp = b.health ? `§c${b.health}HP` : '§7-';
          const beh = b.behavior !== 'idle' ? `§d${b.behavior}` : '§7idle';
          const st = b.status === 'online' ? '§a●' : '§c○';
          this.bot.whisper(username, `${st} ${b.username} ${hp} ${beh}`);
        }
        if (status.bots.length > 15) {
          this.bot.whisper(username, `§7...ve ${status.bots.length - 15} bot daha`);
        }
        break;
      }

      case 'spawn':
        this.bot.whisper(username, `§a${cmd.count} bot oluşturuluyor...`);
        await this.manager.spawnBots(cmd.count);
        this.bot.whisper(username, `§a✓ ${cmd.count} bot eklendi. Toplam: ${this.manager.bots.size}`);
        break;

      case 'setCount':
        this.bot.whisper(username, `§aBot sayısı ${cmd.count} olarak ayarlanıyor...`);
        await this.manager.setBotCount(cmd.count);
        this.bot.whisper(username, `§a✓ Toplam bot: ${this.manager.bots.size}`);
        break;

      case 'follow': {
        const target = cmd.target || username;
        const count = this.manager.broadcastBehavior('follow', target);
        this.bot.whisper(username, `§a${count} bot ${target} takip ediyor`);
        break;
      }

      case 'attack': {
        if (!cmd.target) {
          this.bot.whisper(username, '§cHedef belirt: saldırın <isim>');
          break;
        }
        const count = this.manager.broadcastBehavior('attack', cmd.target);
        this.bot.whisper(username, `§c${count} bot ${cmd.target} hedefine saldırıyor`);
        break;
      }

      case 'scatter': {
        const count = this.manager.broadcastBehavior('scatter');
        this.bot.whisper(username, `§a${count} bot dağılıyor`);
        break;
      }

      case 'gather': {
        // Sahibin pozisyonuna toplan
        let pos = null;
        if (this.bot.players[username] && this.bot.players[username].entity) {
          const e = this.bot.players[username].entity;
          pos = { x: e.position.x, y: e.position.y, z: e.position.z };
        }
        if (pos) {
          const count = this.manager.broadcastBehavior('gather', pos.x, pos.y, pos.z);
          this.bot.whisper(username, `§a${count} bot toplanıyor`);
        } else {
          this.bot.whisper(username, '§cPozisyonun tespit edilemedi, yakınımda ol');
        }
        break;
      }

      case 'circle': {
        const target = cmd.target || username;
        const count = this.manager.broadcastBehavior('circle', target, cmd.radius || 5);
        this.bot.whisper(username, `§a${count} bot ${target} etrafında dönüyor`);
        break;
      }

      case 'stop': {
        const count = this.manager.broadcastBehavior('stop');
        this.bot.whisper(username, `§a${count} bot durduruldu`);
        break;
      }

      case 'disconnect':
        this.bot.whisper(username, `§c${this.manager.bots.size} bot kapatılıyor...`);
        this.manager.killBots(this.manager.bots.size);
        this.bot.whisper(username, '§a✓ Tüm botlar kapatıldı');
        break;

      case 'jump': {
        const count = this.manager.broadcastBehavior('jump');
        this.bot.whisper(username, `§a${count} bot zıplıyor`);
        break;
      }

      case 'chat':
        this.manager.broadcastBehavior('chat', cmd.message);
        this.bot.whisper(username, `§aMesaj gönderildi: ${cmd.message}`);
        break;

      case 'look': {
        const target = cmd.target || username;
        const count = this.manager.broadcastBehavior('look', target);
        this.bot.whisper(username, `§a${count} bot ${target} oyuncusuna bakıyor`);
        break;
      }

      case 'guard': {
        let pos = null;
        if (this.bot.players[username] && this.bot.players[username].entity) {
          const e = this.bot.players[username].entity;
          pos = { x: e.position.x, y: e.position.y, z: e.position.z };
        }
        if (pos) {
          const count = this.manager.broadcastBehavior('guard', pos.x, pos.y, pos.z);
          this.bot.whisper(username, `§a${count} bot bu noktayı koruyor`);
        } else {
          this.bot.whisper(username, '§cPozisyonun tespit edilemedi');
        }
        break;
      }

      case 'unknown':
        this.bot.whisper(username, `§cAnlaşılamadı: "${cmd.raw}". §7Yardım için: yardım`);
        break;
    }
  }
}

module.exports = Commander;
