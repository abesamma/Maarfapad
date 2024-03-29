var express = require('express');
var path = require('path');
var request = require('request');
var shortid = require('shortid');
var logger = require('morgan');
var compression = require('compression');
var session = require('express-session');
var CouchConnect = require('connect-couchdb')(session);
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var auth = require('passport-local-authenticate');
var flash = require('connect-flash');
var nodemailer = require("nodemailer");
var helmet = require('helmet');
var expressSanitized = require('express-sanitize-escape');
var config;
if (process.env.NODE_ENV === 'development') {
  config = require('./config/dev.secret.json');
} else config = require('./config/secret.json');

// Wiki editions @github.com
var EMPTY_URL = require('./config/editions').emptyUrl;

// require routes
var index = require('./routes/index');
var signup = require('./routes/signup');
var login = require('./routes/login');
var account = require('./routes/account');
var recovery = require('./routes/recovery');
var about = require('./routes/about');
var changeFeed = require('./routes/changefeed');
var offline = require('./routes/offline');
var explore = require('./routes/explore');

// prepare database drive
var nano = require('nano')(config.database);
var db = nano.db.use('maarfapad');

// For logging errors
function logError (err) {
  console.error('Error', err);
};

var app = express();
app.use(helmet());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use('/edition_index.json', express.static(__dirname + '/public/edition_index.json',{setHeaders: function (res, path, stat) {
  res.set('Content-Type', 'application/json');
}}));
app.use('/manifest.json', express.static(__dirname + '/public/manifest.json',{setHeaders: function (res, path, stat) {
  res.set('Content-Type', 'application/json');
}}));
app.use('/wiki/favicon.ico', express.static(__dirname + '/public' + '/favicon.ico'));
app.use('/favicon.ico', express.static(__dirname + '/public' + '/favicon.ico'));
app.use('/sw.js', express.static(__dirname + '/public' + '/javascripts/sw.js',{setHeaders: function (res, path, stat) {
  res.set('Content-Type', 'application/javascript');
}}));
app.use('/images', express.static(__dirname + '/public' + '/images'));
app.use('/javascript', express.static(__dirname + '/public' + '/javascripts'));
app.use('/stylesheets', express.static(__dirname + '/public' + '/stylesheets'));

if (process.env.NODE_ENV === 'development') {
  app.use(logger('dev'));
} else {
  app.use(logger('combined',{
    skip: function (req,res) { return res.statusCode < 400 }
  }));
}

app.use(compression());
app.use(bodyParser.raw({ type: 'text/html', limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(expressSanitized.middleware());
expressSanitized.sanitizeParams(app, ['name', 'rev', 'wikiType', 'wikiName']);
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new CouchConnect({
    name: config.dbname,
    username:  config.username,
    password: config.pass,
    host: config.host
  }),
  name: 'm|pad',
  secret: config.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 4.32e+8
  }
}));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

function paramCheck (param = '') {
  // remove url chars that could mess with the viewing of the named wiki
  var regex = new RegExp(/[/.&?=]/g);
  return param.replace(regex,'');
};

// configure local strategy for passport authentication
passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password',
  passReqToCallback: true
},
  function (req, username, password, done) {
    db.view('user', 'verify', {
      'key': username
    }, function (err, body) {
      if (err) {
        return done(err, null);
      } else {
        if (body.rows.length === 0) {
          return done(null, false, req.flash('login-info', 'No account is associated with provided email'));
        }
        body.rows.forEach(function (user) {
          auth.verify(password, user.value, function (err, verified) {
            if (err) {
              logError(err);
              return done(err,null);
            }
            if (verified === false) {
              return done(null, false, req.flash('login-info', 'Incorrect password'));
            }
            if (verified === true) {
              return done(null, user);
            }
          });
        });
      }
    });
  }
));

// serialise to session
passport.serializeUser(function (user, done) {
  done(null, user.key);
});
// deserialise user
passport.deserializeUser(function (id, done) {
  db.view('user', 'verify', { 'key': id }, function (err, body) {
    if (err) {
      logError(err);
      done(err,null);
      return;
    }
    body.rows.forEach(function (user) {
      done(err, user);
    });
  });
});

/**
 * Node mailer settings
 * 
 */
let smtpTransport = nodemailer.createTransport({
  host: "mail.gandi.net", // hostname
  secureConnection: true, // use SSL
  port: 465, // port for secure SMTP
  auth: {
    user: 'info@maarfapad.xyz',
    pass: config.mailerPass
  }
});

/**
 * Routes for the express app go here
 */
app.use('/', index);
app.use('/signup', signup);
app.use('/login', login);
app.use('/account', account);
app.use('/recovery', recovery);
app.use('/about', about);
app.use('/offline', offline);
app.use('/changefeed',changeFeed);
app.use('/explore', explore);

// create a user account then redirect to index page
app.post('/create_user', function (req, res, next) {
  nano.uuids().then(function (result) {
    var id = result.uuids[0];
    // check for account duplicate
    db.view('user', 'verify', {
      'key': req.body.email
    }, function (err, body) {
      if (!err) {
        if (body.rows.length > 0) {
          req.flash('signup-info', 'An account with that email already exists.');
          res.redirect('/signup');
        } else {
          const mailOptions = {
            from: 'Maarfapad project <info@maarfapad.xyz>',
            to: req.body.email,
            subject: 'Maarfapad sign up',
            html: `<p>You are all set!</p><p>Get the latest updates via <a href='https://abesamma.github.io/maarfapad-blog/index.html'>Maarfapad's blog.</a></p> <a href='http://maarfapad.com'>Click here</a> to login</p>`
          };
          // hash and salt pass
          auth.hash(req.body.password, function (err, hashed) {
            req.body.password = hashed; // replace plain pass with hashed pass
            request(EMPTY_URL, function (error, resp, data) {
              if (resp.statusMessage === 'OK') {
                if (!error) {
                  db.multipart.insert(
                    req.body,
                    [{ name: 'home', data: data, content_type: 'text/html' }],
                    id,
                    function (err, body) {
                      if (!err) {
                        // email to confirm successful action
                        smtpTransport.sendMail(mailOptions, function (err, response) {
                          if (!err) {
                            // redirect to login page if successful
                            req.flash('login-info', 'Account created successfuly! Please login.');
                            res.redirect('/login');
                          } else {
                            logError(err);
                            req.flash('signup-info', 'Something went wrong with the email address you supplied. Please try signing up again with another email address.');
                            res.redirect('/signup');
                          }
                        });
                      }
                    });
                } else {
                  logError(error);
                  req.flash('signup-info', 'An error occured. Please try again later');
                  res.redirect('/signup');
                }
              } else {
                logError('Failed to retrieve template Wiki from CDN');
                req.flash('signup-info', 'Failed to create account. Try again later');
                res.redirect('/signup');
              }
            });
          });
        }
      }
    });
  }).catch(err => {
    logError(err);
    req.flash('signup-info', 'An error occured. Please try again later');
    res.redirect('/signup');
  })
  
});

// change email
app.post('/change_email', function (req, res) {
  if (req.isAuthenticated()) {
    var id = req.user.id
    var data = req.body.newemail;
    db.view('user', 'verify', { 'key': data }, function (err, body) {
      if (err) {
        logError(err);
        return res.send(`<p id='flash'>Something went wrong. Please try again later</p>`);
      }
      if (body.rows.length > 0) {
        return res.send(`<p id='flash'>That email is already in use by another account</p><br><a href='/account'>Go back</a>`);
      } else {
        db.atomic('user', 'updateEmail', id, { value: data }, function (err, body) {
          if (!err) {
            req.session.destroy(function (err) {
              return res.redirect('/login');
            });
          } else {
            logError(err);
            return res.send(`<p id='flash'>Something went wrong. Please try again later</p>`);
          }
        });
      }
    });
  } else res.sendStatus(401);
});

// change password
app.post('/change_password', function (req, res) {
  if (req.isAuthenticated()) {
    var id = req.user.id
    var verify = req.body.verifypass
    var _new = req.body.newpass
    if (_new === verify) {
      auth.hash(_new, function (err, hashed) {
        db.atomic('user', 'updatePass', id, { value: hashed }, function (err, body) {
          if (!err) {
            res.send(`<p>Password change successful</p><br><a href='/'>Go back home</a>`);
          } else {
            logError(err);
            res.send(`<p id='flash'>Something went wrong. Please try again later</p><br><a href='/'>Go back home</a>`);
          }
        });
      });
    } else {
      res.send(`<p id='flash'>Passwords do not match</p><br><a href='/account'>Try again</a>`);
    }
  } else res.sendStatus(401);
});

// reset password
app.post('/reset', function (req, res) {
  var resetPass = shortid.generate();
  db.view('user', 'verify', {
    'key': req.body.email
  }, function (err, body) {
    if (!err) {
      if (body.rows.length === 1) {
        var userID = body.rows[0].id;
        // prepare email to send
        var mail = {
          from: 'info@maarfapad.xyz',
          to: req.body.email,
          subject: 'Maarfapad password reset',
          html: `<p>Here's your reset password: ${resetPass}</p><p><a href='http://maarfapad.com'>Click here</a> to login</p>`
        };
        auth.hash(resetPass, function (err, hashed) {
          db.atomic('user', 'updatePass', userID, { value: hashed }, function (err, body) {
            if (!err) {
              // send recovery email
              smtpTransport.sendMail(mail, function (err, response) {
                if (!err) {
                  req.flash('recovery-info','A recovery email has been sent. Check your Inbox or Spam folder');
                  res.redirect('/recovery');
                } else {
                  logError(err);
                  req.flash('recovery-info','Something went wrong. Email not sent. Please try again later');
                  res.redirect('/recovery');
                }
              });
            } else {
              logError(err);
              req.flash('recovery-info','Something went wrong. Please try again later');
              res.redirect('/recovery');
            }
          });
        });
      } else {
        req.flash('recovery-info','Sorry, there is no account associated with that email address');
        res.redirect('/recovery');
      }
    }
  });
});

// user login to home.html
app.post('/login', passport.authenticate('local', {
  failureRedirect: '/login',
  failureFlash: true
}), function (req, res) {
  if (req.cookies['mpad-offline'] === 'true') {
    return res.clearCookie('mpad-offline', { path: '/' }).redirect('/wiki/home');
  }
  return res.redirect('/wiki/home');
});

// account deletion
app.get('/delete_account', function (req, res) {
  if (req.isAuthenticated()) {
    db.show('user', 'getUser', req.user.id, function (err, body) {
      if (!err) {
        var docRev = body._rev;
        db.destroy(req.user.id, docRev, function (err, body) {
          if (!err) {
            req.session.destroy(function (err) {
              res.redirect('/login');
            });
          } else {
            logError(err);
            res.send(500, 'Server error. Please try again later.');
          }
        });
      } else {
        logError(err);
        res.send(500, 'Server error. Please try again later.');
      }
    });
  } else res.sendStatus(401);
});

/*
 *Below are the api routes for maarfapad a la tiddlywiki to use
 */
app.get('/wiki/:name', function (req, res) {
  var name = req.params.name
  if (req.cookies['mpad-offline'] === 'true') return res.redirect('/login');
  if (req.isAuthenticated()) {
    var userid = req.user.id
    db.attachment.get(userid, name, function (err, body) {
      if (!err) {
        res.header('Content-Type', 'text/html');
        res.send(body);
      } else {
        logError(err);
        res.redirect('/offline');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.put('/wiki/:name/:rev', function (req, res) {
  var name = req.params.name;
  var revision = req.params.rev;
  if (req.isAuthenticated()) {
    var userid = req.user.id
    db.attachment.insert(userid, name, req.body, 'text/html', { rev: revision }, function (err, body) {
      if (!err) {
        res.sendStatus(200);
      } else {
        logError(err);
        res.sendStatus(500);
      }
    });
  } else res.sendStatus(401);
});

app.get('/:wikiType/:wikiName/:rev', function (req, res) {
  var type = paramCheck(req.params.wikiType);
  var name = paramCheck(req.params.wikiName);
  var revision = req.params.rev;
  var userid = req.user.id;
  function createWiki (id,name,rev,url) {
    db.show('user', 'getUser', id, function (err, body) {
      if (err) {
        logError(err);
        return res.sendStatus(500);
      }
      var wikiCount = Object.keys(body._attachments).length;
      if (wikiCount === 2) {
        // Free accounts are restricted to 2 wikis only.
        // Tiers will be added later
        return res.sendStatus(204); // processed but ignored
      } else {
        request(url, function (error, response, data) {
          if (error) {
            logError(error);
            return res.sendStatus(500);
          }
          db.attachment.insert(id, name, data, 'text/html', { rev: rev }, function (err, body) {
            if (err) {
              logError(err);
              return res.sendStatus(500);
            }
            return res.sendStatus(200);
          });
        });
      }
    });
  };
  if (req.isAuthenticated()) {
    switch (type) {
      case 'empty': 
        createWiki(userid,name,revision,EMPTY_URL);
        break;
      default: res.sendStatus(404);
    }
  } else res.sendStatus(401);
});

// delete route
app.delete('/wiki/:name/:rev', function (req, res) {
  var name = req.params.name;
  var revision = req.params.rev;
  if (req.isAuthenticated()) {
    var userid = req.user.id;
    db.attachment.destroy(userid, name, { rev: revision }, function (err, body) {
      if (!err) {
        nano.db.compact('maarfapad',function (err, body) {
          if (err) logError('Error on compaction: '+ err);
        });
        res.sendStatus(200);
      } else {
        logError(err);
        res.sendStatus(500);
      }
    });
  } else res.sendStatus(401);
});

// send a doc snapshot for wikiManager
app.get('/user', function (req, res) {
  if (req.isAuthenticated()) {
    db.show('user', 'getUser', req.user.id, function (err, body) {
      if (!err) {
        res.send(body);
      } else {
        logError(err);
        res.sendStatus(500);
      }
    });
  } else res.sendStatus(401);
});

// handle options
app.options('/*', function (req, res) {
  res.header('Access-Control-Allow-Origin', config.appURL);
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, If-Match');
  res.header('Service-Worker-Allowed', '/wiki/');
  res.header('Cache-Control', 'private');
  res.sendStatus(200);
});

/**
* Error handlers
*/
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
