var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  if(!req.user){
    res.render('index');
  }else{
    req.login(req.user, function(err) {
      if (err) { return next(err); }
      return res.redirect('/wiki/home');
    });
  }
});

module.exports = router;
