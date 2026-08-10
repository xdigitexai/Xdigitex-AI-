module.exports = {
  apps: [{
    name: 'xdigitex-api',
    script: '/opt/xdigitex/start.sh',
    interpreter: '/bin/bash',
    cwd: '/opt/xdigitex/api',
    max_memory_restart: '600M',
    restart_delay: 3000,
    log_file: '/var/log/xdigitex-api.log',
    error_file: '/var/log/xdigitex-api-error.log',
    time: true
  }]
}
