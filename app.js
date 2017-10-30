const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const saveGamePro = require('./');

saveGamePro.config.secretKey = 'MyCustomSecretKey';
saveGamePro.config.database.host = 'localhost';
saveGamePro.config.database.user = 'root';
saveGamePro.config.database.password = '';
saveGamePro.config.database.name = 'savegamepro';

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.post('/savegamepro', saveGamePro);
app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
