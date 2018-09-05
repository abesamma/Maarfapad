var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  res.render('recovery',{message: req.flash('recovery-info')});
});

module.exports = router;
