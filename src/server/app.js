'use strict';
var async = require('async');
var colors = require('colors');
var express = require('express');
var glob = require('glob');
var merge = require('merge');
var passport = require('passport');
var path = require('path');
var sassMiddleware = require('node-sass-middleware');

//////////////////////////////////////////////////////////////////////////////////////////////////
// Load configuration
//////////////////////////////////////////////////////////////////////////////////////////////////

global.config = require('./../config');

//////////////////////////////////////////////////////////////////////////////////////////////////
// Express application
//////////////////////////////////////////////////////////////////////////////////////////////////

var app = express();
var api = {};
var webhooks = {};

app.use(require('x-frame-options')());
app.use(require('body-parser').json());
app.use(require('cookie-parser')());
app.use(require('cookie-session')({
    secret: config.server.security.sessionSecret,
    cookie: {
        maxAge: config.server.security.cookieMaxAge
    }
}));
app.use(passport.initialize());
app.use(passport.session());


// custom middleware
app.use('/api', require('./middleware/param'));
app.use('/api', require('./middleware/authenticated'));
app.use('/github/webhook', require('./middleware/param'));

// papertrail middleware
app.use('/api', require('./middleware/papertrail'));
app.use('/github/webhook', require('./middleware/papertrail'));

// karma middleware
app.use('/api', require('./middleware/stats'));

async.series([

    function(callback) {
        console.log('checking configs'.bold);

        if(config.server.http.protocol !== 'http' && config.server.http.protocol !== 'https') {
            throw new Error('PROTOCOL must be "http" or "https"');
        }

        if(config.server.github.protocol !== 'http' && config.server.github.protocol !== 'https') {
            throw new Error('GITHUB_PROTOCOL must be "http" or "https"');
        }

        console.log('✓ '.bold.green + 'configs seem ok');

        var url = require('./services/url');

        console.log('Host:        ' + url.baseUrl);
        console.log('GitHub:      ' + url.githubBase);
        console.log('GitHub-Api:  ' + url.githubApiBase);
        callback();
    },

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Bootstrap certificates
    //////////////////////////////////////////////////////////////////////////////////////////////

    function(callback) {

        console.log('bootstrap certificates'.bold);

        var https = require('https'),
            fs = require('fs');

        if(config.server.https.certs) {
            glob(config.server.https.certs, function(err, file) {
                if (file && file.length) {
                    file.forEach(function(f) {
                        try {
                            https.globalAgent.options.ca = https.globalAgent.options.ca || [];
                            https.globalAgent.options.ca.push(fs.readFileSync(path.relative(process.cwd(), f)));
                            console.log('✓ '.bold.green + path.relative(process.cwd(), f));
                        } catch (ex) {
                            console.log('✖ '.bold.red + path.relative(process.cwd(), f));
                            console.log(ex.stack);
                        }
                    });
                }
                callback();
            });
        } else {
            callback();
        }

    },

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Bootstrap static
    //////////////////////////////////////////////////////////////////////////////////////////////

    function(callback) {

        console.log('bootstrap static files'.bold);

        var publish = function(p, path) {
            app.use(sassMiddleware({
                src: p,
                dest: p,
                outputStyle: 'compressed',
                force: config.server.always_recompile_sass,
                autoprefix: true
            }));
            app.use(path, express.static(p));
        };

        config.server.static.app.forEach(function(p) {
            publish(p, '/');
        });
        config.server.static.lib.forEach(function(p) {
            publish(p, '/lib');
        });
        callback();
    },

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Apply migrations
    //////////////////////////////////////////////////////////////////////////////////////////////

    function(callback) {

        console.log('apply migrations'.bold);

        var mm = require('mongodb-migrations');

        var migrator = new mm.Migrator(config.server.mongodb, function(level, message) {
            console.log('ℹ︎ '.bold.yellow + message);
        });

        async.eachSeries(config.server.migrations, function(p, callback) {
            glob(p, function(err, file) {
                if (file && file.length) {
                    file.forEach(function(f) {
                        try {
                            migrator.add(require(f));
                            console.log('✓ '.bold.green + path.relative(process.cwd(), f));
                        } catch (ex) {
                            console.log('✖ '.bold.red + path.relative(process.cwd(), f));
                            console.log(ex.stack);
                        }
                    });

                    migrator.migrate(callback);
                }
            });
        }, callback);
    },

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Bootstrap mongoose
    //////////////////////////////////////////////////////////////////////////////////////////////

    function(callback) {

        console.log('bootstrap mongoose'.bold);

        var mongoose = require('mongoose');

        mongoose.connect(config.server.mongodb_uri, {
            server: {
                socketOptions: {
                    keepAlive: 1
                }
            }
        });

        global.models = {};

        async.eachSeries(config.server.documents, function(p, callback) {
            glob(p, function(err, file) {
                if (file && file.length) {
                    file.forEach(function(f) {
                        try {
                            global.models = merge(global.models, require(f));
                            console.log('✓ '.bold.green + path.relative(process.cwd(), f));
                        } catch (ex) {
                            console.log('✖ '.bold.red + path.relative(process.cwd(), f));
                            console.log(ex.stack);
                        }
                    });
                    callback();
                }
            });
        }, callback);
    },

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Bootstrap passport
    //////////////////////////////////////////////////////////////////////////////////////////////

    function(callback) {

        console.log('bootstrap passport'.bold);

        async.eachSeries(config.server.passport, function(p, callback) {
            glob(p, function(err, file) {
                if (file && file.length) {
                    file.forEach(function(f) {
                        console.log('✓ '.bold.green + path.relative(process.cwd(), f));
                        require(f);
                    });
                }
                callback();
            });
        }, callback);
    },

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Bootstrap controller
    //////////////////////////////////////////////////////////////////////////////////////////////

    function(callback) {

        console.log('bootstrap controller'.bold);

        async.eachSeries(config.server.controller, function(p, callback) {
            glob(p, function(err, file) {
                if (file && file.length) {
                    file.forEach(function(f) {
                        try {
                            app.use('/', require(f));
                            console.log('✓ '.bold.green + path.relative(process.cwd(), f));
                        } catch (ex) {
                            console.log('✖ '.bold.red + path.relative(process.cwd(), f));
                            console.log(ex.stack);
                        }
                    });
                }
                callback();
            });
        }, callback);
    },

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Bootstrap api
    //////////////////////////////////////////////////////////////////////////////////////////////

    function(callback) {

        console.log('bootstrap api'.bold);

        async.eachSeries(config.server.api, function(p, callback) {
            glob(p, function(err, file) {
                if (file && file.length) {
                    file.forEach(function(f) {
                        console.log('✓ '.bold.green + path.relative(process.cwd(), f));
                        api[path.basename(f, '.js')] = require(f);
                    });
                }
                callback();
            });
        }, callback);
    },

    //////////////////////////////////////////////////////////////////////////////////////////////
    // Bootstrap webhooks
    //////////////////////////////////////////////////////////////////////////////////////////////

    function(callback) {

        console.log('bootstrap webhooks'.bold);

        async.eachSeries(config.server.webhooks, function(p, callback) {
            glob(p, function(err, file) {
                if (file && file.length) {
                    file.forEach(function(f) {
                        console.log('✓ '.bold.green + path.relative(process.cwd(), f));
                        webhooks[path.basename(f, '.js')] = require(f);
                    });
                }
                callback();
            });
        }, callback);
    }

], function(err, res) {
    console.log('\n✓ '.bold.green + 'bootstrapped, '.bold + 'app listening on localhost:' + config.server.localport);
});

//////////////////////////////////////////////////////////////////////////////////////////////////
// Handle api calls
//////////////////////////////////////////////////////////////////////////////////////////////////

app.all('/api/:obj/:fun', function(req, res) {
    res.set('Content-Type', 'application/json');
    api[req.params.obj][req.params.fun](req, function(err, obj) {
        if(err) {
            return res.status(err.code > 0 ? err.code : 500).send(err.text || err);
        }

        var ret = obj ? JSON.stringify(obj) : null;

        res.send(ret);
    });
});

//////////////////////////////////////////////////////////////////////////////////////////////////
// Handle webhook calls
//////////////////////////////////////////////////////////////////////////////////////////////////

app.all('/github/webhook/:id', function(req, res) {
    var socket = require('./services/socket.js');
    var event = req.headers['x-github-event'];
    try {
        if(!webhooks[event]) {
            return res.status(400).send('Unsupported event');
        }
        webhooks[event](req, res);
    } catch(err) {
        res.status(500).send('Internal server error');
    }

    try {
        socket.emit(event, req.args);
    } catch(err) {}
});

module.exports = app;
