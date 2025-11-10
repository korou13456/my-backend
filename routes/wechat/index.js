const express = require("express");
const router = express.Router();
const {
  buildSignature,
  buildMsgSignature,
  aesDecrypt,
} = require("../../utils/wechatVerify");

// GET /wechat - 微信服务器URL校验
router.get("/", (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query || {};
  const token = process.env.WECHAT_TOKEN;
  if (!signature || !timestamp || !nonce || !echostr || !token) {
    return res.status(400).send("bad request");
  }
  const expect = buildSignature(token, timestamp, nonce);
  if (expect === signature) {
    return res.send(echostr);
  }
  return res.status(401).send("invalid signature");
});

// POST /wechat - 微信消息推送（支持 JSON/XML，安全模式）
router.post("/", (req, res) => {
  const token = process.env.WECHAT_TOKEN;
  const encodingAesKey = process.env.WECHAT_ENCODING_AES_KEY;
  if (!token || !encodingAesKey) {
    return res.status(500).send("server misconfigured");
  }

  const { timestamp, nonce, msg_signature } = req.query || {};
  const contentType = (req.headers["content-type"] || "").toLowerCase();
  const isXml = contentType.includes("xml");

  let encrypt = "";
  if (isXml) {
    // WeChat XML: <xml><Encrypt><![CDATA[...]]></Encrypt></xml>
    const raw = (req.rawBody || Buffer.from("")).toString("utf8");
    const match =
      raw.match(/<Encrypt><!\[CDATA\[(.+?)\]\]><\/Encrypt>/i) ||
      raw.match(/<Encrypt>([^<]+)<\/Encrypt>/i);
    if (match) {
      encrypt = match[1].trim();
    }
  } else {
    const body = req.body || {};
    encrypt = body.Encrypt || body.encrypt || "";
  }

  if (!timestamp || !nonce || !msg_signature || !encrypt) {
    return res.status(400).send("bad request");
  }

  const expect = buildMsgSignature(token, timestamp, nonce, encrypt);
  if (expect !== msg_signature) {
    return res.status(401).send("invalid msg_signature");
  }

  try {
    const { msg } = aesDecrypt(encrypt, encodingAesKey);
    // 这里可以根据你的业务做路由分发
    // const parsed = JSON.parse(msg)  // 若你配置了 JSON
    return res.send("success");
  } catch (e) {
    return res.status(400).send("decrypt failed");
  }
});

module.exports = router;
