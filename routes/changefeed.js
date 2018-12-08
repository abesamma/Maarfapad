var express = require('express');
var router = express.Router();

router.get('/', function (req, res) {
    res.sendStatus(410);
});

module.exports = router;
