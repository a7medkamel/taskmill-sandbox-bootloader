var _                     = require('lodash')
  , Promise               = require('bluebird')
  , config                = require('config')
  , response_time         = require('response-time')
  , http_proxy            = require('http-proxy')
  , http                  = require('http')
  , wait_on               = require('wait-on')
  , spawn                 = require('child_process').spawn
  , shell                 = require('shelljs')
  , on_finished           = require('on-finished')
  , morgan                = require('morgan')
  ;

const UNIX_SOCKET = '/tmp/sandbox.sock'
    , CWD         = config.get('sandbox.cwd')
    ;

class Loader {
  constructor(cmd, options = {}) {
    let { secret, args, log } = options;

    Object.assign(this, { secret, cmd, args, log });
  }

  exec(options = {}) {
    let code = Promise
                .try(() => {
                  let { blob, filename } = options;

                  if (blob) {
                    let blob_fs = createOutputStream(path.resolve('/src/', filename), { flags : 'w' });

                    blob_fs.end(blob);

                    return Promise.fromCallback((cb) => on_finished(blob_fs, cb));
                  }
                })
                .then(() => {
                  let { cmd, args } = this;

                  return this.fork({ cmd, args });
                });

      let listen = this.listen(options);

      return Promise.all([code, listen]);
  }

  fork(options = {}) {
    let { cmd, args = [] }  = options
      , { log }             = this
      ;

    let proc = shell.exec([cmd, ...args].join(' '), { silent : false, async : true, cwd : CWD });

    if (log) {
      log.pipe(proc, { end : false });
    }

    return proc;
  }

  wait_for_fork() {
    if (this.is_fork_ready) {
      return Promise.resolve(true);
    }

    return Promise
            .fromCallback((cb) => wait_on({
                // resources : [`socket:${UNIX_SOCKET}`]
                resources : [`tcp:1337`]
              , interval  : 10
              , window    : 0
            }, cb))
            .then(() => {
              this.is_fork_ready = true;

              return true;
            });
  }

  listen(options = {}) {
    return Promise
            .try(() => {
              let proxy = http_proxy.createProxyServer({
                  ws      : true
                , target  : { port : 1337 }
                // , target  : { socketPath : UNIX_SOCKET }
              });

              // todo [akamel] pull code into the container
              http
                .createServer((req, res) => {
                  let { __secret : http_secret }  = req.headers
                    , { secret }                  = this
                    ;

                  if (secret && secret != http_secret) {
                    return res.end();
                  }

                  Promise
                    .fromCallback((cb) => {
                      response_time({ header : 'x-response-time-bootloader' })(req, res, cb);
                    })
                    .tap(() => {
                      return Promise.fromCallback((cb) => morgan('dev')(req, res, cb));
                    })
                    .tap(() => {
                      return this.wait_for_fork();
                    })
                    .then(() => {
                      proxy.web(req, res, (err) => {
                        if (err) {
                          res.end();
                        }
                      });
                    });
                })
                .on('upgrade', (req, socket, head) => {
                  proxy.ws(req, socket, head);
                })
                .listen(8080);
            });
  }
}

module.exports = Loader;
