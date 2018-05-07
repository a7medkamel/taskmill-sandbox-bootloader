var Promise       = require('bluebird')
  , config        = require('config')
  , { Log }       = require('tailf.io-sdk')
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
  let { secret, cmd, args, tailf, blob, blob_type, filename } = config.get('sandbox');

  Promise
    .try(() => {
      if (tailf) {
        return Log.open(tailf);
      }
    })
    .then((log) => {
      return (new Loader(cmd, { secret, args, log })).exec({ blob, blob_type, filename });
    })
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
