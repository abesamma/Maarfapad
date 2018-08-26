var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  res.render('signup',{message: req.flash('signup-info')});
});

module.exports = router;
