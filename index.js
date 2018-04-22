var Promise       = require('bluebird')
  , config        = require('config')
  , Loader        = require('./lib/loader')
  ;

Promise.config({
  longStackTraces: true
})

process.on('unhandledRejection', (err, p) => {
  console.error(new Date().toUTCString(), 'unhandledRejection', err.message);
  console.error(err.stack);

  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error(new Date().toUTCString(), 'uncaughtException', err.message);
  console.error(err.stack);

  process.exit(1);
});

function main() {
  let { secret, tailf, cmd, args } = config.get('sandbox');

  (new Loader(cmd, { secret, args }))
    .boot({ })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

if (require.main === module) {
  main();
}

module.exports = {
  main
};
