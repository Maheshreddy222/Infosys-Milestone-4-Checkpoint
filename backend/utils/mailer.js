// Sends real email FROM checkpoint.noreply@gmail.com (or whichever
// account is configured) via Gmail SMTP, using nodemailer.
//
// Requires two env vars in backend/.env:
//   EMAIL_USER=checkpoint.noreply@gmail.com
//   EMAIL_PASS=<a Gmail App Password — NOT the normal account password;
//               generate one at https://myaccount.google.com/apppasswords,
//               which requires 2-Step Verification to be enabled first>
//
// If those aren't set, sendMail() throws EMAIL_NOT_CONFIGURED so callers
// can fall back gracefully (see sponsors.controller.js#contactSponsor).

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  return transporter;
}

function isConfigured() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

async function sendMail({ to, subject, text }) {
  const t = getTransporter();
  if (!t) {
    const err = new Error('Email is not configured (missing EMAIL_USER/EMAIL_PASS)');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }
  await t.sendMail({
    from: `"Checkpoint" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
  });
}

module.exports = { sendMail, isConfigured };
