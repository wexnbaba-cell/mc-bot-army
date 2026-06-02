const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const BotManager = require('./src/bot-manager');
const Commander = require('./src/commander');
const { parse, helpText } = require('./src/assistant-parser');
const logger = require('./src/logger');

// Config yükle
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
} catch (e) {
  config = {
    server: { host: 'localhost', port: 25565, version: '1.21.1' },
    auth: 'offline',
    owner: '',
    commander: { username: 'Commander', enabled: true },
    bots: { nameTemplate: 'Soldier_%d', maxCount: 100, connectDelay: 1500, autoReconnect: true, reconnectDelay: 5000 },
    web: { port: 3000 }
  };
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const manager = new BotManager();
let commander = null;

// === SOCKET.IO ===
io.on('connection', (socket) => {
  logger.info('web', 'Dashboard bağlandı');

  // İlk durum gönder
  socket.emit('status', manager.getStatus());
  socket.emit('config', config);
  socket.emit('logs', logger.getRecent(100));

  // Bağlan
  socket.on('connect_server', async (data) => {
    try {
      const serverConfig = {
        host: data.host || config.server.host,
        port: parseInt(data.port) || config.server.port,
        version: data.version || config.server.version,
        auth: data.auth || config.auth
      };
      const botConfig = {
        nameTemplate: data.nameTemplate || config.bots.nameTemplate,
        maxCount: config.bots.maxCount,
        connectDelay: parseInt(data.connectDelay) || config.bots.connectDelay,
        autoReconnect: config.bots.autoReconnect,
        reconnectDelay: config.bots.reconnectDelay
      };

      await manager.connect(serverConfig, botConfig);

      // Commander başlat
      if (config.commander.enabled) {
        const owner = data.owner || config.owner || '';
        commander = new Commander(manager, owner);
        commander.start(data.commanderName || config.commander.username);
        // Owner'ı config'e kaydet
        config.owner = owner;
      }

      // Botları oluştur
      const count = parseInt(data.botCount) || 0;
      if (count > 0) {
        await manager.spawnBots(count);
      }

      io.emit('status', manager.getStatus());
    } catch (err) {
      logger.error('web', `Bağlantı hatası: ${err.message}`);
    }
  });

  // Bağlantıyı kes
  socket.on('disconnect_server', () => {
    manager.disconnect();
    commander = null;
    io.emit('status', manager.getStatus());
  });

  // Bot ekle
  socket.on('spawn_bots', async (data) => {
    const count = parseInt(data.count) || 1;
    await manager.spawnBots(count);
    io.emit('status', manager.getStatus());
  });

  // Bot sil
  socket.on('kill_bots', (data) => {
    const count = parseInt(data.count) || 1;
    manager.killBots(count);
    io.emit('status', manager.getStatus());
  });

  // Bot sayısı ayarla
  socket.on('set_bot_count', async (data) => {
    const count = parseInt(data.count) || 0;
    await manager.setBotCount(count);
    io.emit('status', manager.getStatus());
  });

  // Komut gönder
  socket.on('command', (data) => {
    const { behavior, args } = data;
    if (behavior && typeof manager.broadcastBehavior === 'function') {
      const argsArr = Array.isArray(args) ? args : [];
      manager.broadcastBehavior(behavior, ...argsArr);
    }
    io.emit('status', manager.getStatus());
  });

  // Asistan mesajı (web üzerinden)
  socket.on('assistant_message', async (data) => {
    const text = data.message || '';
    const players = manager.getOnlinePlayers();
    const context = { owner: config.owner, players };
    const cmd = parse(text, context);

    logger.info('asistan', `Web komut: "${text}" → ${cmd.action}`);

    let response = '';
    switch (cmd.action) {
      case 'help':
        response = helpText.map(l => l.replace(/§[0-9a-f]/g, '')).join('\n');
        break;
      case 'status': {
        const s = manager.getStatus();
        response = `Toplam: ${s.totalBots} | Online: ${s.onlineBots}`;
        break;
      }
      case 'spawn':
        await manager.spawnBots(cmd.count);
        response = `✓ ${cmd.count} bot eklendi. Toplam: ${manager.bots.size}`;
        break;
      case 'setCount':
        await manager.setBotCount(cmd.count);
        response = `✓ Bot sayısı: ${manager.bots.size}`;
        break;
      case 'follow':
        manager.broadcastBehavior('follow', cmd.target || config.owner);
        response = `Botlar ${cmd.target || config.owner} takip ediyor`;
        break;
      case 'attack':
        if (!cmd.target) { response = 'Hedef belirt: saldırın <isim>'; break; }
        manager.broadcastBehavior('attack', cmd.target);
        response = `Botlar ${cmd.target} hedefine saldırıyor`;
        break;
      case 'scatter':
        manager.broadcastBehavior('scatter');
        response = 'Botlar dağılıyor';
        break;
      case 'gather': {
        // Commander pozisyonunu kullan
        if (manager.commander && manager.commander.entity) {
          const p = manager.commander.entity.position;
          manager.broadcastBehavior('gather', p.x, p.y, p.z);
          response = 'Botlar toplanıyor';
        } else {
          response = 'Commander pozisyonu tespit edilemedi';
        }
        break;
      }
      case 'circle':
        manager.broadcastBehavior('circle', cmd.target || config.owner, cmd.radius || 5);
        response = `Botlar ${cmd.target || config.owner} etrafında dönüyor`;
        break;
      case 'stop':
        manager.broadcastBehavior('stop');
        response = 'Tüm botlar durduruldu';
        break;
      case 'disconnect':
        manager.killBots(manager.bots.size);
        response = 'Tüm botlar kapatıldı';
        break;
      case 'jump':
        manager.broadcastBehavior('jump');
        response = 'Botlar zıplıyor';
        break;
      case 'chat':
        manager.broadcastBehavior('chat', cmd.message);
        response = `Mesaj gönderildi: ${cmd.message}`;
        break;
      case 'look':
        manager.broadcastBehavior('look', cmd.target || config.owner);
        response = `Botlar ${cmd.target || config.owner} oyuncusuna bakıyor`;
        break;
      case 'guard':
        if (manager.commander && manager.commander.entity) {
          const p = manager.commander.entity.position;
          manager.broadcastBehavior('guard', p.x, p.y, p.z);
          response = 'Botlar bu noktayı koruyor';
        } else {
          response = 'Pozisyon tespit edilemedi';
        }
        break;
      default:
        response = `Anlaşılamadı: "${text}". "yardım" yaz.`;
    }

    socket.emit('assistant_response', { message: text, response });
    io.emit('status', manager.getStatus());
  });
});

// Status broadcast — her 2 saniyede
manager.on('status', () => {
  io.emit('status', manager.getStatus());
});

// Log broadcast
logger.on('log', (entry) => {
  io.emit('log', entry);
});

// === START ===
const PORT = process.env.PORT || config.web.port || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║     MC BOT ARMY — Kontrol Paneli         ║');
  console.log(`  ║     http://localhost:${PORT}                 ║`);
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  logger.success('server', `Web sunucusu başlatıldı: http://localhost:${PORT}`);
});
