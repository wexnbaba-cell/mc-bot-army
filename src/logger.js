const EventEmitter = require('events');

class Logger extends EventEmitter {
  constructor() {
    super();
    this.logs = [];
    this.maxLogs = 500;
  }

  _push(level, source, message) {
    const entry = {
      timestamp: Date.now(),
      time: new Date().toLocaleTimeString('tr-TR'),
      level,
      source,
      message
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    this.emit('log', entry);
    const prefix = `[${entry.time}] [${level.toUpperCase()}] [${source}]`;
    if (level === 'error') console.error(`${prefix} ${message}`);
    else console.log(`${prefix} ${message}`);
  }

  info(source, msg) { this._push('info', source, msg); }
  warn(source, msg) { this._push('warn', source, msg); }
  error(source, msg) { this._push('error', source, msg); }
  success(source, msg) { this._push('success', source, msg); }

  getRecent(count = 50) {
    return this.logs.slice(-count);
  }
}

module.exports = new Logger();
