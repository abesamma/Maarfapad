var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  req.logOut();
  res.clearCookie('m|pad');
  res.render('login',{message: req.flash('info')});
});

module.exports = router;
