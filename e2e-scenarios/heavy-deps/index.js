const axios = require("axios");
const moment = require("moment");
const _ = require("lodash");
const cheerio = require("cheerio");
const jwt = require("jsonwebtoken");

exports.handler = async (event) => {
  const token = jwt.sign({ user: "demo", iat: moment().unix() }, "secret", { expiresIn: "1h" });
  const sorted = _.sortBy([5, 3, 8, 1, 9, 2], (x) => x);
  const $ = cheerio.load("<h1>Hello</h1>");

  return {
    statusCode: 200,
    body: JSON.stringify({
      time: moment().format("YYYY-MM-DD HH:mm:ss"),
      token,
      sorted,
      title: $("h1").text(),
    }),
  };
};
