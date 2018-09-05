var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  res.redirect('https://dynalist.io/d/zUP-nIWu2FFoXH-oM7L7d9DM');
});

module.exports = router;
