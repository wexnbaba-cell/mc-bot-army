const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const armorManager = require('mineflayer-armor-manager');
const logger = require('./logger');
const behaviors = require('./bot-behaviors');

function createBot(id, serverConfig, options = {}) {
  const config = {
    host: serverConfig.host,
    port: serverConfig.port || 25565,
    username: options.username || `Bot_${id}`,
    version: serverConfig.version || '1.21.1',
    auth: serverConfig.auth || 'offline',
    hideErrors: true
  };

  logger.info(id, `Bağlanıyor → ${config.host}:${config.port} [${config.username}]`);

  const bot = mineflayer.createBot(config);

  // Özel property'ler
  bot._botId = id;
  bot._config = config;
  bot._serverConfig = serverConfig;
  bot._options = options;
  bot._status = 'connecting';
  bot._currentBehavior = 'idle';
  bot._behaviorTarget = null;
  bot._reconnectTimer = null;
  bot._followInterval = null;
  bot._attackInterval = null;
  bot._guardInterval = null;
  bot._circleInterval = null;
  bot._jumpInterval = null;
  bot._lookInterval = null;
  bot._dead = false;

  bot.on('spawn', () => {
    bot._status = 'online';
    logger.success(id, `${config.username} sunucuya girdi`);

    // Pathfinder yükle
    try {
      bot.loadPlugin(pathfinder);
      const moves = new Movements(bot);
      moves.allowFreeMotion = true;
      moves.canDig = false;
      bot.pathfinder.setMovements(moves);
    } catch (e) {
      // Zaten yüklü olabilir
    }

    // Armor manager yükle
    try {
      bot.loadPlugin(armorManager);
    } catch (e) {}

    if (options.onSpawn) options.onSpawn(bot);
  });

  bot.on('health', () => {
    if (options.onHealth) options.onHealth(bot);
  });

  bot.on('death', () => {
    logger.warn(id, `${config.username} öldü`);
    behaviors.stop(bot);
    if (options.onDeath) options.onDeath(bot);
  });

  bot.on('kicked', (reason) => {
    bot._status = 'kicked';
    let msg = reason;
    try { msg = JSON.parse(reason).text || reason; } catch (e) {}
    logger.error(id, `${config.username} kicklendi: ${msg}`);
    if (options.onKicked) options.onKicked(bot, msg);
  });

  bot.on('error', (err) => {
    logger.error(id, `${config.username} hata: ${err.message}`);
    if (options.onError) options.onError(bot, err);
  });

  bot.on('end', (reason) => {
    bot._status = 'offline';
    behaviors.stop(bot);
    logger.warn(id, `${config.username} bağlantı kesildi: ${reason || 'bilinmiyor'}`);

    // Auto-reconnect
    if (!bot._dead && options.autoReconnect) {
      const delay = options.reconnectDelay || 5000;
      logger.info(id, `${delay / 1000}s sonra tekrar bağlanacak...`);
      bot._reconnectTimer = setTimeout(() => {
        if (!bot._dead) {
          if (options.onReconnect) options.onReconnect(id);
        }
      }, delay);
    }

    if (options.onEnd) options.onEnd(bot, reason);
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    if (options.onChat) options.onChat(bot, username, message);
  });

  bot.on('whisper', (username, message) => {
    if (username === bot.username) return;
    if (options.onWhisper) options.onWhisper(bot, username, message);
  });

  return bot;
}

function destroyBot(bot) {
  bot._dead = true;
  clearTimeout(bot._reconnectTimer);
  behaviors.stop(bot);
  try {
    bot.quit();
  } catch (e) {
    try { bot.end(); } catch (e2) {}
  }
  bot._status = 'offline';
  logger.info(bot._botId, `${bot._config.username} kapatıldı`);
}

function getBotInfo(bot) {
  return {
    id: bot._botId,
    username: bot._config.username,
    status: bot._status,
    behavior: bot._currentBehavior,
    behaviorTarget: bot._behaviorTarget,
    health: bot.health || 0,
    food: bot.food || 0,
    position: bot.entity ? {
      x: Math.round(bot.entity.position.x),
      y: Math.round(bot.entity.position.y),
      z: Math.round(bot.entity.position.z)
    } : null,
    ping: bot._client ? bot._client.latency : 0
  };
}

module.exports = { createBot, destroyBot, getBotInfo };
