var _                     = require('lodash')
  , Promise               = require('bluebird')
  , config                = require('config')
  , response_time         = require('response-time')
  , http_proxy            = require('http-proxy')
  , http                  = require('http')
  , wait_on               = require('wait-on')
  , spawn                 = require('child_process').spawn
  , { Log }               = require('tailf.io-sdk')
  // , tar_fs                = require('tar-fs')
  // , createOutputStream    = require('create-output-stream')
  // , zlib                  = require('zlib')
  // , codedb_sdk            = require('taskmill-core-codedb-sdk')
  , on_finished           = require('on-finished')
  , morgan                = require('morgan')
  ;

const UNIX_SOCKET = '/tmp/sandbox.sock'
    , SRC_DIRNAME = '/src'
    ;

class Loader {
  constructor(cmd, options = {}) {
    let { secret, args } = options;

    Object.assign(this, { cmd, secret, args });
  }

  boot(options = {}) {
    // todo [akamel] tailf should come from the headers per call no?
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

                  if (secret != http_secret) {
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
                          resources : [`socket:${UNIX_SOCKET}`]
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

  // fetch_code(remote, sha, options = {}) {
  //   let { token, bearer } = options;
  //
  //   return Promise
  //           .fromCallback((cb) => {
  //             codedb_sdk
  //               .archive(remote, { branch : sha, token, bearer, make : true })
  //               .on('response', (response) => {
  //                 if (response.statusCode != 200) {
  //                   return cb(new Error(`codedb archive error ${response.statusCode}`));
  //                 }
  //
  //                 cb(undefined, response);
  //               })
  //               .on('error', (err) => cb(err))
  //           })
  //           .then((response) => {
  //             let dir_fs = response.pipe(zlib.createGunzip()).pipe(tar_fs.extract(SRC_DIRNAME));
  //
  //             return Promise.fromCallback((cb) => on_finished(dir_fs, cb));
  //           })
  // }

  fork(options = {}) {
    let { tailf, cmd, args = [] } = options;

    return Promise
            .try(() => {
              if (tailf) {
                return Log.open(tailf);
              }
            })
            .then((log) => {
              let a = [
                  cmd
                // , `--NODE_CONFIG=${JSON.stringify({ remote, sha, base_url })}`
                , ...args
              ];

              let proc = spawn('node', a)
                          .on('exit', () => {
                            process.exit(1);
                          });

              if (log) {
                proc.stdout.pipe(log.stdout());
                proc.stderr.pipe(log.stderr());
              }
              //
              // proc.stdout.pipe(process.stdout);
              // proc.stderr.pipe(process.stderr);

              return proc;
            });
  }
}

module.exports = Loader;
