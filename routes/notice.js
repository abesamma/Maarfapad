var express = require('express');
var router = express.Router();

/* GET test notice page. */
router.get('/', function(req, res, next) {
  res.render('notice');
});

module.exports = router;
