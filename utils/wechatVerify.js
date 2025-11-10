const crypto = require("crypto");

function sha1Hex(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function buildSignature(token, timestamp, nonce) {
  const arr = [token, timestamp, nonce].sort();
  return sha1Hex(arr.join(""));
}

function buildMsgSignature(token, timestamp, nonce, encrypt) {
  const arr = [token, timestamp, nonce, encrypt].sort();
  return sha1Hex(arr.join(""));
}

function pkcs7Unpad(buffer) {
  const pad = buffer[buffer.length - 1];
  if (pad < 1 || pad > 32) return buffer;
  return buffer.slice(0, buffer.length - pad);
}

function aesDecrypt(encryptBase64, encodingAesKey) {
  // 43-char key -> pad '=' to 44 and base64 decode to 32 bytes key
  const aesKey = Buffer.from(encodingAesKey + "=", "base64");
  const iv = aesKey.slice(0, 16);
  const cipherText = Buffer.from(encryptBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([
    decipher.update(cipherText),
    decipher.final(),
  ]);
  decrypted = pkcs7Unpad(decrypted);

  // Structure: 16B random + 4B msg_len + msg + appid
  const content = decrypted.slice(16);
  const msgLen = content.readUInt32BE(0);
  const msg = content.slice(4, 4 + msgLen);
  const appId = content.slice(4 + msgLen).toString("utf8");
  return { msg: msg.toString("utf8"), appId };
}

module.exports = {
  buildSignature,
  buildMsgSignature,
  aesDecrypt,
};
