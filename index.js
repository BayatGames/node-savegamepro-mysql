'use strict';
/**
 * Save Game Pro Cloud Node.js MySQL Database Support.
 *
 * @file Save Game Pro Cloud API for MySQL database.
 * @license MIT
 * @author Bayat
 */

const mysql = require('mysql');
const fs = require('fs-extra');
const path = require('path');

/**
 * Express Middleware
 * @param  {IncomingMessage}   request  The incomming request
 * @param  {ServerResponse}    response The response
 * @param  {Function}          next     The next callback
 * @return {void}                       Returns nothing
 */
module.exports = function (request, response, next) {
  if (request.method !== 'POST') {
    response.writeHead(400, 'Bad Request');
    response.end('Only POST requests are supported');
    return;
  }
  if (module.exports.config.secretKey !== request.body['secret-key']) {
    response.writeHead(400, 'Bad Request');
    response.end('The given secret key is invalid.');
    return;
  }
  if (!request.body.username) {
    response.writeHead(400, 'Bad Request');
    response.end('The given username is invalid.');
    return;
  }
  let action = module.exports.invalidAction;
  switch (request.body.action) {
    case 'getfileurl':
      action = module.exports.getFileUrl;
      break;
    case 'uploadfile':
      action = module.exports.uploadFile;
      break;
    case 'downloadfile':
      action = module.exports.downloadFile;
      break;
    case 'save':
      action = module.exports.save;
      break;
    case 'load':
      action = module.exports.load;
      break;
    case 'delete':
      action = module.exports.delete;
      break;
    case 'clear':
      action = module.exports.clear;
      break;
    default:
      action = module.exports.invalidAction;
      break;
  }
  let connection = mysql.createConnection({
    host: module.exports.config.database.host,
    user: module.exports.config.database.user,
    password: module.exports.config.database.password,
    port: module.exports.config.database.port
  });
  connection.connect((err) => {
    if (err) throw err;
    connection.query(`CREATE DATABASE IF NOT EXISTS ${module.exports.config.database.name}`, (err, results) => {
      if (err) throw err;
      connection.query(`USE ${module.exports.config.database.name}`, (err, results) => {
        if (err) throw err;
        connection.query(`CREATE TABLE IF NOT EXISTS users (
          ID bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY UNIQUE KEY COMMENT 'User Unique ID',
          username varchar(60) NOT NULL UNIQUE KEY COMMENT 'Username',
          password varchar(255) DEFAULT NULL COMMENT 'Password',
          type varchar(60) NOT NULL DEFAULT 'user' COMMENT 'Account Type',
          registered datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Registration Date'
        )`, (err, results) => {
          if (err) throw err;
          connection.query(`CREATE TABLE IF NOT EXISTS saves (
            ID bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY UNIQUE KEY COMMENT 'Data Unique ID',
            user_id bigint(20) UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Associated User ID',
            data_key varchar(255) DEFAULT NULL COMMENT 'Key (Identifier)',
            data_value longtext DEFAULT NULL COMMENT 'Value',
            FOREIGN KEY (user_id) REFERENCES users (ID) ON DELETE CASCADE ON UPDATE CASCADE
          )`, (err, results) => {
            if (err) throw err;
            module.exports.handleUser(request, response, connection, (user) => {
              action(request, response, connection, user, () => {
                connection.end();
              });
            });
          });
        });
      });
    });
  });
};

/**
 * The main configuration for database and Save Game Pro.
 * @type {Object}
 */
module.exports.config = {
  secretKey: '',
  uploadFolder: './uploads/',
  database: {
    host: 'localhost',
    user: 'root',
    password: '',
    name: 'savegamepro'
  }
};

/**
 * Handle the user
 * @param  {IncomingMessage}   request    The incoming request
 * @param  {ServerResponse}    response   The response
 * @param  {Connection}        connection The database connection
 * @param  {Function}          cb         The callback
 * @return {void}                         Returns nothing
 */
module.exports.handleUser = function (request, response, connection, cb) {
  module.exports.getUser(request, response, connection, (user) => {
    if (!user) {
      module.exports.createUser(request, response, connection, (user) => {
        if (cb) {
          cb(user);
        }
      });
    } else {
      if (cb) {
        cb(user);
      }
    }
  });
};

/**
 * Retrieves the user from database if exists.
 * @param  {IncomingMessage}   request    The incoming request
 * @param  {ServerResponse}    response   The response
 * @param  {Connection}        connection The database connection
 * @param  {Function}          cb         The callback
 * @return {void}                         Returns nothing
 */
module.exports.getUser = function (request, response, connection, cb) {
  connection.query(`SELECT * FROM users WHERE username='${request.body.username}' AND password='${request.body.password}'`, (err, results, fields) => {
    if (err) throw err;
    if (cb) {
      cb(results[0]);
    }
  });
};

/**
 * Creates new user and adds it to the database.
 * @param  {IncomingMessage}   request    The incoming request
 * @param  {ServerResponse}    response   The response
 * @param  {Connection}        connection The database connection
 * @param  {Function}          cb         The callback
 * @return {void}                         Returns nothing
 */
module.exports.createUser = function (request, response, connection, cb) {
  let now = new Date();
  connection.query(`INSERT INTO users (username, password, type, registered) VALUES ('${request.body.username}', '${request.body.password}', 'user', '${now}')`, (err, results, fields) => {
    if (err) throw err;
    module.exports.getUser(request, response, connection, cb);
  });
};

/**
 * Creates the upload folder if not exists.
 * @param  {IncomingMessage}   request  The incoming request
 * @param  {ServerResponse}    response The response
 * @param  {Db}                db       The database instance
 * @param  {Function}          cb       The callback
 * @return {void}                       Returns nothing
 */
module.exports.ensureUploadFolder = function (request, response, db, cb) {
  fs.ensureDir(module.exports.config.uploadFolder, cb);
};

/**
 * Gets file url for the given file.
 * @param  {IncomingMessage}   request  The incoming request
 * @param  {ServerResponse}    response The response
 * @param  {Db}                db       The database instance
 * @param  {Object}            user     The user
 * @param  {Function}          cb       The callback
 * @return {void}                       Returns nothing
 */
module.exports.getFileUrl = function (request, response, db, user, cb) {
  let fileName = request.body['file-name'] || request.body['data-key'];
  module.exports.ensureUploadFolder(request, response, db, (err) => {
    if (err) throw err;
    let url = request.protocol + '://' + request.get('host') + request.originalUrl;
    url += path.resolve(module.exports.config.uploadFolder, request.body.username, fileName).replace(process.cwd(), '').replace(/[\\]/g, '/');
    response.writeHead(200, 'OK');
    response.end(url);
    if (cb) {
      cb(request, response, db, user);
    }
  });
};

/**
 * Uploads the file to the upload folder.
 * @param  {IncomingMessage}   request  The incoming request
 * @param  {ServerResponse}    response The response
 * @param  {Db}                db       The database instance
 * @param  {Object}            user     The user
 * @param  {Function}          cb       The callback
 * @return {void}                       Returns nothing
 */
module.exports.uploadFile = function (request, response, db, user, cb) {
  let fileName = request.body['file-name'] ? request.body['file-name'] : request.body['data-key'];
  let filePath = path.resolve(module.exports.config.uploadFolder, request.body.username, fileName);
  module.exports.ensureUploadFolder(request, response, db, (err) => {
    if (err) throw err;
    fs.move(request.file.path, filePath, { overwrite: true }, (err) => {
      if (err) throw err;
      response.writeHead(200, 'OK');
      response.end("File Uploaded Successfully");
      if (cb) {
        cb(request, response, db, user);
      }
    });
  });
};

/**
 * Downloads the file from upload folder.
 * @param  {IncomingMessage}   request  The incoming request
 * @param  {ServerResponse}    response The response
 * @param  {Db}                db       The database instance
 * @param  {Object}            user     The user
 * @param  {Function}          cb       The callback
 * @return {void}                       Returns nothing
 */
module.exports.downloadFile = function (request, response, db, user, cb) {
  let fileName = request.body['file-name'] || request.body['data-key'];
  let filePath = path.resolve(module.exports.config.uploadFolder, request.body.username, fileName);
  module.exports.ensureUploadFolder(request, response, db, (err) => {
    if (err) throw err;
    response.download(filePath);
    if (cb) {
      cb(request, response, db, user);
    }
  });
};

/**
 * Saves the data using the request form data.
 * @param  {IncomingMessage}   request    The incoming request
 * @param  {ServerResponse}    response   The response
 * @param  {Connection}        connection The database connection
 * @param  {Object}            user       The user
 * @param  {Function}          cb         The callback
 * @return {void}                         Returns nothing
 */
module.exports.save = function (request, response, connection, user, cb) {
  let key = request.body['data-key'];
  let value = request.body['data-value'];
  connection.query(`SELECT * FROM saves WHERE user_id='${user.ID}' AND data_key='${key}'`, (err, results, fields) => {
    if (err) throw err;
    if (results && results.length > 0) {
      connection.query(`UPDATE saves SET data_value='${value}' WHERE user_id='${user.ID}' AND data_key='${key}'`, (err, results, fields) => {
        if (err) throw err;
        response.writeHead(200, 'OK');
        response.end('Data Saved Successfully');
        if (cb) {
          cb(request, response, connection, user);
        }
      });
    } else {
      connection.query(`INSERT INTO saves (user_id, data_key, data_value) VALUES('${user.ID}', '${key}', '${value}')`, (err, results, fields) => {
        if (err) throw err;
        response.writeHead(200, 'OK');
        response.end('Data Saved Successfully');
        if (cb) {
          cb(request, response, connection, user);
        }
      });
    }
  });
};

/**
 * Loads data for the corresponding user.
 * @param  {IncomingMessage}   request    The incoming request
 * @param  {ServerResponse}    response   The response
 * @param  {Connection}        connection The database connection
 * @param  {Object}            user       The user
 * @param  {Function}          cb         The callback
 * @return {void}                         Returns nothing
 */
module.exports.load = function (request, response, connection, user, cb) {
  let key = request.body['data-key'];
  let value = request.body['data-value'];
  connection.query(`SELECT * FROM saves WHERE user_id='${user.ID}' AND data_key='${key}'`, (err, results, fields) => {
    if (err) throw err;
    if (results && results.length > 0) {
      response.writeHead(200, 'OK');
      response.end(results[0].data_value);
    } else {
      response.writeHead(404, 'Not Found');
      response.end('The data for the given user and the specified identifier not found.');
    }
    if (cb) {
      cb(request, response, connection, user);
    }
  });
};

/**
 * Deletes the specified identifier in the user saves.
 * @param  {IncomingMessage}   request    The incoming request
 * @param  {ServerResponse}    response   The response
 * @param  {Connection}        connection The database connection
 * @param  {Object}            user       The user
 * @param  {Function}          cb         The callback
 * @return {void}                         Returns nothing
 */
module.exports.delete = function (request, response, connection, user, cb) {
  let key = request.body['data-key'];
  connection.query(`DELETE FROM saves WHERE user_id='${user.ID}' AND data_key='${key}'`, (err, results, fields) => {
    if (err) throw err;
    response.writeHead(200, 'OK');
    response.end('Data Deleted Successfully');
    if (cb) {
      cb(request, response, connection, user);
    }
  });
};

/**
 * Clears the user data.
 * @param  {IncomingMessage}   request    The incoming request
 * @param  {ServerResponse}    response   The response
 * @param  {Connection}        connection The database connection
 * @param  {Object}            user       The user
 * @param  {Function}          cb         The callback
 * @return {void}                         Returns nothing
 */
module.exports.clear = function (request, response, connection, user, cb) {
  connection.query(`DELETE FROM saves WHERE user_id='${user.ID}'`, (err, results, fields) => {
    if (err) throw err;
    response.writeHead(200, 'OK');
    response.end('User Data Cleared Successfully');
    if (cb) {
      cb(request, response, connection, user);
    }
  });
};

/**
 * Responses with invalid action message and terminates the response.
 * @param  {IncomingMessage}   request    The incoming request
 * @param  {ServerResponse}    response   The response
 * @param  {Connection}        connection The database connection
 * @param  {Object}            user       The user
 * @param  {Function}          cb         The callback
 * @return {void}                         Returns nothing
 */
module.exports.invalidAction = function (request, response, connection, user, cb) {
  response.writeHead(400, 'Bad Request');
  response.end('The given action is invalid.');
  if (cb) {
    cb(request, response, connection, user);
  }
};
