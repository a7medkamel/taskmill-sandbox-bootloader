var _                     = require('lodash')
  , Promise               = require('bluebird')
  , config                = require('config')
  , response_time         = require('response-time')
  , http_proxy            = require('http-proxy')
  , http                  = require('http')
  , wait_on               = require('wait-on')
  , spawn                 = require('child_process').spawn
  , { Log }               = require('tailf.io-sdk')
  , shell                 = require('shelljs')
  , on_finished           = require('on-finished')
  , morgan                = require('morgan')
  ;

const UNIX_SOCKET = '/tmp/sandbox.sock'
    , CWD         = config.get('sandbox.cwd')
    ;

class Loader {
  constructor(cmd, options = {}) {
    let { secret, args } = options;

    Object.assign(this, { cmd, secret, args });
  }

  boot(options = {}) {
    let { cmd, args } = this;

    return Promise
            .try(() => {
              let { blob, filename } = options;

              if (blob) {
                let blob_fs = createOutputStream(filename, { flags : 'w' });

                blob_fs.end(blob);

                return Promise.fromCallback((cb) => on_finished(blob_fs, cb));
              }
            })
            .then(() => {
              let f = this.fork({ cmd, args })
              // todo [akamel] we don't need to wait till here to .listen()
                , l = this.listen(options)
                ;

              return Promise.all([f, l]);
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
                      return Promise.fromCallback((cb) => wait_on({
                          // resources : [`socket:${UNIX_SOCKET}`]
                          resources : [`tcp:1337`]
                        , interval  : 10
                        , window    : 0
                      }, cb));
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

  fork(options = {}) {
    let { tailf, cmd, args = [] } = options;

    return Promise
            .try(() => {
              if (tailf) {
                return Log.open(tailf);
              }
            })
            .then((log) => {
              let a = [cmd, ...args];

              let proc = shell.exec(a.join(' '), { silent : false, async : true, cwd : CWD });

              if (log) {
                log.pipe(proc, { end : false });
              }

              return proc;
            });
  }
}

module.exports = Loader;
