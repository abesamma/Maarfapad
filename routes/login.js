var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  req.logOut();
  res.clearCookie('m|pad', { path: '/' });
  res.clearCookie('mpad-offline', { path: '/' });
  res.clearCookie('mpad-offline', { path: '/wiki/' });
  res.render('login',{message: req.flash('login-info')});
});

module.exports = router;
