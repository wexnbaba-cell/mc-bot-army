const { GoalNear, GoalFollow, GoalXZ, GoalBlock } = require('mineflayer-pathfinder').goals;
const logger = require('./logger');

function getPlayerEntity(bot, name) {
  return bot.players[name] ? bot.players[name].entity : null;
}

const behaviors = {
  follow(bot, playerName) {
    const target = getPlayerEntity(bot, playerName);
    if (!target) {
      logger.warn(bot._botId, `Oyuncu bulunamadı: ${playerName}`);
      return false;
    }
    bot._currentBehavior = 'follow';
    bot._behaviorTarget = playerName;
    bot._followInterval = setInterval(() => {
      const entity = getPlayerEntity(bot, playerName);
      if (entity) {
        const goal = new GoalFollow(entity, 2);
        bot.pathfinder.setGoal(goal, true);
      }
    }, 1000);
    logger.info(bot._botId, `${playerName} takip ediliyor`);
    return true;
  },

  attack(bot, targetName) {
    const target = getPlayerEntity(bot, targetName);
    if (!target) {
      logger.warn(bot._botId, `Hedef bulunamadı: ${targetName}`);
      return false;
    }
    bot._currentBehavior = 'attack';
    bot._behaviorTarget = targetName;
    bot._attackInterval = setInterval(() => {
      const entity = getPlayerEntity(bot, targetName);
      if (entity) {
        const dist = bot.entity.position.distanceTo(entity.position);
        if (dist > 3.5) {
          bot.pathfinder.setGoal(new GoalFollow(entity, 2), true);
        } else {
          bot.pathfinder.stop();
          bot.attack(entity);
        }
      }
    }, 500);
    logger.info(bot._botId, `${targetName} hedefine saldırılıyor`);
    return true;
  },

  guard(bot, x, y, z) {
    bot._currentBehavior = 'guard';
    bot._behaviorTarget = `${x},${y},${z}`;
    const guardPos = { x, y, z };
    bot.pathfinder.setGoal(new GoalNear(x, y, z, 1));
    bot._guardInterval = setInterval(() => {
      const nearest = bot.nearestEntity(e => e.type === 'player' && e.username !== bot.username);
      if (nearest) {
        const dist = bot.entity.position.distanceTo(nearest.position);
        if (dist < 8) {
          bot.pathfinder.setGoal(new GoalFollow(nearest, 2), true);
          bot.attack(nearest);
        }
      }
      const myDist = bot.entity.position.distanceTo(guardPos);
      if (myDist > 10 && !nearest) {
        bot.pathfinder.setGoal(new GoalNear(x, y, z, 1));
      }
    }, 800);
    logger.info(bot._botId, `Koruma noktası: ${x}, ${y}, ${z}`);
    return true;
  },

  scatter(bot) {
    bot._currentBehavior = 'scatter';
    bot._behaviorTarget = null;
    const pos = bot.entity.position;
    const rx = pos.x + (Math.random() * 60 - 30);
    const rz = pos.z + (Math.random() * 60 - 30);
    bot.pathfinder.setGoal(new GoalXZ(rx, rz));
    logger.info(bot._botId, `Dağılıyor → ${Math.round(rx)}, ${Math.round(rz)}`);
    return true;
  },

  gather(bot, x, y, z) {
    bot._currentBehavior = 'gather';
    bot._behaviorTarget = `${x},${y},${z}`;
    bot.pathfinder.setGoal(new GoalNear(x, y, z, 2));
    logger.info(bot._botId, `Toplanma noktası: ${x}, ${y}, ${z}`);
    return true;
  },

  circle(bot, playerName, radius = 5) {
    const target = getPlayerEntity(bot, playerName);
    if (!target) {
      logger.warn(bot._botId, `Oyuncu bulunamadı: ${playerName}`);
      return false;
    }
    bot._currentBehavior = 'circle';
    bot._behaviorTarget = playerName;
    let angle = Math.random() * Math.PI * 2;
    bot._circleInterval = setInterval(() => {
      const entity = getPlayerEntity(bot, playerName);
      if (entity) {
        angle += 0.3;
        const gx = entity.position.x + Math.cos(angle) * radius;
        const gz = entity.position.z + Math.sin(angle) * radius;
        bot.pathfinder.setGoal(new GoalXZ(gx, gz), true);
      }
    }, 1500);
    logger.info(bot._botId, `${playerName} etrafında dönüyor (r=${radius})`);
    return true;
  },

  chat(bot, message) {
    bot.chat(message);
    logger.info(bot._botId, `Chat: ${message}`);
    return true;
  },

  jump(bot) {
    bot._currentBehavior = 'jump';
    bot._behaviorTarget = null;
    bot._jumpInterval = setInterval(() => {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 300);
    }, 600);
    logger.info(bot._botId, 'Zıplıyor');
    return true;
  },

  look(bot, playerName) {
    const target = getPlayerEntity(bot, playerName);
    if (!target) return false;
    bot._currentBehavior = 'look';
    bot._behaviorTarget = playerName;
    bot._lookInterval = setInterval(() => {
      const entity = getPlayerEntity(bot, playerName);
      if (entity) bot.lookAt(entity.position.offset(0, 1.6, 0));
    }, 500);
    logger.info(bot._botId, `${playerName} oyuncusuna bakıyor`);
    return true;
  },

  stop(bot) {
    bot.pathfinder.stop();
    bot.setControlState('jump', false);
    bot.setControlState('forward', false);
    bot.setControlState('sprint', false);
    clearInterval(bot._followInterval);
    clearInterval(bot._attackInterval);
    clearInterval(bot._guardInterval);
    clearInterval(bot._circleInterval);
    clearInterval(bot._jumpInterval);
    clearInterval(bot._lookInterval);
    bot._followInterval = null;
    bot._attackInterval = null;
    bot._guardInterval = null;
    bot._circleInterval = null;
    bot._jumpInterval = null;
    bot._lookInterval = null;
    bot._currentBehavior = 'idle';
    bot._behaviorTarget = null;
    logger.info(bot._botId, 'Durduruldu');
    return true;
  }
};

module.exports = behaviors;
