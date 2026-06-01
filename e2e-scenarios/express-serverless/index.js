const express = require("express");
const serverless = require("serverless-http");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

app.get("/", (req, res) => res.json({ status: "ok", time: Date.now() }));
app.post("/echo", (req, res) => res.json({ echo: req.body }));

exports.handler = serverless(app);
