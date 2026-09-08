const QRCode = require('qrcode');

// Returns a base64 data URL the frontend can drop straight into an <img src="">
async function generateQrDataUrl(payload) {
  return QRCode.toDataURL(payload, {
    margin: 1,
    width: 240,
    color: { dark: '#181b26', light: '#ffffff' },
  });
}

module.exports = { generateQrDataUrl };
