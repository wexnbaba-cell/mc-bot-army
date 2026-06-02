const EventEmitter = require('events');
const { createBot, destroyBot, getBotInfo } = require('./bot-factory');
const behaviors = require('./bot-behaviors');
const logger = require('./logger');

class BotManager extends EventEmitter {
  constructor() {
    super();
    this.bots = new Map();       // id → bot
    this.commander = null;
    this.serverConfig = null;
    this.botConfig = null;
    this.connected = false;
    this._nextId = 1;
    this._spawnQueue = [];
    this._spawning = false;
  }

  async connect(serverConfig, botConfig) {
    this.serverConfig = serverConfig;
    this.botConfig = botConfig;
    this.connected = true;
    logger.success('manager', `Sunucuya bağlanılıyor: ${serverConfig.host}:${serverConfig.port}`);
    this.emit('status');
  }

  disconnect() {
    this.connected = false;
    this._spawnQueue = [];
    this._spawning = false;

    // Commander'ı kapat
    if (this.commander) {
      destroyBot(this.commander);
      this.commander = null;
    }

    // Tüm botları kapat
    for (const [id, bot] of this.bots) {
      destroyBot(bot);
    }
    this.bots.clear();
    this._nextId = 1;
    logger.success('manager', 'Tüm botlar kapatıldı');
    this.emit('status');
  }

  spawnCommander(username, owner) {
    if (this.commander) {
      logger.warn('manager', 'Commander zaten aktif');
      return this.commander;
    }

    const bot = createBot('commander', this.serverConfig, {
      username: username || 'Commander',
      autoReconnect: true,
      reconnectDelay: 5000,
      onSpawn: (b) => this.emit('status'),
      onEnd: (b) => this.emit('status'),
      onDeath: (b) => this.emit('status'),
      onHealth: (b) => this.emit('status'),
      onReconnect: () => {
        this.commander = null;
        this.spawnCommander(username, owner);
      }
    });

    this.commander = bot;
    this.emit('status');
    return bot;
  }

  async spawnBots(count) {
    if (!this.connected || !this.serverConfig) {
      logger.error('manager', 'Önce sunucuya bağlan');
      return;
    }

    const delay = (this.botConfig && this.botConfig.connectDelay) || 1500;
    const nameTemplate = (this.botConfig && this.botConfig.nameTemplate) || 'Soldier_%d';

    logger.info('manager', `${count} bot oluşturuluyor (${delay}ms aralıkla)...`);

    for (let i = 0; i < count; i++) {
      const id = `bot_${this._nextId++}`;
      const username = nameTemplate.replace('%d', this._nextId - 1);

      // Gecikme ekle (sunucu rate limit koruması)
      if (i > 0) {
        await new Promise(r => setTimeout(r, delay));
      }

      if (!this.connected) break;

      const bot = createBot(id, this.serverConfig, {
        username,
        autoReconnect: this.botConfig ? this.botConfig.autoReconnect : true,
        reconnectDelay: this.botConfig ? this.botConfig.reconnectDelay : 5000,
        onSpawn: (b) => this.emit('status'),
        onEnd: (b, reason) => {
          this.emit('status');
        },
        onDeath: (b) => this.emit('status'),
        onHealth: (b) => this.emit('status'),
        onReconnect: (botId) => {
          // Yeniden bağlan
          this.bots.delete(botId);
          const newBot = createBot(botId, this.serverConfig, {
            username,
            autoReconnect: true,
            reconnectDelay: 5000,
            onSpawn: (b) => this.emit('status'),
            onEnd: (b) => this.emit('status'),
            onDeath: (b) => this.emit('status'),
            onHealth: (b) => this.emit('status')
          });
          this.bots.set(botId, newBot);
        }
      });

      this.bots.set(id, bot);
      this.emit('status');
    }

    logger.success('manager', `${count} bot oluşturuldu. Toplam: ${this.bots.size}`);
  }

  killBots(count) {
    const keys = Array.from(this.bots.keys()).slice(-count);
    for (const key of keys) {
      const bot = this.bots.get(key);
      if (bot) {
        destroyBot(bot);
        this.bots.delete(key);
      }
    }
    logger.info('manager', `${keys.length} bot kapatıldı. Kalan: ${this.bots.size}`);
    this.emit('status');
  }

  async setBotCount(target) {
    const current = this.bots.size;
    if (target > current) {
      await this.spawnBots(target - current);
    } else if (target < current) {
      this.killBots(current - target);
    }
  }

  broadcastBehavior(behaviorName, ...args) {
    let count = 0;
    for (const [id, bot] of this.bots) {
      if (bot._status === 'online' && behaviors[behaviorName]) {
        behaviors[behaviorName](bot, ...args);
        count++;
      }
    }
    logger.info('manager', `${count} bota '${behaviorName}' komutu gönderildi`);
    return count;
  }

  getOnlinePlayers() {
    // Commander'dan oyuncu listesi al
    if (this.commander && this.commander.players) {
      return Object.keys(this.commander.players);
    }
    // İlk online bottan al
    for (const [id, bot] of this.bots) {
      if (bot._status === 'online' && bot.players) {
        return Object.keys(bot.players);
      }
    }
    return [];
  }

  getStatus() {
    const botList = [];
    for (const [id, bot] of this.bots) {
      botList.push(getBotInfo(bot));
    }
    return {
      connected: this.connected,
      server: this.serverConfig,
      commander: this.commander ? getBotInfo(this.commander) : null,
      bots: botList,
      totalBots: this.bots.size,
      onlineBots: botList.filter(b => b.status === 'online').length
    };
  }
}

module.exports = BotManager;
