var express = require('express');
var path = require('path');
var request = require('request');
var shortid = require('shortid');
var logger = require('morgan');
var session = require('express-session');
var MemoryStore = require('memorystore')(session);
var bodyParser = require('body-parser');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var auth = require('passport-local-authenticate');
var flash = require('connect-flash');
var nodemailer = require("nodemailer");
var helmet = require('helmet');
var emailCheck = require('email-check');
var config = require('./config/secret.json');

// require routes
var index = require('./routes/index');
var signup = require('./routes/signup');
var login = require('./routes/login');
var account = require('./routes/account');
var recovery = require('./routes/recovery');
var notice = require('./routes/notice');
var about = require('./routes/about');

// prepare database drive
var nano = require('nano')(config.database);
var db = nano.db.use('maarfapad');

var app = express();
app.use(helmet());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use('/wiki/favicon.ico',express.static(__dirname + '/public' + '/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.raw({ type: 'text/html', limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new MemoryStore({
    checkPeriod: 86400000,
    stale: true
  }),
  name: 'm|pad',
  secret: config.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 4.32e+8
  } }));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

const EMPTY_URL = 'https://cdn.rawgit.com/abesamma/TW5-editions/e387d7fe/empty.html'

// configure local strategy for passport authentication
passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password',
  passReqToCallback: true
},
  function(req,username,password,done){
      db.view('user','verify',{
          'key': username
      },function(err,body){
          if(err){
              return done(err);
          }else{
              if(body.rows.length === 0){
                return done(null,false,req.flash('info','Incorrect email'));
              }
              body.rows.forEach(function(user){
                  auth.verify(password,user.value,function(err,verified){
                    if(verified === false){
                      return done(null,false,req.flash('info','Incorrect password'));
                    }
                    if(verified === true){
                      return done(null,user);
                    }
                  });
              });
          }
      });
  }
));

// serialise to session
passport.serializeUser(function(user,done){
  done(null,user.key);
});
// deserialise user
passport.deserializeUser(function(id,done){
  db.view('user','verify',{ 'key': id },function(err,body){
    if(!err){
      body.rows.forEach(function(user){
        done(err,user);
      });
    }
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
app.use('/notice', notice);
app.use('/about', about);

// create a user account then redirect to index page
app.post('/create_user',function(req,res,next){
  db.view('user','email',{include_docs: false},function(err,body){
    if(!err){
      // check user limit during testing period. To be removed later
      if(body.total_rows < 21){
        var id = shortid.generate();
        // check for account duplicate
        db.view('user','verify',{
          'key': req.body.email
        },function(err,body){
          if(!err){
            if(body.rows.length > 0){
              res.send(`<p>That email already exists<p><a href='/signup'>Go back</a>`);
            }else{
              const mailOptions = {
                from: 'Maarfapad project <info@maarfapad.xyz>',
                to: req.body.email,
                subject: 'Maarfapad sign up',
                html: `<p>You are all set!</p><p>If you're an early tester <a href='https://cdn.rawgit.com/abesamma/TW5-editions/86ace22f/Early%20Testers.html'>please read this.</a></p> <a href='http://maarfapad.com'>Click here</a> to login</p>`
              };
              // check if email address exists and can receive emails
              emailCheck(req.body.email)
              .then((result) => {
                if(result === true){
                  // hash and salt pass
                  auth.hash(req.body.password,function(err,hashed){
                    req.body.password = hashed; // replace plain pass with hashed pass
                    request(EMPTY_URL,function(error,resp,data){
                      if(resp.statusMessage === 'OK'){
                        if(!error){
                          db.multipart.insert(
                          req.body,
                          [{name: 'home',data: data,content_type: 'text/html'}],
                          id,
                          function(err,body){
                            if(!err){
                              // email to confirm successful action
                              return smtpTransport.sendMail(mailOptions,function(err,response){
                                if(!err){
                                  // redirect to login page if successful
                                  res.redirect('/login');
                                }else{
                                  console.log(err);
                                  res.send('Error:' + err.message + `<br><a href='/signup'>Go back</a>`);
                                }
                              });
                            }
                          });
                        }else{
                          console.log(error);
                          res.send('Error:' + err.message + `<br><a href='/signup'>Go back</a>`);
                        }
                      }else{
                        res.send(`<p>Something went wrong. Please try again later.</p><br><a href='/signup'>Go back</a>`);
                      }
                    });
                  });
                }else{
                  res.send(`<p>Something's wrong with the email you supplied. Please try again.</p><br><a href='/signup'>Go back</a>`)
                }
              }).catch((err) => {
                console.log(err);
                res.send('Error:' + err.message + `<br><a href='/signup'>Go back</a>`);
              });
            }
          }
        });
      }else{
        res.redirect('/notice');
      }
    }else{
      next(err);
    }
  });
});

// change email
app.post('/change_email',function(req,res){
  if(req.user){
    var id = req.user.id
    var data = req.body.newemail;
    db.view('user','verify',{ 'key': data },function(err,body){
      if(body.rows.length > 0){
        res.send(`<p id='flash'>That email is already in use by another account</p><br><a href='/account'>Go back</a>`);
      }else{
        db.atomic('user','updateEmail',id,{value: data},function(err,body){
          if(!err){
            req.session.destroy(function(err){
              res.redirect('/login');
            });
          }else{
            res.send(`<p id='flash'>Something went wrong. Please try again later</p>`);
          }
        });
      }
    });
  }
});

// change password
app.post('/change_password',function(req,res){
  if(req.user){
    var id = req.user.id
    var verify = req.body.verifypass
    var _new = req.body.newpass
    if(_new === verify){
      auth.hash(_new,function(err,hashed){
        db.atomic('user','updatePass',id,{value: hashed},function(err,body){
          if(!err){
            res.send(`<p>Password change successful</p><br><a href='/'>Go back home</a>`);
          }else{
            res.send(`<p id='flash'>Something went wrong. Please try again later</p>`);
          }
        });
      });
    }
  }
});

// reset password
app.post('/reset',function(req,res){
  var resetPass = shortid.generate();
  db.view('user','verify',{
    'key': req.body.email
  },function(err,body){
    if(!err){
      if(body.rows.length === 1){
        var userID = body.rows[0].id;
        // prepare email to send
        var mail = {
          from: 'info@maarfapad.xyz',
          to: req.body.email,
          subject: 'Maarfapad password reset',
          html: `<p>Here's your reset password: ${resetPass}</p><p><a href='http://maarfapad.com'>Click here</a> to login</p>`
        };
        // send recovery email
        smtpTransport.sendMail(mail,function(err,response){
          if(!err){
            res.send('<p>A recovery email has been send to your address. Check your mail</p>');
          }else{
            res.send(`<p>Something went wrong. Email not sent because: ${err.message}.</p><a href='/'>Go to home</a>`);
          }
        });
        auth.hash(resetPass,function(err,hashed){
          db.atomic('user','updatePass',userID,{value: hashed},function(err,body){
            if(!err){
              return
            }else{
              console.log(err);
            }
          });
        });
      }else{
        return res.send('<p>Sorry, there is no account associated with that email address</p>')
      }
    }
  });
});

// user login to home.html
app.post('/wiki/home',passport.authenticate('local',{
  failureRedirect: '/login',
  failureFlash: true
}),function(req,res){
  db.attachment.get(req.user.id,'home',function(err,body){
    if(!err){
      res.writeHead(200, {
        'Content-Type': 'text/html'
      });
      res.write(body);
      res.end();
    }
  });
});

// account deletion
app.get('/delete_account',function(req,res){
  if(req.user){
    db.show('user','getUser',req.user.id,function(err,body){
      if(!err){
        var docRev = body._rev;
        db.destroy(req.user.id,docRev,function(err,body){
          if(!err){
            console.log(body);
            req.session.destroy(function(err){
              res.redirect('/login');
            });
          }else{
            console.log(err);
            res.send(500,'Server error. Please try again later.');
          }
        });
      }else{
        console.log(err);
        res.send(500,'Server error. Please try again later.');
      }
    });
  }
});

/*
 *Below are the api routes for maarfapad a la tiddlywiki to use
 */
app.get('/wiki/:name',function(req,res){
  var name = req.params.name
  if(req.user){
    var userid = req.user.id
    db.attachment.get(userid,name,function(err,body){
      if(!err){
        res.writeHead(200,{
          'Content-Type': 'text/html'
        });
        res.write(body);
        res.end();
      }
    });
  }else{
    res.redirect('/');
  }
});

app.put('/wiki/:name/:rev',function(req,res){
  var name = req.params.name
  var revision = req.params.rev;
  if(req.user){
    var userid = req.user.id
    db.attachment.insert(userid,name,req.body,'text/html',{rev: revision},function(err,body){
      if(!err){
        res.sendStatus(200);
      }else if(err.statusCode === 413){
        res.sendStatus(413); // request file is too big
        console.log(err);
      }else{
        console.log(err);
      }
    });
  }
});

app.get('/:wikiType/:wikiName/:rev',function(req,res){
  // var type = req.params.wikiType + '.html'
  var name = req.params.wikiName;
  var revision = req.params.rev;
  if(req.user){
    var userid = req.user.id
    db.show('user','getUser',userid,function(err,body){
      if(!err){
        var wikiCount = Object.keys(body._attachments).length;
        if(wikiCount === 2){
          return res.sendStatus(204); // processed but ignored
        }else{
          request(EMPTY_URL,function(error,response,data){
            if(!error){
              db.attachment.insert(userid,name,data,'text/html',{rev: revision},function(err,body){
                if(!err){
                  res.sendStatus(200);
                }else{
                  console.log(err);
                }
              });
            }else{
              console.log(error);
            }
          });
        }
      }else{
        console.log(err);
      }
    });
  }
});

// delete route
app.delete('/wiki/:name/:rev',function(req,res){
  var name = req.params.name;
  var revision = req.params.rev;
  if(req.user){
    var userid = req.user.id;
    db.attachment.destroy(userid,name,{rev: revision},function(err,body){
      if(!err){
        res.sendStatus(200);
      }else{
        console.log(err);
      }
    });
  }
});

// send a doc snapshot for wikiManager
app.get('/user',function(req,res){
  if(req.user){
    var userid = req.user.id;
    db.show('user','getUser',req.user.id,function(err,body){
      if(!err){
        res.send(body);
      }else{
        console.log(err);
      }
    });
  }
});

// handle options
app.options('/*',function(req,res){
  res.header('Access-Control-Allow-Origin', config.appURL);
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, If-Match');
  res.sendStatus(200);
});

 /**
 * Error handlers
 */
// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
